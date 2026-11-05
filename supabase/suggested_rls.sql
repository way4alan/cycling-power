-- 這份草稿已停用。正式的政策在：
--   supabase/migrations/20261104164831_rls_lockdown.sql
-- 回復用：
--   supabase/rollback_rls.sql
-- 上線步驟（繁體中文）：
--   supabase/DEPLOY.zh-TW.md
--
-- 保留 raise，避免有人在 SQL Editor 誤執行舊稿。

do $$ begin
  raise exception '這份 suggested_rls.sql 已停用。請改執行 supabase/migrations/20261104164831_rls_lockdown.sql。步驟見 supabase/DEPLOY.zh-TW.md。';
end $$;
