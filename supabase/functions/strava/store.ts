// 正式環境用 service role 呼叫 strava_backend。瀏覽器沒有這個 key。
import type { Store, StravaToken } from './logic.ts'

export function serviceStore(supabaseUrl: string, serviceKey: string, fetchImpl: typeof fetch = fetch): Store {
  async function call(op: string, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/strava_backend`, {
      method: 'POST',
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ op, payload }),
    })
    if (!res.ok) throw new Error('strava_backend')
    const data = await res.json() as Record<string, unknown> | null
    return data
  }
  return {
    async putToken(row) {
      await call('put_token', row)
    },
    async getToken(query) {
      const data = await call('get_token', query)
      if (!data || data.line_user_id == null) return null
      return data as unknown as StravaToken
    },
    async deleteToken(query) {
      await call('delete_token', query)
    },
    async touchSync(lineUserId) {
      await call('touch_sync', { line_user_id: lineUserId })
    },
    async putState(nonce, lineUserId, expiresAt) {
      await call('put_state', { nonce, line_user_id: lineUserId, expires_at: expiresAt })
    },
    async consumeState(nonce, lineUserId) {
      const data = await call('consume_state', { nonce, line_user_id: lineUserId })
      return data?.ok === true
    },
    async context(lineUserId) {
      const data = await call('context', { line_user_id: lineUserId })
      return {
        bikes: Array.isArray(data?.bikes) ? data.bikes as { id: string }[] : [],
        wheelsets: Array.isArray(data?.wheelsets) ? data.wheelsets as { id: string; bike_id: string }[] : [],
        last_bike_id: typeof data?.last_bike_id === 'string' ? data.last_bike_id : null,
        last_wheel_id: typeof data?.last_wheel_id === 'string' ? data.last_wheel_id : null,
      }
    },
    async apply(row) {
      return (await call('apply', row)) || {}
    },
    async removeActivity(lineUserId, externalId) {
      await call('remove_activity', { line_user_id: lineUserId, external_id: externalId })
    },
  }
}
