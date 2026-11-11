# Strava 同步上線清單（先不要對正式環境執行）

裝備庫已經在正式專案 `yvgjaljdxmsmtljcmemp`。這一版只加 Strava 連線。不要在預覽確認前改正式資料庫、部署函式、建立 webhook 訂閱，或合併。

Client ID `295868` 可以寫在網站裡。Client secret 只放在 Supabase Edge Function 的秘密，不要寫進 git、不要貼到聊天、不要印在 log。

## 需要設定的秘密（只寫名稱）

在 Supabase → Edge Functions → Secrets，只要這兩個（已經設好即可）：

- `STRAVA_CLIENT_ID` = `295868`
- `STRAVA_CLIENT_SECRET` = Strava 應用程式的 client secret

不要再加 `STRAVA_WEBHOOK_VERIFY_TOKEN`。`strava-webhook` 在沒有這個變數時，用 client secret 對文字 `pace-strava-webhook-v1` 做 HMAC-SHA256，取前 32 個十六進位字元。訂閱腳本用同一套算法，所以兩邊不用各存一串。

函式還會用到 Supabase 本來就有的 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`JWT_SECRET`（或 `SUPABASE_JWT_SECRET`）。不用把 service role key 放進網站。

## 1. 備份

Supabase → Database → Backups，確認今天有備份。

## 2. 本機先測

不連正式專案：

```bash
supabase/tests/run-local.sh
```

確認 token 表只有 service role 能讀、團員呼叫 `strava_backend` 會被拒、同一筆 Strava 活動不會加兩次、室內活動先停在待確認。

## 3. 正式資料庫

若 `20261110180000_strava_sync.sql` 還沒跑，先貼那一支。已經上過的環境再貼 `supabase/migrations/20261111180000_strava_backend_qualify.sql`（只替換 `strava_backend`，修掉 nonce 變數和欄位同名）。兩支都可以再執行一次。既有的車和里程不會被刪。

只想收回這一版：`supabase/rollback_strava.sql`（token 會刪；已經記入的里程還在）。

## 4. 部署兩個函式

兩個都要關掉閘道的 JWT 檢查。`strava-auth` 自己驗證 LINE 登入換來的 JWT。`strava-webhook` 是 Strava 打來的，沒有我們的 JWT，改對由 client secret 算出的驗證字串。

```bash
supabase functions deploy strava-auth --no-verify-jwt
supabase functions deploy strava-webhook --no-verify-jwt
```

## 5. 建立 Strava 推播訂閱

終端機只要有 `STRAVA_CLIENT_SECRET`。`STRAVA_CLIENT_ID` 預設 `295868`。callback 預設 `https://yvgjaljdxmsmtljcmemp.supabase.co/functions/v1/strava-webhook`。腳本不會印出 secret，也不會印出算出來的驗證字串。

```bash
node supabase/scripts/strava-subscribe.mjs
```

它會 POST 到 `https://www.strava.com/api/v3/push_subscriptions`。Strava 會先 GET webhook 網址，函式要把 `hub.challenge` 原樣回去。

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
