import { assertEquals } from 'jsr:@std/assert@1'
import {
  authorizeUrl,
  classifySport,
  deriveWebhookVerifyToken,
  devSignUser,
  handleStravaAuth,
  handleStravaWebhook,
  planActivity,
  STRAVA_REDIRECT_URI,
  STRAVA_SCOPE,
  verifyState,
  type Store,
  type StravaActivity,
  type StravaToken,
} from './logic.ts'

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const STRAVA_SECRET = 'strava-client-secret-not-real'
const VERIFY = 'webhook-verify-token'
const USER = 'U' + 'a'.repeat(32)

function env(): { get(name: string): string | undefined } {
  const values: Record<string, string> = {
    JWT_SECRET: SECRET,
    STRAVA_CLIENT_SECRET: STRAVA_SECRET,
    STRAVA_CLIENT_ID: '295868',
    STRAVA_WEBHOOK_VERIFY_TOKEN: VERIFY,
  }
  return { get: (name) => values[name] }
}

function memoryStore(): Store & { applied: Record<string, unknown>[]; removed: string[] } {
  const tokens: StravaToken[] = []
  const states: { nonce: string; line: string; exp: string; used: boolean }[] = []
  const applied: Record<string, unknown>[] = []
  const removed: string[] = []
  return {
    applied,
    removed,
    async putToken(row) {
      const idx = tokens.findIndex((item) => item.line_user_id === row.line_user_id)
      if (idx >= 0) tokens[idx] = row
      else tokens.push(row)
    },
    async getToken(query) {
      return tokens.find((item) =>
        query.line_user_id ? item.line_user_id === query.line_user_id : item.athlete_id === query.athlete_id
      ) || null
    },
    async deleteToken(query) {
      const idx = tokens.findIndex((item) =>
        query.line_user_id ? item.line_user_id === query.line_user_id : item.athlete_id === query.athlete_id
      )
      if (idx >= 0) tokens.splice(idx, 1)
    },
    async touchSync(lineUserId) {
      const token = tokens.find((item) => item.line_user_id === lineUserId)
      if (token) token.last_sync_at = new Date().toISOString()
    },
    async putState(nonce, lineUserId, expiresAt) {
      states.push({ nonce, line: lineUserId, exp: expiresAt, used: false })
    },
    async consumeState(nonce, lineUserId) {
      const row = states.find((item) => item.nonce === nonce && item.line === lineUserId && !item.used)
      if (!row || new Date(row.exp).getTime() <= Date.now()) return false
      row.used = true
      return true
    },
    async context() {
      return {
        bikes: [{ id: 'bike-1', name: 'Madone', archived: false }],
        wheelsets: [{ id: 'wheel-1', bike_id: 'bike-1', mounted: true }],
        last_bike_id: null,
        last_wheel_id: null,
      }
    },
    async apply(row) {
      const prev = applied.find((item) => item.external_id === row.external_id)
      if (prev) {
        prev.distance_km = row.distance_km
        return { status: 'updated' }
      }
      applied.push({ ...row })
      return { status: row.assign ? 'assigned' : 'pending' }
    },
    async removeActivity(_line, externalId) {
      removed.push(externalId)
      const idx = applied.findIndex((item) => item.external_id === externalId)
      if (idx >= 0) applied.splice(idx, 1)
    },
  }
}

function jsonFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (input, init) => {
    const url = String(input)
    if (url.includes('/oauth/token') || url.includes('/oauth/deauthorize')) {
      const body = String(init?.body || '')
      if (body.includes('client_secret=')) {
        // The secret is sent, but tests never print the request.
      }
      return new Response(JSON.stringify({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        scope: STRAVA_SCOPE,
        athlete: { id: 4242 },
      }), { status: 200 })
    }
    if (url.includes('/api/v3/athlete/activities')) {
      return new Response(JSON.stringify(routes.list || []), { status: 200 })
    }
    if (url.includes('/api/v3/athlete')) {
      return new Response(JSON.stringify({ bikes: [{ id: 'g1', name: 'Madone' }] }), { status: 200 })
    }
    if (url.includes('/api/v3/activities/')) {
      return new Response(JSON.stringify(routes.activity), { status: 200 })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch
}

Deno.test('start returns a clean 500 when the backend fails', async () => {
  const store = memoryStore()
  store.putState = async () => {
    throw new Error('secret-access-token-leak nonce=private')
  }
  const user = await devSignUser(USER, SECRET)
  const started = await handleStravaAuth(
    new Request('https://example.test/strava-auth', {
      method: 'POST',
      headers: { authorization: `Bearer ${user}` },
      body: JSON.stringify({ action: 'start' }),
    }),
    env(),
    jsonFetch({}),
    store,
  )
  const text = await started.text()
  assertEquals(started.status, 500)
  assertEquals(text, '{"error":"server_error"}')
  assertEquals(text.includes('secret-access'), false)
  assertEquals(text.includes('nonce'), false)
})

Deno.test('oauth state is tied to the rider and rejects another rider or a bad signature', async () => {
  const store = memoryStore()
  const user = await devSignUser(USER, SECRET)
  const started = await handleStravaAuth(
    new Request('https://example.test/strava-auth', {
      method: 'POST',
      headers: { authorization: `Bearer ${user}` },
      body: JSON.stringify({ action: 'start' }),
    }),
    env(),
    jsonFetch({}),
    store,
  )
  const startBody = await started.json()
  const url = new URL(startBody.url)
  assertEquals(url.origin + url.pathname, 'https://www.strava.com/oauth/authorize')
  assertEquals(url.searchParams.get('client_id'), '295868')
  assertEquals(url.searchParams.get('redirect_uri'), STRAVA_REDIRECT_URI)
  assertEquals(url.searchParams.get('scope'), STRAVA_SCOPE)
  assertEquals(url.searchParams.get('response_type'), 'code')
  const state = url.searchParams.get('state') || ''
  assertEquals(await verifyState(state, STRAVA_SECRET, USER) !== null, true)
  assertEquals(await verifyState(state, STRAVA_SECRET, 'U' + 'b'.repeat(32)), null)
  assertEquals(await verifyState(state.slice(0, -2) + 'aa', STRAVA_SECRET, USER), null)
  const other = await devSignUser('U' + 'b'.repeat(32), SECRET)
  const rejected = await handleStravaAuth(
    new Request('https://example.test/strava-auth', {
      method: 'POST',
      headers: { authorization: `Bearer ${other}` },
      body: JSON.stringify({ action: 'exchange', code: 'code-1', state }),
    }),
    env(),
    jsonFetch({}),
    store,
  )
  assertEquals(rejected.status, 400)
})

Deno.test('exchange stores a connection without returning the token, and a second use of state fails', async () => {
  const store = memoryStore()
  const user = await devSignUser(USER, SECRET)
  const started = await handleStravaAuth(
    new Request('https://example.test/strava-auth', {
      method: 'POST',
      headers: { authorization: `Bearer ${user}` },
      body: JSON.stringify({ action: 'start' }),
    }),
    env(),
    jsonFetch({ list: [] }),
    store,
  )
  const state = new URL((await started.json()).url).searchParams.get('state')
  const exchanged = await handleStravaAuth(
    new Request('https://example.test/strava-auth', {
      method: 'POST',
      headers: { authorization: `Bearer ${user}` },
      body: JSON.stringify({ action: 'exchange', code: 'code-1', state }),
    }),
    env(),
    jsonFetch({ list: [] }),
    store,
  )
  const body = await exchanged.json()
  assertEquals(exchanged.status, 200)
  assertEquals(body.connected, true)
  assertEquals(body.athlete_id, 4242)
  assertEquals('access_token' in body, false)
  assertEquals('refresh_token' in body, false)
  const again = await handleStravaAuth(
    new Request('https://example.test/strava-auth', {
      method: 'POST',
      headers: { authorization: `Bearer ${user}` },
      body: JSON.stringify({ action: 'exchange', code: 'code-1', state }),
    }),
    env(),
    jsonFetch({ list: [] }),
    store,
  )
  assertEquals(again.status, 400)
  const status = await handleStravaAuth(
    new Request('https://example.test/strava-auth', {
      method: 'POST',
      headers: { authorization: `Bearer ${user}` },
      body: JSON.stringify({ action: 'status' }),
    }),
    env(),
    jsonFetch({}),
    store,
  )
  const statusBody = await status.json()
  assertEquals(statusBody.connected, true)
  assertEquals('access_token' in statusBody, false)
})

Deno.test('webhook verify token is derived from the client secret when unset', async () => {
  assertEquals(await deriveWebhookVerifyToken('strava-client-secret-not-real'), '63a96339967a2e1e09506604ae3c24c1')
  const derivedEnv = {
    get: (name: string) => ({
      JWT_SECRET: SECRET,
      STRAVA_CLIENT_SECRET: STRAVA_SECRET,
      STRAVA_CLIENT_ID: '295868',
    }[name]),
  }
  const store = memoryStore()
  const ok = await handleStravaWebhook(
    new Request('https://example.test/strava-webhook?hub.mode=subscribe&hub.verify_token=63a96339967a2e1e09506604ae3c24c1&hub.challenge=derived'),
    derivedEnv,
    jsonFetch({}),
    store,
  )
  assertEquals(ok.status, 200)
  assertEquals(await ok.json(), { 'hub.challenge': 'derived' })
  const bad = await handleStravaWebhook(
    new Request('https://example.test/strava-webhook?hub.mode=subscribe&hub.verify_token=not-the-derived-token&hub.challenge=derived'),
    derivedEnv,
    jsonFetch({}),
    store,
  )
  assertEquals(bad.status, 403)
})

Deno.test('webhook validation echoes the challenge only for the verify token', async () => {
  const store = memoryStore()
  const ok = await handleStravaWebhook(
    new Request(`https://example.test/strava-webhook?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=abc123`),
    env(),
    jsonFetch({}),
    store,
  )
  assertEquals(ok.status, 200)
  assertEquals(await ok.json(), { 'hub.challenge': 'abc123' })
  const bad = await handleStravaWebhook(
    new Request('https://example.test/strava-webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc123'),
    env(),
    jsonFetch({}),
    store,
  )
  assertEquals(bad.status, 403)
})

Deno.test('webhook imports a ride once, asks before an indoor ride, and ignores a run', async () => {
  const store = memoryStore()
  await store.putToken({
    line_user_id: USER,
    athlete_id: 4242,
    access_token: 'access-1',
    refresh_token: 'refresh-1',
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
    scope: STRAVA_SCOPE,
    last_sync_at: null,
  })
  async function post(activity: StravaActivity, aspect = 'create') {
    return handleStravaWebhook(
      new Request('https://example.test/strava-webhook', {
        method: 'POST',
        body: JSON.stringify({
          object_type: 'activity',
          aspect_type: aspect,
          object_id: activity.id,
          owner_id: 4242,
          updates: {},
        }),
      }),
      env(),
      jsonFetch({ activity }),
      store,
    )
  }
  const ride: StravaActivity = {
    id: 99,
    sport_type: 'Ride',
    name: '河濱',
    distance: 42000,
    start_date_local: '2026-11-08T06:30:00+08:00',
    gear_id: null,
  }
  assertEquals((await post(ride)).status, 200)
  assertEquals((await post(ride)).status, 200)
  assertEquals(store.applied.filter((row) => row.external_id === '99').length, 1)
  assertEquals(store.applied[0].assign, true)
  assertEquals(store.applied[0].distance_km, 42)
  const indoor: StravaActivity = {
    id: 100,
    sport_type: 'VirtualRide',
    distance: 15000,
    start_date_local: '2026-11-09T20:00:00+08:00',
  }
  await post(indoor)
  assertEquals(store.applied.find((row) => row.external_id === '100')?.assign, false)
  assertEquals(store.applied.find((row) => row.external_id === '100')?.ask_chain, true)
  await post({ id: 101, sport_type: 'Run', distance: 5000, start_date_local: '2026-11-09T07:00:00+08:00' })
  assertEquals(store.applied.some((row) => row.external_id === '101'), false)
  await post({ ...ride, distance: 45000 }, 'update')
  assertEquals(store.applied.find((row) => row.external_id === '99')?.distance_km, 45)
  await handleStravaWebhook(
    new Request('https://example.test/strava-webhook', {
      method: 'POST',
      body: JSON.stringify({ object_type: 'activity', aspect_type: 'delete', object_id: 99, owner_id: 4242, updates: {} }),
    }),
    env(),
    jsonFetch({}),
    store,
  )
  assertEquals(store.removed.includes('99'), true)
  await handleStravaWebhook(
    new Request('https://example.test/strava-webhook', {
      method: 'POST',
      body: JSON.stringify({ object_type: 'athlete', aspect_type: 'update', object_id: 4242, owner_id: 4242, updates: { authorized: 'false' } }),
    }),
    env(),
    jsonFetch({}),
    store,
  )
  assertEquals(await store.getToken({ athlete_id: 4242 }), null)
})

Deno.test('sport filter and single-bike auto assign match the garage rules', () => {
  assertEquals(classifySport('GravelRide').action, 'import')
  assertEquals(classifySport('MountainBikeRide').indoor, false)
  assertEquals(classifySport('EBikeRide').action, 'import')
  assertEquals(classifySport('VirtualRide').askChain, true)
  assertEquals(classifySport('Swim').action, 'ignore')
  const pending = planActivity({
    sport: 'Ride',
    bikes: [{ id: 'a', archived: false }, { id: 'b', archived: false }],
    wheelsets: [{ id: 'w', bike_id: 'a', mounted: true }],
    lastBikeId: 'a',
    lastWheelId: 'w',
  })
  assertEquals(pending.action, 'pending')
  assertEquals(pending.notice, '這次騎哪台？')
  const auth = new URL(authorizeUrl('state'))
  assertEquals(auth.origin + auth.pathname, 'https://www.strava.com/oauth/authorize')
  assertEquals(auth.searchParams.get('redirect_uri'), 'https://cycling-power.vercel.app/?strava=callback')
  assertEquals(auth.searchParams.get('state'), 'state')
  const mobile = new URL(authorizeUrl('state-2', '295868', true))
  assertEquals(mobile.origin + mobile.pathname, 'https://www.strava.com/oauth/mobile/authorize')
  assertEquals(mobile.searchParams.get('redirect_uri'), auth.searchParams.get('redirect_uri'))
  assertEquals(mobile.searchParams.get('state'), 'state-2')
  assertEquals(mobile.searchParams.get('scope'), 'activity:read_all,profile:read_all')
})
