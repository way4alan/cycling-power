# 上線步驟（給車隊管理員）

這次改的是「誰有資格改資料」。現在任何人拿到網站裡的那把公開鑰匙，都能改出席、自己核准、把別人設成管理員。上線之後，只有本人的 LINE 登入能改自己的資料，管理員才能審核、改出席、發團騎。

這份檔案還沒有套到正式資料庫，也還沒有把登入函式發到正式環境。正式專案是 `yvgjaljdxmsmtljcmemp`。請整段做完，不要只做其中一步。

## 你會用到的兩個密鑰

請先準備好，但不要貼到 GitHub、LINE 群組或這個檔案裡。

1. **LINE Channel ID**
   - 打開 [LINE Developers](https://developers.line.biz/console/)，選這個 LIFF 用的那個 channel。
   - 在 Basic settings 找到 **Channel ID**。它是一串數字。
   - 網站裡的 LIFF ID 是 `2010470481-aY3CdaJS`，Channel ID 通常就是前面的 `2010470481`。請以畫面上的數字為準。
2. **Supabase JWT Secret**
   - 打開 Supabase 專案 → Project Settings → API，或 JWT Keys 頁面。
   - 複製標成 **JWT Secret** / **Legacy JWT secret** 的那一長串。
   - 這不是 anon key，也不是 service_role key。anon key 本來就在網站裡，可以繼續留著。service_role key 絕對不要放到網站。

## 建議順序

先備份，再上登入函式，再換網站，最後才鎖資料庫。網站和資料庫要同一天做完。

### 1. 備份

Supabase → Database → Backups，確認今天有備份。或在 SQL Editor 先不要按 Run，只把下面兩個檔案開著備用：

- 要執行的：`supabase/migrations/20261104164831_rls_lockdown.sql`
- 出事才執行的：`supabase/rollback_rls.sql`

`supabase/migrations/20261104164830_baseline_schema.sql` 不會刪資料（表已經存在就略過）。用網頁 SQL Editor 時不必跑它。

### 2. 部署登入函式

需要有人在電腦上登入 Supabase CLI（會開瀏覽器）。在這個專案資料夾執行：

```bash
supabase link --project-ref yvgjaljdxmsmtljcmemp
supabase secrets set LINE_CHANNEL_ID=你的ChannelID JWT_SECRET=你的JWTSecret
supabase functions deploy line-auth --no-verify-jwt
```

不要設定 `LINE_VERIFY_URL` 或 `ALLOW_INSECURE_LINE_VERIFY_URL`。那兩個只給本機測試，正式環境一設定就會繞過 LINE。

這一步做完，舊網站還是舊的，團員仍可使用。

### 3. 更新網站檔案

把合併後的 `index.html`、`app.js`、`style.css`、`icons.js`、`assets/` 覆蓋到現在網站所在的地方。`?demo=1` 仍是範例資料，不連正式資料庫。

這一步之後、下一步之前，網站會先跟 LINE 換一張短效通行證（約 1 小時，過期會自動再換）。舊的資料庫規則還開著，所以網站應該仍可操作，但漏洞還沒關。

請先用自己的 LINE 打開看排行榜。打得開再做下一步。

### 4. 鎖上資料庫

Supabase → SQL Editor → New query。

打開 `supabase/migrations/20261104164831_rls_lockdown.sql`，整份貼上，按 Run。

不要貼 `rollback_rls.sql`。不要貼 `suggested_rls.sql`（那份會故意失敗）。

成功的話，最後沒有紅色錯誤。團員資料不會被刪掉。

### 5. 當下確認

用 LINE 打開正式網站，照這張表點一次：

| 誰 | 做什麼 | 應該發生 |
| --- | --- | --- |
| 一般團員 | 打開排行榜 | 看得到名字和戰力 |
| 一般團員 | 改自己的 FTP，關掉再打開 | 數字還在 |
| 一般團員 | 報名一場團騎，再取消 | 人數有加減 |
| 一般團員 | 看「我的」 | 沒有「成員管理」 |
| 管理員 | 打開成員管理 | 看得到待審核 |
| 管理員 | 核准、新增一則團騎、勾一筆出席 | 都存得下去 |

若卡在「載入中」或變成「載入失敗」：到 Supabase → Edge Functions → `line-auth` → Logs。常見原因是 Channel ID 或 JWT Secret 填錯。先做下面的回復，網站會立刻回到現在這樣（漏洞也會回來），再重來。

### 6. 只有壞掉時才回復

SQL Editor 貼上 `supabase/rollback_rls.sql` 整份並執行。

回復不會刪團員或團騎，但任何人拿到網站那把公開鑰匙又能改全部資料。網站可以先恢復使用。修好 Channel ID / JWT Secret 後，從步驟 2 再做一次，步驟 4 的 SQL 可以再執行。

## 鎖上之後，資料庫怎麼判別人

- 瀏覽器把 LINE 的 ID token 交給 `line-auth`。函式請 LINE 驗證，並核對 Channel ID。
- 通過才發一張 1 小時內有效的 Supabase JWT，裡面有 `role=authenticated` 和 `line_user_id`。
- 改自己的 FTP、報名，都只認這張 JWT。請求裡若填別人的 LINE ID，會被改回本人或直接拒絕。
- `is_admin`、審核狀態、出席次數、別人的資料、團騎、集合點、團規、天氣地點，只有管理員改得了。
- 排行榜和報名名單仍看得到名字。別人的 LINE ID 會被遮住；本人和管理員還看得到自己需要用的那一筆。
- 沒有登入的 anon key 不能再讀、也不能寫。

## 本機已做過的測試

`supabase/tests/run-local.sh` 用本機 Postgres 和 PostgREST（沒有碰到正式專案）檢查：anon 被拒、團員只能改自己和幫自己報名、不能自封管理員、管理員可以審核與出席。`?demo=1` 仍只用畫面裡的範例資料。
