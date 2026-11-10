# Strava 同步上線清單（先不要對正式環境執行）

裝備庫已經在正式專案 `yvgjaljdxmsmtljcmemp`。這一版只加 Strava 連線。不要在預覽確認前改正式資料庫、部署函式、建立 webhook 訂閱，或合併。

Client ID `295868` 可以寫在網站裡。Client secret 只放在 Supabase Edge Function 的秘密，不要寫進 git、不要貼到聊天、不要印在 log。

## 需要設定的秘密（只寫名稱）

在 Supabase → Edge Functions → Secrets，三個都要有：

- `STRAVA_CLIENT_ID` = `295868`
- `STRAVA_CLIENT_SECRET` = Strava 應用程式的 client secret
- `STRAVA_WEBHOOK_VERIFY_TOKEN` = 自己產生的一長串隨機文字（訂閱和 webhook 要用同一串）

函式還會用到 Supabase 本來就有的 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`JWT_SECRET`（或 `SUPABASE_JWT_SECRET`）。不用把 service role key 放進網站。

本機訂閱腳本另外要：

- `STRAVA_CALLBACK_URL` = `https://<project-ref>.supabase.co/functions/v1/strava-webhook`

## 1. 備份

Supabase → Database → Backups，確認今天有備份。

## 2. 本機先測

不連正式專案：

```bash
supabase/tests/run-local.sh
```

確認 token 表只有 service role 能讀、團員呼叫 `strava_backend` 會被拒、同一筆 Strava 活動不會加兩次、室內活動先停在待確認。

## 3. 正式資料庫

SQL Editor 只貼 `supabase/migrations/20261110180000_strava_sync.sql` 再 Run。可再執行一次。既有的車和里程不會被刪。

只想收回這一版：`supabase/rollback_strava.sql`（token 會刪；已經記入的里程還在）。

## 4. 部署兩個函式

兩個都要關掉閘道的 JWT 檢查。`strava-auth` 自己驗證 LINE 登入換來的 JWT。`strava-webhook` 是 Strava 打來的，沒有我們的 JWT，改對 `STRAVA_WEBHOOK_VERIFY_TOKEN`。

```bash
supabase functions deploy strava-auth --no-verify-jwt
supabase functions deploy strava-webhook --no-verify-jwt
```

## 5. 建立 Strava 推播訂閱

先把上面的秘密放進這個終端機的環境變數，再執行。腳本不會把 secret 印出來。

```bash
node supabase/scripts/strava-subscribe.mjs
```

它會 POST 到 `https://www.strava.com/api/v3/push_subscriptions`。callback 是第 4 步的 `strava-webhook` 網址。Strava 會先 GET 這個網址，函式要把 `hub.challenge` 原樣回去。

授權回呼網域是 `cycling-power.vercel.app`。使用者按連結後會回到 `https://cycling-power.vercel.app/?strava=callback`。這個網址在 LINE 的內建瀏覽器也能回來；一次性 state 跟這位團員綁在一起，別人的 state 不能拿來換 token。

## 6. 然後才合併、更新網站

資料庫和兩個函式都成功之後，才合併這個 PR，並更新 `index.html`、`app.js`、`style.css`、`lib/gear.js`。網站先上、函式還沒有時，「連結 Strava」會提示現在無法連結，不會把 token 寫進瀏覽器。

## 同步時會發生什麼

- 只收 Ride、GravelRide、MountainBikeRide、EBikeRide。只有一台車、且那台只有一組輪組時自動記入。對得到 `strava_gear_id` 而且那台車只有一組輪組時也自動記入。
- VirtualRide 先停著，問要不要計入車架和鍊條上蠟。
- 其他類型略過。
- 還不能自動對上的，車庫顯示「這次騎哪台？」，並帶上次用的車和輪組。
- 同一筆活動再送來只會改公里，不會加第二次。刪除活動會把那筆里程減回去。
- 第一次連結會抓最近 30 天。之後可以按「立即同步」。
- token 放在 `private.strava_tokens`。團員中斷連結時會呼叫 Strava 的 deauthorize，並刪掉 token。
