# Strava 審查修正上線清單（先不要對正式環境執行）

這一版加公開隱私權政策、連結前的說明、官方 Connect with Strava 按鈕，以及 Strava 端解除授權後的書面確認。不要在預覽確認前改正式資料庫 `yvgjaljdxmsmtljcmemp`、不要先部署 edge function、也不要先合併。

順序：先備份，再跑 migration，確認沒有錯誤，然後才部署 `strava-webhook`，最後才合併並更新網站。

## 1. 備份

Supabase → Database → Backups，確認今天有備份。

- 要執行的：`supabase/migrations/20261118150000_strava_deletion_notice.sql`
- 這支只新增解除授權通知表和每日清理排程。不刪車、輪組、里程或已確認的紀錄。
- 回復方式寫在該檔開頭。

## 2. 本機先測

不連正式專案：

```bash
supabase/tests/run-local.sh
```

## 3. 正式資料庫（等確認之後）

SQL Editor 只貼 `20261118150000_strava_deletion_notice.sql` 再 Run。可以再執行一次。

若訊息說 pg_cron 不能用：到 Supabase → Integrations → Cron，每天執行 `select public.purge_expired_strava_cache();`。沒有這一步，7 天的 Strava 暫存不會自動清掉。

## 4. 然後重新部署 strava-webhook

`supabase/functions/strava` 的 webhook 會在選手解除授權時呼叫 `note_strava_deletion`。函式沒有重新部署的話，資料會刪掉，但下次打開 App 不會看到書面確認。

`strava-auth` 這次不用先重新部署。

## 5. 最後才合併、更新網站

網站上的 `/privacy.html` 不需要登入。生效日期在 `privacy.html` 的 `<meta name="privacy-effective">`，以及 `docs/strava-review/PRIVACY-POLICY.zh-TW.md` 和 `.en.md`。三處要同一天。
