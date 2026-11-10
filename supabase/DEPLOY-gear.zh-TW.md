# 裝備庫上線清單（先不要對正式環境執行）

團騎類型那一版已經在正式專案 `yvgjaljdxmsmtljcmemp`（migration `20261110014024`）。這一版只加個人裝備與保養里程。不要重跑舊的 SQL，也不要在預覽確認前改正式資料庫、合併或發 LINE。

順序：備份、跑這一版 SQL、確認沒有錯誤，最後才合併並更新網站。

## 1. 備份

Supabase → Database → Backups，確認今天有備份。

- 要執行的：`supabase/migrations/20261110150000_gear_garage.sql`
- 只想收回這一版：`supabase/rollback_gear.sql`（車、輪組、耗材、里程會刪除；團員和團騎還在）

## 2. 本機先測

不連正式專案：

```bash
supabase/tests/run-local.sh
```

確認 anon 被拒、團員只能看到自己的車、管理員也看不到別人的車、新增車會出現「原廠輪組」、室外里程會加到所選輪組、室內預設不加、勾了才計入車架和鍊條上蠟。鍊條上蠟預設 250 公里（車隊規定，可改，沒有月份）；鍊條更換沒有固定週期，並保留每次換鍊紀錄。

## 3. 正式資料庫（等確認之後）

SQL Editor 只貼 `20261110150000_gear_garage.sql` 再 Run。可再執行一次。既有團員與團騎不會被刪。

## 4. 然後才合併、更新網站

資料庫成功之後才合併這個 PR，並更新 `index.html`、`app.js`、`style.css`、`lib/gear.js`。`?demo=1` 仍是示範資料。若網站先上、表還沒有，裝備區會隱藏，不會把團員當成新人。

## 之後的 Strava（這一版不做登入）

`pending_activities` 先留著。以後同步時：

- 只收 `Ride`、`GravelRide`、`MountainBikeRide`、`EBikeRide`。
- `VirtualRide` 當室內，問要不要計入鏈條。
- Run、Swim 和其他類型略過。
- 匯入後若還不知道是哪台車，狀態留 `pending`，通知「這次騎乘是用哪台車、哪組輪組？」。
- 只有一台未封存的車、且那台只有一組輪組時，自動對上。
- 畫面裡的「連結 Strava（即將推出）」保持停用，沒有 OAuth。
