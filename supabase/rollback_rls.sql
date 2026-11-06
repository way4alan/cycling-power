-- 回復用。只有網站在上了 rls_lockdown 之後壞掉、需要先恢復使用時才執行。
-- 執行後，anon key 又能讀寫全部資料，原本的漏洞會回來。
-- 資料（團員、團騎、報名、出席）不會被刪除。
-- 回復後請盡快修好再重新執行 supabase/migrations/20261104164831_rls_lockdown.sql。
-- 不要在網站正常時執行本檔。

drop trigger if exists riders_lock_privileged_columns on public.riders;
drop trigger if exists registrations_stamp_line_id on public.registrations;
drop trigger if exists registrations_check_group on public.registrations;

drop view if exists public.attendances_directory;
drop view if exists public.registrations_directory;
drop view if exists public.riders_directory;

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
drop policy if exists routes_select on public.routes;
drop policy if exists routes_write on public.routes;
drop policy if exists ride_groups_select on public.ride_groups;
drop policy if exists ride_groups_write on public.ride_groups;
drop policy if exists ride_templates_all on public.ride_templates;
drop policy if exists ride_template_groups_all on public.ride_template_groups;

drop function if exists private.registrations_check_group();
drop function if exists private.registrations_stamp_line_id();
drop function if exists private.riders_lock_privileged_columns();
drop function if exists private.is_self(text);
drop function if exists private.current_is_approved();
drop function if exists private.current_is_admin();
drop function if exists private.current_line_id();
drop function if exists private.skip_row_guard();
drop schema if exists private;

-- 以下是上線前正式環境的政策（全部 using / with check = true，角色 public）。
create policy "Anyone can read riders" on public.riders for select to public using (true);
create policy "Users can update own data" on public.riders for update to public using (true);
create policy "Users can upsert own data" on public.riders for insert to public with check (true);

create policy "Anyone can delete rides" on public.rides for delete to public using (true);
create policy "Anyone can insert rides" on public.rides for insert to public with check (true);
create policy "Anyone can read rides" on public.rides for select to public using (true);
create policy "Anyone can update rides" on public.rides for update to public using (true);

create policy "Anyone can delete locations" on public.locations for delete to public using (true);
create policy "Anyone can insert locations" on public.locations for insert to public with check (true);
create policy "Anyone can read locations" on public.locations for select to public using (true);
create policy "Anyone can update locations" on public.locations for update to public using (true);

create policy "Anyone can delete guidelines" on public.guidelines for delete to public using (true);
create policy "Anyone can insert guidelines" on public.guidelines for insert to public with check (true);
create policy "Anyone can read guidelines" on public.guidelines for select to public using (true);
create policy "Anyone can update guidelines" on public.guidelines for update to public using (true);

create policy "Anyone can delete registrations" on public.registrations for delete to public using (true);
create policy "Anyone can insert registrations" on public.registrations for insert to public with check (true);
create policy "Anyone can read registrations" on public.registrations for select to public using (true);

create policy "Anyone can delete attendances" on public.attendances for delete to public using (true);
create policy "Anyone can insert attendances" on public.attendances for insert to public with check (true);
create policy "Anyone can read attendances" on public.attendances for select to public using (true);

create policy "Anyone can delete weather_locations" on public.weather_locations for delete to public using (true);
create policy "Anyone can insert weather_locations" on public.weather_locations for insert to public with check (true);
create policy "Anyone can read weather_locations" on public.weather_locations for select to public using (true);

grant all on
  public.riders,
  public.rides,
  public.locations,
  public.guidelines,
  public.registrations,
  public.attendances,
  public.weather_locations
to anon, authenticated, service_role;
