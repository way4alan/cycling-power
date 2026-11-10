// 建立 Strava webhook 訂閱。只在正式上線時、由人在本機執行。
// 秘密從環境變數讀，不會印出 client_secret、verify token 或 access token。
const required = ['STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'STRAVA_WEBHOOK_VERIFY_TOKEN', 'STRAVA_CALLBACK_URL']
const missing = required.filter((name) => !process.env[name])
if (missing.length) {
  console.error('缺少環境變數：' + missing.join(', '))
  process.exit(1)
}
const callback = process.env.STRAVA_CALLBACK_URL
if (!/^https:\/\/[a-z0-9.-]+\/functions\/v1\/strava-webhook$/.test(callback)) {
  console.error('STRAVA_CALLBACK_URL 必須是 strava-webhook 的 https 網址')
  process.exit(1)
}
const body = new URLSearchParams({
  client_id: process.env.STRAVA_CLIENT_ID,
  client_secret: process.env.STRAVA_CLIENT_SECRET,
  callback_url: callback,
  verify_token: process.env.STRAVA_WEBHOOK_VERIFY_TOKEN,
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
