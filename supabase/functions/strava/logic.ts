// Strava OAuth、webhook 與活動分類。不讀寫正式專案。
// token 交換與重新整理只在這個函式裡用 STRAVA_CLIENT_SECRET，不會回給瀏覽器。

import { signSupabaseJwt } from '../line-auth/handler.ts'

export const STRAVA_CLIENT_ID = '295868'
export const STRAVA_REDIRECT_URI = 'https://cycling-power.vercel.app/?strava=callback'
export const STRAVA_SCOPE = 'activity:read_all,profile:read_all'
export const STRAVA_AUTHORIZE = 'https://www.strava.com/oauth/authorize'
export const STRAVA_MOBILE_AUTHORIZE = 'https://www.strava.com/oauth/mobile/authorize'
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
export const STRAVA_DEAUTHORIZE_URL = 'https://www.strava.com/oauth/deauthorize'

const LINE_USER_ID = /^U[0-9a-f]{32}$/i
const STATE_TTL_SECONDS = 10 * 60

export type EnvSource = { get(name: string): string | undefined }

export type StravaToken = {
  line_user_id: string
  athlete_id: number
  access_token: string
  refresh_token: string
  expires_at: string
  scope: string
  last_sync_at: string | null
}

export type PaceBike = {
  id: string
  name?: string
  brand?: string
  strava_gear_id?: string | null
  archived?: boolean
}
export type PaceWheel = { id: string; bike_id: string; name?: string; mounted?: boolean }

export type ActivityPlan = {
  action: 'ignore' | 'assign' | 'pending'
  indoor: boolean
  askChain: boolean
  bikeId: string | null
  wheelsetId: string | null
  notice: string
}

export type StravaActivity = {
  id: number | string
  sport_type?: string
  type?: string
  name?: string
  distance?: number
  start_date?: string
  start_date_local?: string
  gear_id?: string | null
}

export type Store = {
  putToken(row: StravaToken): Promise<void>
  getToken(query: { line_user_id?: string; athlete_id?: number }): Promise<StravaToken | null>
  deleteToken(query: { line_user_id?: string; athlete_id?: number }): Promise<void>
  touchSync(lineUserId: string): Promise<void>
  putState(nonce: string, lineUserId: string, expiresAt: string): Promise<void>
  consumeState(nonce: string, lineUserId: string): Promise<boolean>
  context(lineUserId: string): Promise<{
    bikes: PaceBike[]
    wheelsets: PaceWheel[]
    last_bike_id: string | null
    last_wheel_id: string | null
  }>
  apply(row: Record<string, unknown>): Promise<Record<string, unknown>>
  removeActivity(lineUserId: string, externalId: string): Promise<void>
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-max-age': '86400',
}

export function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function b64UrlToBytes(value: string): Uint8Array {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  const bin = atob(value.replaceAll('-', '+').replaceAll('_', '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

async function signPayload(payload: Record<string, unknown>, secret: string): Promise<string> {
  const header = bytesToB64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const body = bytesToB64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const data = `${header}.${body}`
  const key = await hmacKey(secret, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return `${data}.${bytesToB64Url(new Uint8Array(sig))}`
}

async function readSigned(token: string, secret: string): Promise<Record<string, unknown> | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const key = await hmacKey(secret, ['verify'])
  const ok = await crypto.subtle.verify(
    'HMAC',
    key,
    b64UrlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  if (!ok) return null
  try {
    return JSON.parse(new TextDecoder().decode(b64UrlToBytes(parts[1]))) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function verifyUserJwt(token: string, secret: string): Promise<string | null> {
  if (!token || secret.length < 32) return null
  const payload = await readSigned(token, secret)
  if (!payload) return null
  if (payload.role !== 'authenticated' || payload.aud !== 'authenticated') return null
  const line = typeof payload.line_user_id === 'string' ? payload.line_user_id : ''
  if (!LINE_USER_ID.test(line)) return null
  const exp = Number(payload.exp)
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return null
  return line
}

export async function bearerLine(req: Request, secret: string): Promise<string | null> {
  const header = req.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  return verifyUserJwt(token, secret)
}

export function classifySport(sport: string): { action: 'import' | 'ignore'; indoor: boolean; askChain: boolean } {
  if (sport === 'Ride' || sport === 'GravelRide' || sport === 'MountainBikeRide' || sport === 'EBikeRide') {
    return { action: 'import', indoor: false, askChain: false }
  }
  if (sport === 'VirtualRide') return { action: 'import', indoor: true, askChain: true }
  return { action: 'ignore', indoor: false, askChain: false }
}

export function planActivity(input: {
  sport: string
  gearId?: string | null
  bikes: PaceBike[]
  wheelsets: PaceWheel[]
  lastBikeId?: string | null
  lastWheelId?: string | null
}): ActivityPlan {
  const kind = classifySport(input.sport)
  if (kind.action !== 'import') {
    return { action: 'ignore', indoor: false, askChain: false, bikeId: null, wheelsetId: null, notice: '' }
  }
  const active = (input.bikes || []).filter((bike) => bike.archived !== true)
  const gearId = input.gearId == null ? '' : String(input.gearId)
  const matched = gearId
    ? active.find((bike) => bike.strava_gear_id && String(bike.strava_gear_id) === gearId) || null
    : null
  const lastBike = active.find((bike) => bike.id === input.lastBikeId) || null
  const bike = matched || (active.length === 1 ? active[0] : lastBike)
  const sets = bike ? (input.wheelsets || []).filter((row) => row.bike_id === bike.id) : []
  const mounted = sets.find((row) => row.mounted === true) || sets[0] || null
  const lastWheel = sets.find((row) => row.id === input.lastWheelId) || null
  const wheel = sets.length === 1 ? sets[0] : (lastWheel || mounted)
  const canAuto = !!(bike && wheel && sets.length === 1 && !kind.askChain && (active.length === 1 || matched))
  if (canAuto && bike && wheel) {
    return { action: 'assign', indoor: kind.indoor, askChain: false, bikeId: bike.id, wheelsetId: wheel.id, notice: '' }
  }
  return {
    action: 'pending',
    indoor: kind.indoor,
    askChain: kind.askChain,
    bikeId: bike ? bike.id : null,
    wheelsetId: wheel ? wheel.id : null,
    notice: '這次騎哪台？',
  }
}

export function activityKm(distanceMeters: unknown): number | null {
  const meters = Number(distanceMeters)
  if (!Number.isFinite(meters) || meters <= 0) return null
  const km = Math.round((meters / 1000) * 10) / 10
  if (km <= 0 || km > 2000) return null
  return km
}

export function activityDay(activity: StravaActivity): string {
  const raw = activity.start_date_local || activity.start_date || ''
  return raw.slice(0, 10)
}

export function authorizeUrl(state: string, clientId = STRAVA_CLIENT_ID, mobile = false): string {
  const url = new URL(mobile ? STRAVA_MOBILE_AUTHORIZE : STRAVA_AUTHORIZE)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', STRAVA_REDIRECT_URI)
  url.searchParams.set('approval_prompt', 'auto')
  url.searchParams.set('scope', STRAVA_SCOPE)
  url.searchParams.set('state', state)
  return url.toString()
}

function clientId(env: EnvSource): string {
  return env.get('STRAVA_CLIENT_ID') || STRAVA_CLIENT_ID
}

function clientSecret(env: EnvSource): string {
  return env.get('STRAVA_CLIENT_SECRET') || ''
}

export async function deriveWebhookVerifyToken(secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('pace-strava-webhook-v1'))
  let hex = ''
  for (const byte of new Uint8Array(sig)) hex += byte.toString(16).padStart(2, '0')
  return hex.slice(0, 32)
}

export async function webhookVerifyToken(env: EnvSource): Promise<string> {
  const explicit = env.get('STRAVA_WEBHOOK_VERIFY_TOKEN')
  if (explicit) return explicit
  const secret = clientSecret(env)
  if (!secret) return ''
  return deriveWebhookVerifyToken(secret)
}

function jwtSecret(env: EnvSource): string {
  return env.get('JWT_SECRET') || env.get('SUPABASE_JWT_SECRET') || ''
}

async function issueState(lineUserId: string, secret: string, store: Store): Promise<string> {
  const nonce = crypto.randomUUID()
  const exp = Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS
  await store.putState(nonce, lineUserId, new Date(exp * 1000).toISOString())
  return signPayload({ typ: 'strava_oauth', line_user_id: lineUserId, nonce, exp }, secret)
}

export async function verifyState(state: string, secret: string, lineUserId: string): Promise<string | null> {
  const payload = await readSigned(state, secret)
  if (!payload) return null
  if (payload.typ !== 'strava_oauth') return null
  if (payload.line_user_id !== lineUserId) return null
  const exp = Number(payload.exp)
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return null
  return typeof payload.nonce === 'string' ? payload.nonce : null
}

async function tokenRequest(fetchImpl: typeof fetch, body: URLSearchParams): Promise<Record<string, unknown> | null> {
  const res = await fetchImpl(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) return null
  return await res.json() as Record<string, unknown>
}

function tokenRow(lineUserId: string, payload: Record<string, unknown>, previous: StravaToken | null): StravaToken | null {
  const athlete = payload.athlete as { id?: unknown } | undefined
  const athleteId = Number(athlete?.id ?? previous?.athlete_id)
  const access = typeof payload.access_token === 'string' ? payload.access_token : ''
  const refresh = typeof payload.refresh_token === 'string' ? payload.refresh_token : previous?.refresh_token || ''
  const expires = Number(payload.expires_at)
  if (!lineUserId || !Number.isFinite(athleteId) || !access || !refresh || !Number.isFinite(expires)) return null
  return {
    line_user_id: lineUserId,
    athlete_id: athleteId,
    access_token: access,
    refresh_token: refresh,
    expires_at: new Date(expires * 1000).toISOString(),
    scope: typeof payload.scope === 'string' ? payload.scope : previous?.scope || STRAVA_SCOPE,
    last_sync_at: previous?.last_sync_at || null,
  }
}

export async function refreshToken(token: StravaToken, env: EnvSource, fetchImpl: typeof fetch, store: Store): Promise<StravaToken | null> {
  if (new Date(token.expires_at).getTime() - Date.now() > 60_000) return token
  const payload = await tokenRequest(fetchImpl, new URLSearchParams({
    client_id: clientId(env),
    client_secret: clientSecret(env),
    grant_type: 'refresh_token',
    refresh_token: token.refresh_token,
  }))
  if (!payload) return null
  const next = tokenRow(token.line_user_id, payload, token)
  if (!next) return null
  await store.putToken(next)
  return next
}

async function applyOne(
  lineUserId: string,
  activity: StravaActivity,
  store: Store,
): Promise<Record<string, unknown>> {
  const sport = activity.sport_type || activity.type || ''
  const ctx = await store.context(lineUserId)
  const plan = planActivity({
    sport,
    gearId: activity.gear_id,
    bikes: ctx.bikes,
    wheelsets: ctx.wheelsets,
    lastBikeId: ctx.last_bike_id,
    lastWheelId: ctx.last_wheel_id,
  })
  if (plan.action === 'ignore') return { status: 'ignored' }
  const km = activityKm(activity.distance)
  const day = activityDay(activity)
  if (km == null || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return { status: 'ignored' }
  return store.apply({
    line_user_id: lineUserId,
    external_id: String(activity.id),
    sport_type: sport,
    name: activity.name || '',
    occurred_on: day,
    distance_km: km,
    is_indoor: plan.indoor,
    ask_chain: plan.askChain,
    gear_external_id: activity.gear_id || '',
    assign: plan.action === 'assign',
    bike_id: plan.bikeId || '',
    wheelset_id: plan.wheelsetId || '',
    count_indoor: false,
  })
}

export async function syncActivities(
  token: StravaToken,
  env: EnvSource,
  fetchImpl: typeof fetch,
  store: Store,
): Promise<{ imported: number }> {
  const fresh = await refreshToken(token, env, fetchImpl, store)
  if (!fresh) return { imported: 0 }
  const after = fresh.last_sync_at
    ? Math.floor(new Date(fresh.last_sync_at).getTime() / 1000) - 3600
    : Math.floor(Date.now() / 1000) - 30 * 24 * 3600
  let imported = 0
  for (let page = 1; page <= 3; page++) {
    const url = `https://www.strava.com/api/v3/athlete/activities?after=${after}&page=${page}&per_page=50`
    const res = await fetchImpl(url, { headers: { authorization: `Bearer ${fresh.access_token}` } })
    if (!res.ok) break
    const list = await res.json() as StravaActivity[]
    if (!Array.isArray(list) || !list.length) break
    for (const activity of list) {
      const result = await applyOne(fresh.line_user_id, activity, store)
      if (result.status === 'assigned' || result.status === 'pending' || result.status === 'updated') imported += 1
    }
    if (list.length < 50) break
  }
  await store.touchSync(fresh.line_user_id)
  return { imported }
}

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text()
    if (text.length > 20000) return null
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    return null
  }
}

async function handleStravaAuthBody(
  req: Request,
  env: EnvSource,
  fetchImpl: typeof fetch,
  store: Store,
): Promise<Response> {
  const secret = jwtSecret(env)
  const stravaSecret = clientSecret(env)
  if (secret.length < 32 || stravaSecret.length < 8) return json(500, { error: 'server_misconfigured' })
  const lineUserId = await bearerLine(req, secret)
  if (!lineUserId) return json(401, { error: 'invalid_token' })
  const body = await readJson(req)
  if (!body) return json(400, { error: 'invalid_request' })
  const action = String(body.action || '')

  if (action === 'start') {
    const state = await issueState(lineUserId, stravaSecret, store)
    return json(200, { url: authorizeUrl(state, clientId(env), body.mobile === true) })
  }

  if (action === 'exchange') {
    const code = typeof body.code === 'string' ? body.code : ''
    const state = typeof body.state === 'string' ? body.state : ''
    const scope = typeof body.scope === 'string' ? body.scope : ''
    if (scope && !scope.split(/[,\s]+/).includes('activity:read_all')) {
      return json(400, { error: 'missing_scope' })
    }
    const nonce = await verifyState(state, stravaSecret, lineUserId)
    if (!code || !nonce) return json(400, { error: 'invalid_state' })
    if (!await store.consumeState(nonce, lineUserId)) return json(400, { error: 'invalid_state' })
    const payload = await tokenRequest(fetchImpl, new URLSearchParams({
      client_id: clientId(env),
      client_secret: stravaSecret,
      code,
      grant_type: 'authorization_code',
    }))
    if (!payload) return json(502, { error: 'strava_unreachable' })
    const row = tokenRow(lineUserId, payload, null)
    if (!row) return json(502, { error: 'strava_unreachable' })
    await store.putToken(row)
    await syncActivities(row, env, fetchImpl, store)
    return json(200, { connected: true, athlete_id: row.athlete_id })
  }

  if (action === 'status') {
    const token = await store.getToken({ line_user_id: lineUserId })
    if (!token) return json(200, { connected: false })
    return json(200, {
      connected: true,
      athlete_id: token.athlete_id,
      last_sync_at: token.last_sync_at,
    })
  }

  if (action === 'bikes') {
    const token = await store.getToken({ line_user_id: lineUserId })
    if (!token) return json(404, { error: 'not_connected' })
    const fresh = await refreshToken(token, env, fetchImpl, store)
    if (!fresh) return json(502, { error: 'strava_unreachable' })
    const res = await fetchImpl('https://www.strava.com/api/v3/athlete', {
      headers: { authorization: `Bearer ${fresh.access_token}` },
    })
    if (!res.ok) return json(502, { error: 'strava_unreachable' })
    const athlete = await res.json() as { bikes?: { id?: string; name?: string }[] }
    const bikes = (athlete.bikes || [])
      .filter((bike) => bike.id && bike.name)
      .map((bike) => ({ id: String(bike.id), name: String(bike.name) }))
    return json(200, { bikes })
  }

  if (action === 'sync') {
    const token = await store.getToken({ line_user_id: lineUserId })
    if (!token) return json(404, { error: 'not_connected' })
    const result = await syncActivities(token, env, fetchImpl, store)
    return json(200, result)
  }

  if (action === 'disconnect') {
    const token = await store.getToken({ line_user_id: lineUserId })
    if (token) {
      await fetchImpl(STRAVA_DEAUTHORIZE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ access_token: token.access_token }),
      })
      await store.deleteToken({ line_user_id: lineUserId })
    }
    return json(200, { connected: false })
  }

  return json(400, { error: 'invalid_request' })
}

export async function handleStravaAuth(
  req: Request,
  env: EnvSource,
  fetchImpl: typeof fetch,
  store: Store,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  try {
    return await handleStravaAuthBody(req, env, fetchImpl, store)
  } catch {
    console.error('strava-auth', 'failed')
    return json(500, { error: 'server_error' })
  }
}

export async function handleStravaWebhook(
  req: Request,
  env: EnvSource,
  fetchImpl: typeof fetch,
  store: Store,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  const verify = await webhookVerifyToken(env)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode !== 'subscribe' || !challenge || !verify || token !== verify) return json(403, { error: 'forbidden' })
    return json(200, { 'hub.challenge': challenge })
  }
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })
  const body = await readJson(req)
  if (!body) return json(400, { error: 'invalid_request' })
  const objectType = String(body.object_type || '')
  const aspect = String(body.aspect_type || '')
  const ownerId = Number(body.owner_id)
  const objectId = body.object_id
  const updates = (body.updates || {}) as { authorized?: string }
  if (!Number.isFinite(ownerId)) return json(200, { ok: true })
  if (objectType === 'athlete' && String(updates.authorized) === 'false') {
    await store.deleteToken({ athlete_id: ownerId })
    return json(200, { ok: true })
  }
  if (objectType !== 'activity') return json(200, { ok: true })
  const token = await store.getToken({ athlete_id: ownerId })
  if (!token) return json(200, { ok: true })
  if (aspect === 'delete') {
    await store.removeActivity(token.line_user_id, String(objectId))
    return json(200, { ok: true })
  }
  if (aspect !== 'create' && aspect !== 'update') return json(200, { ok: true })
  const fresh = await refreshToken(token, env, fetchImpl, store)
  if (!fresh) return json(200, { ok: true })
  const res = await fetchImpl(`https://www.strava.com/api/v3/activities/${objectId}`, {
    headers: { authorization: `Bearer ${fresh.access_token}` },
  })
  if (!res.ok) return json(200, { ok: true })
  const activity = await res.json() as StravaActivity
  await applyOne(fresh.line_user_id, activity, store)
  return json(200, { ok: true })
}

export async function devSignUser(lineUserId: string, secret: string): Promise<string> {
  const issued = await signSupabaseJwt(lineUserId, secret, 600, 'supabase')
  return issued.token
}
