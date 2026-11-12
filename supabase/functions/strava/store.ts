// 正式環境用 service role 呼叫 strava_backend。瀏覽器沒有這個 key。
import type { Store, StravaToken } from './logic.ts'
import type { RideWindow } from './summit.ts'

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
    async forgetCache(lineUserId) {
      await rpc('forget_member_strava', { target: lineUserId })
    },
    async purgeCache() {
      await rpc('purge_expired_strava_cache', {})
    },
    async saveOffers(lineUserId, offers) {
      if (!offers.length) return
      await rest('badge_prompts', {
        method: 'POST',
        body: JSON.stringify(offers.map((row) => ({
          line_user_id: lineUserId,
          badge_key: row.key,
          tier: row.tier || '',
          earned_on: row.earned_on,
        }))),
      })
    },
    async saveCheckin(lineUserId, ride) {
      await rest('ride_checkin_prompts', {
        method: 'POST',
        body: JSON.stringify({
          line_user_id: lineUserId,
          ride_id: ride.id || null,
          ride_title: ride.title || '',
          ride_date: ride.date || null,
        }),
      })
    },
    async openRides() {
      const res = await fetchImpl(`${supabaseUrl}/rest/v1/rides?select=id,title,date,time,routes(track)&order=date.desc&limit=30`, {
        headers: serviceHeaders(),
      })
      if (!res.ok) return []
      const rows = await res.json() as { id?: string; title?: string; date?: string; time?: string; routes?: { track?: RideWindow['track'] } }[]
      if (!Array.isArray(rows)) return []
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        date: row.date,
        time: row.time,
        track: row.routes?.track || [],
      }))
    },
    async scanUsed(lineUserId) {
      const res = await fetchImpl(`${supabaseUrl}/rest/v1/riders?line_user_id=eq.${encodeURIComponent(lineUserId)}&select=history_scan_used`, {
        headers: serviceHeaders(),
      })
      if (!res.ok) return false
      const rows = await res.json() as { history_scan_used?: boolean }[]
      return rows[0]?.history_scan_used === true
    },
    async markScanned(lineUserId) {
      await fetchImpl(`${supabaseUrl}/rest/v1/riders?line_user_id=eq.${encodeURIComponent(lineUserId)}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders(), prefer: 'return=minimal' },
        body: JSON.stringify({ history_scan_used: true }),
      })
    },
    async noteDevice(lineUserId, externalId, deviceName) {
      await fetchImpl(`${supabaseUrl}/rest/v1/pending_activities?line_user_id=eq.${encodeURIComponent(lineUserId)}&external_id=eq.${encodeURIComponent(externalId)}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders(), prefer: 'return=minimal' },
        body: JSON.stringify({ device_name: deviceName.slice(0, 80) }),
      })
    },
  }
  function serviceHeaders() {
    return { apikey: serviceKey, authorization: `Bearer ${serviceKey}`, 'content-type': 'application/json' }
  }
  async function rpc(name: string, args: Record<string, unknown>) {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify(args),
    })
    if (!res.ok) throw new Error('strava_rpc')
  }
  async function rest(table: string, init: { method: string; body: string }) {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/${table}`, {
      method: init.method,
      headers: { ...serviceHeaders(), prefer: 'return=minimal' },
      body: init.body,
    })
    if (!res.ok) throw new Error('strava_rest')
  }
}
