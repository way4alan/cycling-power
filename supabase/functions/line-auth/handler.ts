// LINE LIFF ID token → 短效 Supabase JWT（role=authenticated，claim line_user_id）。
// 正式環境只打 LINE 的 verify API。ALLOW_INSECURE_LINE_VERIFY_URL 僅供本機測試。

const LINE_VERIFY_URL = 'https://api.line.me/oauth2/v2.1/verify'
const MAX_TTL_SECONDS = 60 * 60
const MIN_TTL_SECONDS = 60
const LINE_USER_ID = /^U[0-9a-f]{32}$/i

export type EnvSource = { get(name: string): string | undefined }

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-max-age': '86400',
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS,
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export async function signSupabaseJwt(
  lineUserId: string,
  secret: string,
  ttlSeconds: number,
  iss: string,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000)
  const header = bytesToB64Url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
  const payload = {
    aud: 'authenticated',
    role: 'authenticated',
    iss,
    sub: lineUserId,
    line_user_id: lineUserId,
    iat: now,
    exp: now + ttlSeconds,
  }
  const body = bytesToB64Url(new TextEncoder().encode(JSON.stringify(payload)))
  const data = `${header}.${body}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return { token: `${data}.${bytesToB64Url(new Uint8Array(sig))}`, expiresAt: payload.exp }
}

function ttlSeconds(env: EnvSource): number {
  const raw = Number(env.get('JWT_TTL_SECONDS') || MAX_TTL_SECONDS)
  if (!Number.isFinite(raw)) return MAX_TTL_SECONDS
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, Math.floor(raw)))
}

function verifyUrl(env: EnvSource): string {
  if (env.get('ALLOW_INSECURE_LINE_VERIFY_URL') === '1' && env.get('LINE_VERIFY_URL')) {
    return env.get('LINE_VERIFY_URL') as string
  }
  return LINE_VERIFY_URL
}

type LineIdentity = { sub: string }

async function verifyLineIdToken(
  idToken: string,
  channelId: string,
  env: EnvSource,
  fetchImpl: typeof fetch,
): Promise<LineIdentity | null> {
  let response: Response
  try {
    response = await fetchImpl(verifyUrl(env), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
      signal: AbortSignal.timeout(8000),
    })
  } catch (error) {
    console.error('line-auth', 'verify_unreachable')
    throw error
  }
  if (!response.ok) return null
  const payload = await response.json() as {
    iss?: unknown
    sub?: unknown
    aud?: unknown
    exp?: unknown
  }
  if (payload.iss !== 'https://access.line.me') return null
  if (String(payload.aud) !== channelId) return null
  if (typeof payload.sub !== 'string' || !LINE_USER_ID.test(payload.sub)) return null
  const exp = Number(payload.exp)
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) return null
  return { sub: payload.sub }
}

export async function handleLineAuth(
  req: Request,
  env: EnvSource = Deno.env,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' })

  const channelId = env.get('LINE_CHANNEL_ID') || ''
  const secret = env.get('JWT_SECRET') || env.get('SUPABASE_JWT_SECRET') || ''
  if (!/^[0-9]{6,32}$/.test(channelId) || secret.length < 32) {
    console.error('line-auth', 'server_misconfigured')
    return json(500, { error: 'server_misconfigured' })
  }

  let idToken = ''
  try {
    const text = await req.text()
    if (text.length > 8192) return json(400, { error: 'invalid_request' })
    const body = JSON.parse(text) as { id_token?: unknown }
    if (typeof body.id_token !== 'string' || body.id_token.length < 20) {
      return json(400, { error: 'invalid_request' })
    }
    idToken = body.id_token
  } catch {
    return json(400, { error: 'invalid_request' })
  }

  let identity: LineIdentity | null
  try {
    identity = await verifyLineIdToken(idToken, channelId, env, fetchImpl)
  } catch {
    return json(502, { error: 'line_unreachable' })
  }
  if (!identity) return json(401, { error: 'invalid_token' })

  const ttl = ttlSeconds(env)
  const issued = await signSupabaseJwt(identity.sub, secret, ttl, env.get('JWT_ISS') || 'supabase')
  return json(200, {
    access_token: issued.token,
    token_type: 'bearer',
    expires_in: ttl,
    expires_at: issued.expiresAt,
  })
}
