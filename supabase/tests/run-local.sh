#!/usr/bin/env bash
# 本機等效測試：Postgres 16 + PostgREST（與正式環境相同的 JWT / RLS / 欄位權限路徑）。
# 不連線、不修改正式專案 yvgjaljdxmsmtljcmemp。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$HOME/.local/bin:$PATH"
RUNTIME=/tmp/pace-local
mkdir -p "$RUNTIME"
cleanup() {
  if [[ -f "$RUNTIME/postgrest.pid" ]]; then
    kill "$(cat "$RUNTIME/postgrest.pid")" 2>/dev/null || true
    rm -f "$RUNTIME/postgrest.pid"
  fi
}
trap cleanup EXIT
cleanup

sudo pg_ctlcluster 16 main start || true
sudo -u postgres psql -v ON_ERROR_STOP=1 -d postgres <<'SQL'
select pg_terminate_backend(pid) from pg_stat_activity where datname = 'pace' and pid <> pg_backend_pid();
drop database if exists pace;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator noinherit login password 'authenticator'; exception when duplicate_object then null; end $$;
alter role service_role bypassrls;
alter role authenticator noinherit login password 'authenticator';
grant anon, authenticated, service_role to authenticator;
create database pace;
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace <<'SQL'
create schema if not exists auth;
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb
$$;
create or replace function auth.role()
returns text
language sql
stable
as $$
  select auth.jwt() ->> 'role'
$$;
grant usage on schema auth to anon, authenticated, service_role, authenticator;
grant execute on all functions in schema auth to anon, authenticated, service_role, authenticator;
SQL

sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261104164830_baseline_schema.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261104164831_rls_lockdown.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261106170000_participation.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261106170000_participation.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261109150000_ride_categories.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261109150000_ride_categories.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261110150000_gear_garage.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261110150000_gear_garage.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261110180000_strava_sync.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261110180000_strava_sync.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261111180000_strava_backend_qualify.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261111180000_strava_backend_qualify.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261112120000_badges_compliance.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/migrations/20261112120000_badges_compliance.sql"
sudo -u postgres psql -v ON_ERROR_STOP=1 -d pace -f "$ROOT/supabase/tests/seed.sql"

cat > "$RUNTIME/postgrest.conf" <<'CONF'
db-uri = "postgresql://authenticator:authenticator@127.0.0.1:5432/pace"
db-schemas = "public"
db-anon-role = "anon"
db-extra-search-path = "public, auth"
jwt-secret = "super-secret-jwt-token-with-at-least-32-characters-long"
jwt-secret-is-base64 = false
server-host = "127.0.0.1"
server-port = 54321
CONF

postgrest "$RUNTIME/postgrest.conf" > "$RUNTIME/postgrest.log" 2>&1 &
echo $! > "$RUNTIME/postgrest.pid"
for _ in $(seq 1 50); do
  if curl -sf -o /dev/null "http://127.0.0.1:54321/" ; then break; fi
  sleep 0.1
done
if ! curl -sf -o /dev/null "http://127.0.0.1:54321/"; then
  echo "PostgREST 沒有起來" >&2
  cat "$RUNTIME/postgrest.log" >&2
  exit 1
fi

echo "== pace core =="
node --test "$ROOT/tests/pace-core.test.mjs" "$ROOT/tests/gear.test.mjs" "$ROOT/tests/strava-verify.test.mjs" "$ROOT/tests/challenges.test.mjs"

echo "== deno unit =="
deno test --allow-env "$ROOT/supabase/functions/line-auth/handler_test.ts" "$ROOT/supabase/functions/strava/handler_test.ts"

echo "== http rls =="
PACE_API=http://127.0.0.1:54321 node "$ROOT/supabase/tests/auth_rls.mjs"

echo "== strava backend sql =="
node "$ROOT/supabase/tests/strava_backend.mjs"

echo "== badges =="
node "$ROOT/supabase/tests/badges_rls.mjs"

if [[ ! -d /tmp/pace-jsdom/node_modules/jsdom ]]; then
  mkdir -p /tmp/pace-jsdom
  npm install --prefix /tmp/pace-jsdom jsdom --silent
fi
echo "== demo smoke =="
NODE_PATH=/tmp/pace-jsdom/node_modules node "$ROOT/supabase/tests/demo_smoke.mjs"

echo "ALL LOCAL CHECKS PASSED"
