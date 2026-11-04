-- PACE 沛速車隊 — 建議的 RLS（尚未套用）
--
-- 現況：瀏覽器帶著 anon key 直接寫入 Supabase。anon key 會出現在前端，
-- 不能當成身分證明。在還沒有「可驗證的使用者身分」之前，不要執行本檔，
-- 否則一般團員的報名、改資料、管理員審核都會被擋住，或反過來仍然能冒充別人。
--
-- 建議先做這件事，再啟用下面的政策：
-- 1. 用 LINE access token 打一支只在伺服器跑的函式（Edge Function）。
-- 2. 函式向 LINE 驗證 token，確認 line_user_id。
-- 3. 簽發 Supabase JWT，role = authenticated，自訂 claim：line_user_id。
-- 4. is_admin 只放在 riders 表，不允許使用者自己改。
-- 5. 前端改為使用該 JWT，不要再信任從表單送上來的 line_user_id。
--
-- 套用前請在 staging 用真實 LINE 登入走一遍：
-- 申請加入、改自己的 FTP、報名／取消、管理員核准、出席、刪除團騎與集合點。
--
-- 下面第一段會故意失敗，避免有人直接在正式環境按下執行。
-- 確認 LINE JWT 已經上線後，再刪掉這段 raise。

do $$ begin
  raise exception 'DO NOT APPLY YET — 先完成 LINE access token 換 Supabase JWT，再刪掉這段。詳見檔案開頭說明。';
end $$;

-- create schema if not exists private;

create or replace function public.current_line_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'line_user_id', '')
$$;

create or replace function public.current_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.riders
    where line_user_id = public.current_line_id()
      and is_admin is true
      and status = 'approved'
  )
$$;

-- 避免使用者把 is_admin、status、attendance_count、line_user_id 改成自己要的值。
create or replace function public.riders_lock_privileged_columns()
returns trigger
language plpgsql
as $$
begin
  if public.current_is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_admin := false;
    new.status := 'pending';
    new.attendance_count := 0;
    new.line_user_id := public.current_line_id();
    return new;
  end if;
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

-- drop trigger if exists riders_lock_privileged_columns on public.riders;
-- create trigger riders_lock_privileged_columns
--   before insert or update on public.riders
--   for each row execute function public.riders_lock_privileged_columns();

alter table public.riders enable row level security;
alter table public.rides enable row level security;
alter table public.locations enable row level security;
alter table public.weather_locations enable row level security;
alter table public.guidelines enable row level security;
alter table public.registrations enable row level security;
alter table public.attendances enable row level security;

-- riders：排行榜看得到已核准成員；自己看得到自己的待審資料；管理員看全部。
-- drop policy if exists riders_select on public.riders;
create policy riders_select on public.riders
  for select to authenticated
  using (
    status = 'approved'
    or line_user_id = public.current_line_id()
    or public.current_is_admin()
  );

-- drop policy if exists riders_insert_self on public.riders;
create policy riders_insert_self on public.riders
  for insert to authenticated
  with check (line_user_id = public.current_line_id());

-- drop policy if exists riders_update_self_or_admin on public.riders;
create policy riders_update_self_or_admin on public.riders
  for update to authenticated
  using (line_user_id = public.current_line_id() or public.current_is_admin())
  with check (line_user_id = public.current_line_id() or public.current_is_admin());

-- drop policy if exists riders_delete_admin on public.riders;
create policy riders_delete_admin on public.riders
  for delete to authenticated
  using (public.current_is_admin());

-- rides / locations / guidelines / weather_locations：全員可讀，只有管理員可寫。
-- drop policy if exists rides_select on public.rides;
create policy rides_select on public.rides for select to authenticated using (true);
-- drop policy if exists rides_write on public.rides;
create policy rides_write on public.rides for all to authenticated
  using (public.current_is_admin()) with check (public.current_is_admin());

-- drop policy if exists locations_select on public.locations;
create policy locations_select on public.locations for select to authenticated using (true);
-- drop policy if exists locations_write on public.locations;
create policy locations_write on public.locations for all to authenticated
  using (public.current_is_admin()) with check (public.current_is_admin());

-- drop policy if exists weather_locations_select on public.weather_locations;
create policy weather_locations_select on public.weather_locations for select to authenticated using (true);
-- drop policy if exists weather_locations_write on public.weather_locations;
create policy weather_locations_write on public.weather_locations for all to authenticated
  using (public.current_is_admin()) with check (public.current_is_admin());

-- drop policy if exists guidelines_select on public.guidelines;
create policy guidelines_select on public.guidelines for select to authenticated using (true);
-- drop policy if exists guidelines_write on public.guidelines;
create policy guidelines_write on public.guidelines for all to authenticated
  using (public.current_is_admin()) with check (public.current_is_admin());

-- registrations：看得到名單；只能新增／刪除自己的報名；管理員可代加。
-- drop policy if exists registrations_select on public.registrations;
create policy registrations_select on public.registrations for select to authenticated using (true);
-- drop policy if exists registrations_insert on public.registrations;
create policy registrations_insert on public.registrations
  for insert to authenticated
  with check (line_user_id = public.current_line_id() or public.current_is_admin());
-- drop policy if exists registrations_update on public.registrations;
create policy registrations_update on public.registrations
  for update to authenticated
  using (public.current_is_admin()) with check (public.current_is_admin());
-- drop policy if exists registrations_delete on public.registrations;
create policy registrations_delete on public.registrations
  for delete to authenticated
  using (line_user_id = public.current_line_id() or public.current_is_admin());

-- attendances：全員可讀出席名單；只有管理員可寫。出席次數的增減也應只靠管理員。
-- drop policy if exists attendances_select on public.attendances;
create policy attendances_select on public.attendances for select to authenticated using (true);
-- drop policy if exists attendances_write on public.attendances;
create policy attendances_write on public.attendances for all to authenticated
  using (public.current_is_admin()) with check (public.current_is_admin());

-- anon 與 authenticated 都不應再拿到繞過 RLS 的寫入能力。
-- 確認沒有把 service_role key 放進前端。AQICN token 也建議改由 Edge Function 代理。
