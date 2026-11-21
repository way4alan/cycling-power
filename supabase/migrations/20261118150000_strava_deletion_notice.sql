-- Strava 端解除授權時，只記下「這個人已刪除」和時間，不存任何 Strava 資料。
-- 另外在 pg_cron 可用時，每天跑一次 purge_expired_strava_cache()。
-- 這支只新增資料表、函式和排程，不刪既有車、輪組、里程或已確認的紀錄。可以再執行一次。
--
-- 回復：
--   select cron.unschedule('purge-expired-strava-cache');  -- 有排程才需要
--   drop trigger if exists strava_deletion_notice_guard on public.strava_deletion_notices;
--   drop function if exists private.guard_strava_deletion_notice();
--   drop function if exists public.note_strava_deletion(text);
--   drop table if exists public.strava_deletion_notices;
-- 不要把 purge_expired_strava_cache() 一起刪掉，那是上一版就有的清理函式。
--
-- 若這台資料庫沒有 pg_cron：到 Supabase → Integrations → Cron，每天執行
--   select public.purge_expired_strava_cache();
-- 或用 service role 每天打一次同一個函式。沒有排程時，7 天快取不會自動清掉。

create table if not exists public.strava_deletion_notices (
  line_user_id text primary key,
  recorded_at timestamptz not null default now(),
  dismissed_at timestamptz
);

alter table public.strava_deletion_notices enable row level security;
alter table public.strava_deletion_notices force row level security;

drop policy if exists strava_deletion_notices_select on public.strava_deletion_notices;
drop policy if exists strava_deletion_notices_update on public.strava_deletion_notices;
create policy strava_deletion_notices_select on public.strava_deletion_notices
  for select to authenticated
  using (private.is_self(line_user_id));
create policy strava_deletion_notices_update on public.strava_deletion_notices
  for update to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));

grant select, update on public.strava_deletion_notices to authenticated;
grant all on public.strava_deletion_notices to service_role;
revoke all on public.strava_deletion_notices from public, anon;

create or replace function private.guard_strava_deletion_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.skip_row_guard() then
    return new;
  end if;
  new.line_user_id := old.line_user_id;
  new.recorded_at := old.recorded_at;
  return new;
end;
$$;

drop trigger if exists strava_deletion_notice_guard on public.strava_deletion_notices;
create trigger strava_deletion_notice_guard
  before update on public.strava_deletion_notices
  for each row execute function private.guard_strava_deletion_notice();

revoke all on function private.guard_strava_deletion_notice() from public, anon, authenticated;

create or replace function public.note_strava_deletion(target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') is distinct from 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if coalesce(target, '') = '' then
    return;
  end if;
  insert into public.strava_deletion_notices (line_user_id, recorded_at, dismissed_at)
  values (target, now(), null)
  on conflict (line_user_id) do update
    set recorded_at = excluded.recorded_at,
        dismissed_at = null;
end;
$$;

revoke all on function public.note_strava_deletion(text) from public, anon, authenticated;
grant execute on function public.note_strava_deletion(text) to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      if exists (select 1 from cron.job where jobname = 'purge-expired-strava-cache') then
        perform cron.unschedule('purge-expired-strava-cache');
      end if;
      perform cron.schedule(
        'purge-expired-strava-cache',
        '15 18 * * *',
        'select public.purge_expired_strava_cache()'
      );
    exception
      when insufficient_privilege or undefined_table or undefined_function or undefined_object then
        raise notice 'pg_cron is listed but could not be scheduled. Run select public.purge_expired_strava_cache() once a day from Supabase Cron or a service-role scheduler.';
    end;
  else
    raise notice 'pg_cron is not available. Schedule select public.purge_expired_strava_cache() once a day from Supabase Cron or a service-role scheduler.';
  end if;
end $$;
