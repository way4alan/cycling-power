-- PACE 沛速車隊 — 正式環境要執行的權限鎖定。
--
-- 前提：supabase/functions/line-auth 已部署，前端已改用它簽發的 JWT。
-- 身分只看 JWT 裡的 line_user_id（由 LINE ID token 驗證後寫入），不看客戶端送上來的欄位。
-- 本檔可重複執行。它不會刪除團員、團騎或報名資料。
-- 出問題時用 supabase/rollback_rls.sql 回復舊的開放政策（漏洞會回來）。

do $$ begin
  if to_regprocedure('auth.jwt()') is null then
    raise exception 'auth.jwt() 不存在。這個 migration 只能在 Supabase（或已建立 auth.jwt 的本機測試庫）執行。';
  end if;
end $$;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- 維護連線（沒有 JWT 的 postgres / supabase_admin，或 service_role）略過欄位鎖，
-- 避免 Dashboard 的 SQL 與 service key 無法修資料。一般團員的 JWT 不會走這裡。
create or replace function private.skip_row_guard()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
    or (
      coalesce(auth.jwt() ->> 'role', '') = ''
      and session_user in ('postgres', 'supabase_admin')
    )
$$;

create or replace function private.current_line_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(auth.jwt() ->> 'line_user_id', '')
$$;

create or replace function private.current_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.riders
    where line_user_id = private.current_line_id()
      and is_admin is true
      and status = 'approved'
  )
$$;

create or replace function private.current_is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.riders
    where line_user_id = private.current_line_id()
      and status = 'approved'
  )
$$;

-- 政策把列上的 line_user_id 傳進來，避免呼叫端需要該欄位的 SELECT 權限。
create or replace function private.is_self(line_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select line_id is not null and line_id = private.current_line_id()
$$;

create or replace function private.riders_lock_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.skip_row_guard() or private.current_is_admin() then
    if tg_op = 'UPDATE' then
      new.id := old.id;
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.status := 'pending';
    new.attendance_count := 0;
    new.name_color := '';
    new.line_user_id := private.current_line_id();
    if new.line_user_id is null then
      raise exception 'missing line identity' using errcode = '42501';
    end if;
    return new;
  end if;
  new.id := old.id;
  new.is_admin := old.is_admin;
  new.status := old.status;
  new.attendance_count := old.attendance_count;
  new.line_user_id := old.line_user_id;
  if coalesce(old.attendance_count, 0) < 10 then
    new.name_color := old.name_color;
  end if;
  return new;
end;
$$;

-- 非管理員的報名一律改寫成自己的 line_user_id，忽略請求內容。
create or replace function private.registrations_stamp_line_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.skip_row_guard() then
    return new;
  end if;
  if not private.current_is_admin() then
    new.line_user_id := private.current_line_id();
  elsif new.line_user_id is null or btrim(new.line_user_id) = '' then
    new.line_user_id := private.current_line_id();
  end if;
  if new.line_user_id is null or btrim(new.line_user_id) = '' then
    raise exception 'missing line identity' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function
  private.skip_row_guard(),
  private.current_line_id(),
  private.current_is_admin(),
  private.current_is_approved(),
  private.is_self(text),
  private.riders_lock_privileged_columns(),
  private.registrations_stamp_line_id()
from public, anon;

grant execute on function
  private.current_line_id(),
  private.current_is_admin(),
  private.current_is_approved(),
  private.is_self(text),
  private.riders_lock_privileged_columns(),
  private.registrations_stamp_line_id()
to authenticated;

grant execute on function
  private.skip_row_guard(),
  private.current_line_id(),
  private.current_is_admin(),
  private.current_is_approved(),
  private.is_self(text),
  private.riders_lock_privileged_columns(),
  private.registrations_stamp_line_id()
to service_role;

drop trigger if exists riders_lock_privileged_columns on public.riders;
create trigger riders_lock_privileged_columns
  before insert or update on public.riders
  for each row execute function private.riders_lock_privileged_columns();

drop trigger if exists registrations_stamp_line_id on public.registrations;
create trigger registrations_stamp_line_id
  before insert or update on public.registrations
  for each row execute function private.registrations_stamp_line_id();

alter table public.riders enable row level security;
alter table public.rides enable row level security;
alter table public.locations enable row level security;
alter table public.weather_locations enable row level security;
alter table public.guidelines enable row level security;
alter table public.registrations enable row level security;
alter table public.attendances enable row level security;

alter table public.riders force row level security;
alter table public.rides force row level security;
alter table public.locations force row level security;
alter table public.weather_locations force row level security;
alter table public.guidelines force row level security;
alter table public.registrations force row level security;
alter table public.attendances force row level security;

-- 舊的「任何人都可以」政策。
drop policy if exists "Anyone can read riders" on public.riders;
drop policy if exists "Users can update own data" on public.riders;
drop policy if exists "Users can upsert own data" on public.riders;
drop policy if exists "Anyone can delete rides" on public.rides;
drop policy if exists "Anyone can insert rides" on public.rides;
drop policy if exists "Anyone can read rides" on public.rides;
drop policy if exists "Anyone can update rides" on public.rides;
drop policy if exists "Anyone can delete locations" on public.locations;
drop policy if exists "Anyone can insert locations" on public.locations;
drop policy if exists "Anyone can read locations" on public.locations;
drop policy if exists "Anyone can update locations" on public.locations;
drop policy if exists "Anyone can delete guidelines" on public.guidelines;
drop policy if exists "Anyone can insert guidelines" on public.guidelines;
drop policy if exists "Anyone can read guidelines" on public.guidelines;
drop policy if exists "Anyone can update guidelines" on public.guidelines;
drop policy if exists "Anyone can delete registrations" on public.registrations;
drop policy if exists "Anyone can insert registrations" on public.registrations;
drop policy if exists "Anyone can read registrations" on public.registrations;
drop policy if exists "Anyone can delete attendances" on public.attendances;
drop policy if exists "Anyone can insert attendances" on public.attendances;
drop policy if exists "Anyone can read attendances" on public.attendances;
drop policy if exists "Anyone can delete weather_locations" on public.weather_locations;
drop policy if exists "Anyone can insert weather_locations" on public.weather_locations;
drop policy if exists "Anyone can read weather_locations" on public.weather_locations;

drop policy if exists riders_select on public.riders;
drop policy if exists riders_insert_self on public.riders;
drop policy if exists riders_update_self_or_admin on public.riders;
drop policy if exists riders_delete_admin on public.riders;
drop policy if exists rides_select on public.rides;
drop policy if exists rides_write on public.rides;
drop policy if exists locations_select on public.locations;
drop policy if exists locations_write on public.locations;
drop policy if exists weather_locations_select on public.weather_locations;
drop policy if exists weather_locations_write on public.weather_locations;
drop policy if exists guidelines_select on public.guidelines;
drop policy if exists guidelines_write on public.guidelines;
drop policy if exists registrations_select on public.registrations;
drop policy if exists registrations_insert on public.registrations;
drop policy if exists registrations_update on public.registrations;
drop policy if exists registrations_delete on public.registrations;
drop policy if exists attendances_select on public.attendances;
drop policy if exists attendances_write on public.attendances;

create policy riders_select on public.riders
  for select to authenticated
  using (
    status = 'approved'
    or private.is_self(line_user_id)
    or (select private.current_is_admin())
  );

create policy riders_insert_self on public.riders
  for insert to authenticated
  with check (
    private.is_self(line_user_id)
    or (select private.current_is_admin())
  );

create policy riders_update_self_or_admin on public.riders
  for update to authenticated
  using (
    private.is_self(line_user_id)
    or (select private.current_is_admin())
  )
  with check (
    private.is_self(line_user_id)
    or (select private.current_is_admin())
  );

create policy riders_delete_admin on public.riders
  for delete to authenticated
  using ((select private.current_is_admin()));

create policy rides_select on public.rides
  for select to authenticated
  using (true);
create policy rides_write on public.rides
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));

create policy locations_select on public.locations
  for select to authenticated
  using (true);
create policy locations_write on public.locations
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));

create policy weather_locations_select on public.weather_locations
  for select to authenticated
  using (true);
create policy weather_locations_write on public.weather_locations
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));

create policy guidelines_select on public.guidelines
  for select to authenticated
  using (true);
create policy guidelines_write on public.guidelines
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));

create policy registrations_select on public.registrations
  for select to authenticated
  using (true);
create policy registrations_insert on public.registrations
  for insert to authenticated
  with check (
    (
      private.is_self(line_user_id)
      and (select private.current_is_approved())
    )
    or (select private.current_is_admin())
  );
create policy registrations_update on public.registrations
  for update to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));
create policy registrations_delete on public.registrations
  for delete to authenticated
  using (
    private.is_self(line_user_id)
    or (select private.current_is_admin())
  );

create policy attendances_select on public.attendances
  for select to authenticated
  using (true);
create policy attendances_write on public.attendances
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));

-- 讀取用的目錄。security_barrier + 非 invoker：由擁有者讀原表，再把別人的 line_user_id 遮成 null。
-- 一般團員仍看得到姓名、FTP、報名名單；LINE ID 只留給本人與管理員。
-- rider_id 是 riders.id，用來對出席名單，不是 LINE ID。
create or replace view public.riders_directory
with (security_barrier = true, security_invoker = false) as
select
  r.id,
  case
    when private.is_self(r.line_user_id) or private.current_is_admin() then r.line_user_id
    else null
  end as line_user_id,
  r.name,
  r.avatar_url,
  r.ftp,
  r.weight,
  r.z1,
  r.z2,
  r.z3,
  r.z4,
  r.z5,
  r.updated_at,
  r.status,
  r.mood,
  r.last_seen,
  r.is_admin,
  r.tire_width,
  r.attendance_count,
  r.name_color
from public.riders r
where r.status = 'approved'
   or private.is_self(r.line_user_id)
   or private.current_is_admin();

create or replace view public.registrations_directory
with (security_barrier = true, security_invoker = false) as
select
  g.id,
  g.ride_id,
  case
    when private.is_self(g.line_user_id) or private.current_is_admin() then g.line_user_id
    else null
  end as line_user_id,
  g.name,
  g.avatar_url,
  g.created_at,
  r.id as rider_id
from public.registrations g
left join public.riders r on r.line_user_id = g.line_user_id;

create or replace view public.attendances_directory
with (security_barrier = true, security_invoker = false) as
select
  a.id,
  a.ride_id,
  case
    when private.is_self(a.line_user_id) or private.current_is_admin() then a.line_user_id
    else null
  end as line_user_id,
  a.name,
  a.avatar_url,
  a.confirmed_at,
  r.id as rider_id
from public.attendances a
left join public.riders r on r.line_user_id = a.line_user_id;

revoke all on public.riders_directory, public.registrations_directory, public.attendances_directory
  from public, anon;
grant select on public.riders_directory, public.registrations_directory, public.attendances_directory
  to authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on
  public.riders,
  public.rides,
  public.locations,
  public.guidelines,
  public.registrations,
  public.attendances,
  public.weather_locations
to authenticated;

grant all on
  public.riders,
  public.rides,
  public.locations,
  public.guidelines,
  public.registrations,
  public.attendances,
  public.weather_locations
to service_role;

revoke all on
  public.riders,
  public.rides,
  public.locations,
  public.guidelines,
  public.registrations,
  public.attendances,
  public.weather_locations
from anon, public;

revoke truncate, trigger, references on
  public.riders,
  public.rides,
  public.locations,
  public.guidelines,
  public.registrations,
  public.attendances,
  public.weather_locations
from authenticated;

revoke select (line_user_id) on public.riders from anon, authenticated, public;
revoke select (line_user_id) on public.registrations from anon, authenticated, public;
revoke select (line_user_id) on public.attendances from anon, authenticated, public;

-- 表級 SELECT 無法用「撤銷單一欄」挖洞，必須改成逐欄授權才擋得住 line_user_id。
revoke select on public.riders, public.registrations, public.attendances from authenticated;
grant select (
  id, name, avatar_url, ftp, weight, z1, z2, z3, z4, z5,
  updated_at, status, mood, last_seen, is_admin, tire_width,
  attendance_count, name_color
) on public.riders to authenticated;
grant select (id, ride_id, name, avatar_url, created_at)
  on public.registrations to authenticated;
grant select (id, ride_id, name, avatar_url, confirmed_at)
  on public.attendances to authenticated;
