import { assertEquals } from 'jsr:@std/assert@1'
import { handleLineAuth, type EnvSource } from './handler.ts'

const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const CHANNEL = '2010470481'
const ID_TOKEN = 'good-token-which-is-long-enough'
const USER = 'U' + 'a'.repeat(32)

function env(extra: Record<string, string> = {}): EnvSource {
  const values: Record<string, string> = {
    LINE_CHANNEL_ID: CHANNEL,
    JWT_SECRET: SECRET,
    JWT_TTL_SECONDS: '3600',
    ...extra,
  }
  return { get: (name) => values[name] }
}

function lineFetch(payload: Record<string, unknown>, status = 200): typeof fetch {
  return (async (_input, init) => {
    const body = String(init?.body || '')
    if (!body.includes('id_token=' + encodeURIComponent(ID_TOKEN)) || !body.includes('client_id=' + CHANNEL)) {
      return new Response('{}', { status: 400 })
    }
    return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

function goodPayload(over: Record<string, unknown> = {}) {
  return {
    iss: 'https://access.line.me',
    sub: USER,
    aud: CHANNEL,
    exp: Math.floor(Date.now() / 1000) + 600,
    ...over,
  }
}

function decodePayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1]
  const pad = part + '='.repeat((4 - (part.length % 4)) % 4)
  return JSON.parse(atob(pad.replaceAll('-', '+').replaceAll('_', '/')))
}

Deno.test('issues a short-lived authenticated JWT for a verified LINE id token', async () => {
  const res = await handleLineAuth(
    new Request('http://local/line-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id_token: ID_TOKEN }),
    }),
    env(),
    lineFetch(goodPayload()),
  )
  assertEquals(res.status, 200)
  const body = await res.json()
  assertEquals(body.token_type, 'bearer')
  assertEquals(body.expires_in, 3600)
  const claims = decodePayload(body.access_token)
  assertEquals(claims.role, 'authenticated')
  assertEquals(claims.line_user_id, USER)
  assertEquals(claims.aud, 'authenticated')
  assertEquals(claims.iss, 'supabase')
  const exp = Number(claims.exp)
  const iat = Number(claims.iat)
  assertEquals(exp - iat, 3600)
})

Deno.test('rejects a token LINE will not verify', async () => {
  const res = await handleLineAuth(
    new Request('http://local/line-auth', {
      method: 'POST',
      body: JSON.stringify({ id_token: ID_TOKEN }),
    }),
    env(),
    lineFetch(goodPayload(), 400),
  )
  assertEquals(res.status, 401)
})

Deno.test('rejects a verified token for a different channel', async () => {
  const res = await handleLineAuth(
    new Request('http://local/line-auth', {
      method: 'POST',
      body: JSON.stringify({ id_token: ID_TOKEN }),
    }),
    env(),
    lineFetch(goodPayload({ aud: '9999999999' })),
  )
  assertEquals(res.status, 401)
})

Deno.test('rejects a subject that is not a LINE user id', async () => {
  const res = await handleLineAuth(
    new Request('http://local/line-auth', {
      method: 'POST',
      body: JSON.stringify({ id_token: ID_TOKEN }),
    }),
    env(),
    lineFetch(goodPayload({ sub: 'not-a-line-user' })),
  )
  assertEquals(res.status, 401)
})

Deno.test('does not start without the channel id and jwt secret', async () => {
  const res = await handleLineAuth(
    new Request('http://local/line-auth', {
      method: 'POST',
      body: JSON.stringify({ id_token: ID_TOKEN }),
    }),
    env({ LINE_CHANNEL_ID: '', JWT_SECRET: 'short' }),
    lineFetch(goodPayload()),
  )
  assertEquals(res.status, 500)
})

Deno.test('preflight does not require a token', async () => {
  const res = await handleLineAuth(new Request('http://local/line-auth', { method: 'OPTIONS' }), env())
  assertEquals(res.status, 204)
})
