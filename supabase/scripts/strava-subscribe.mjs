// 建立 Strava webhook 訂閱。只在正式上線時、由人在本機執行。
// 驗證字串由 client secret 算出，跟 strava-webhook 相同。不會印出 secret 或驗證字串。
import { createHmac } from 'node:crypto'
import { pathToFileURL } from 'node:url'

export function deriveWebhookVerifyToken(secret) {
  return createHmac('sha256', secret).update('pace-strava-webhook-v1').digest('hex').slice(0, 32)
}

const invokedDirectly = process.argv[1] ? pathToFileURL(process.argv[1]).href === import.meta.url : false

async function main() {
  if (!process.env.STRAVA_CLIENT_SECRET) {
    console.error('缺少環境變數：STRAVA_CLIENT_SECRET')
    process.exit(1)
  }
  const clientId = process.env.STRAVA_CLIENT_ID || '295868'
  const callback = process.env.STRAVA_CALLBACK_URL || 'https://yvgjaljdxmsmtljcmemp.supabase.co/functions/v1/strava-webhook'
  if (!/^https:\/\/[a-z0-9.-]+\/functions\/v1\/strava-webhook$/.test(callback)) {
    console.error('STRAVA_CALLBACK_URL 必須是 strava-webhook 的 https 網址')
    process.exit(1)
  }
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    callback_url: callback,
    verify_token: deriveWebhookVerifyToken(process.env.STRAVA_CLIENT_SECRET),
  })
  const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', { method: 'POST', body })
  const text = await res.text()
  let id = ''
  try { id = String(JSON.parse(text).id || '') } catch { id = '' }
  if (!res.ok) {
    console.error('訂閱沒有建立，HTTP ' + res.status)
    process.exit(1)
  }
  console.log('已建立訂閱' + (id ? ' #' + id : ''))
}

if (invokedDirectly) await main()
