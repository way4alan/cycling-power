# 下一版上線清單（先不要對正式環境執行）

這份是預覽用。正式專案仍是 `yvgjaljdxmsmtljcmemp`。在管理員看過預覽並明確說可以上線之前，不要把 SQL 貼進正式 SQL Editor，不要部署網站，不要發 LINE 訊息，也不要改 LINE Developers Console。

## 順序：先資料庫，再網站

網站若先更新、資料庫還沒跑，新功能會自己關掉（組別、範本、路線庫、複製）。既有登入、排行榜、報名仍走現在的資料表。讀不到新表時，不會把團員當成新人。

請整段做完，不要只做其中一步。

### 1. 備份

Supabase → Database → Backups，確認今天有備份。

準備兩個檔案，先不要按 Run：

- 要執行的：`supabase/migrations/20261106170000_participation.sql`
- 只想收回這一版、並保留目前登入鎖定時才執行：`supabase/rollback_next.sql`
- 整個網站壞到必須回到舊的開放權限時才執行：`supabase/rollback_rls.sql`（漏洞會回來）

### 2. 在預覽庫或本機先跑

本機（不連正式專案）：

```bash
supabase/tests/run-local.sh
```

確認 anon 被拒、團員不能改別人、不能改範本和路線、管理員可以建立組別、範本、路線。

### 3. 正式資料庫（等確認之後）

Supabase → SQL Editor → New query。貼上 `supabase/migrations/20261106170000_participation.sql` 整份，按 Run。

成功時沒有紅色錯誤。既有團員、團騎、報名、出席不會被刪。新欄位是空的或預設值。舊的 GroupRide 代碼留在原本那一場，複製功能不會把它帶去新的一場。

這份 SQL 可以再執行一次。已存在的表和欄位會略過。

### 4. 更新網站

資料庫成功之後，才把 `index.html`、`app.js`、`style.css`、`icons.js`、`lib/pace-core.js`、`assets/` 放到現在的網站。`?demo=1` 仍是畫面上的示範資料，不寫正式資料庫。

用自己的 LINE 打開：排行榜看得到、下一場團騎可以報名、自己的 FTP 還在。再請管理員看複製預覽，確認預覽當下沒有新增團騎。

### 5. LINE 分享選單（等確認之後才到 Console）

這一版不會自動發訊息，也沒有 Official Account 推播。團員要自己按「用 LINE 選擇對象」，挑好群組或好友後再確認，訊息才會送出。

官方說明：<https://developers.line.biz/en/docs/liff/developing-liff-apps/>

目前不假設 Console 已經打開。若還沒打開，App 會改為複製公告，並寫明「尚未送出」。

要啟用時：

1. 打開 [LINE Developers Console](https://developers.line.biz/console/)，選這個 LIFF 所在的 LINE Login channel。
2. 進入 LIFF 分頁，找到 shareTargetPicker。
3. 閱讀 Agreement Regarding Use of Information，勾選同意後按 Enable。
4. 用手機 LINE 打開 LIFF（要已登入），再按一次分享。取消時不應該出現「已送出」。

`liff.shareTargetPicker()` 只有在使用者已登入，且 Console 已啟用時才會出現選單。使用者取消時，Promise 會成功但不會帶回 `{ status: "success" }`。本版把這種情況當成沒有送出。

### 6. 當下確認

| 誰 | 做什麼 | 應該發生 |
| --- | --- | --- |
| 一般團員 | 打開首頁 | 看得到下一場、自己有沒有報名 |
| 一般團員 | 報名，有組別就選一組，再取消 | 人數有加減；不選組也能報名 |
| 一般團員 | 看頒獎台與本月出席 | 規則文字在畫面上；不足 3 人會留空 |
| 一般團員 | 看別人的 LINE ID | 看不到 |
| 管理員 | 從舊團騎複製，先按預覽 | 還沒有新的一團；舊代碼是空的 |
| 管理員 | 補上新日期後才發布 | 新的一場，沒有舊的報名和出席 |
| 管理員 | 同一場同一天再按一次 | 不會默默多一筆 |
| 管理員 | 匯入 GPX | 距離標成估算；沒有高度就寫無法估算爬升 |

### 7. 這一版明確不做

- 不替管理員建立或讀取 Garmin GroupRide。代碼仍是每一場手動填，可以晚點再補。
- 不抓 Garmin 網頁上的距離或爬升。
- 不呼叫需要金鑰或付費的地圖。路線預覽只依 GPX 座標畫線。
- 不自動推播，也不在測試時真的送出 LINE 訊息。
