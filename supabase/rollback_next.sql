-- 只收回「團騎參加 / 範本 / 路線庫」這次新增的結構。
-- 不打開舊的 anon 權限，也不刪既有團員、團騎、報名、出席。
-- 會刪掉這次新增的組別、範本、路線，以及團騎上新加的欄位（距離、爬升、來源鍵等）。
-- 不要在想保留這些新資料時執行。

drop trigger if exists registrations_check_group on public.registrations;
drop function if exists private.registrations_check_group();

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

revoke all on public.registrations_directory from public, anon;
grant select on public.registrations_directory to authenticated, service_role;

alter table public.registrations drop constraint if exists registrations_group_id_fkey;
alter table public.rides drop constraint if exists rides_route_id_fkey;
alter table public.ride_templates drop constraint if exists ride_templates_route_id_fkey;

drop policy if exists routes_select on public.routes;
drop policy if exists routes_write on public.routes;
drop policy if exists ride_groups_select on public.ride_groups;
drop policy if exists ride_groups_write on public.ride_groups;
drop policy if exists ride_templates_all on public.ride_templates;
drop policy if exists ride_template_groups_all on public.ride_template_groups;

drop table if exists public.ride_template_groups;
drop table if exists public.ride_templates;
drop table if exists public.ride_groups;
drop table if exists public.routes;

alter table public.registrations drop column if exists group_id;

alter table public.rides drop constraint if exists rides_pace_note_len;
alter table public.rides drop constraint if exists rides_source_key_shape;
alter table public.rides drop constraint if exists rides_distance_range;
alter table public.rides drop constraint if exists rides_ascent_range;
drop index if exists public.rides_source_key_uidx;
drop index if exists public.rides_route_id_idx;
alter table public.rides drop column if exists source_key;
alter table public.rides drop column if exists route_id;
alter table public.rides drop column if exists ascent_estimated;
alter table public.rides drop column if exists distance_estimated;
alter table public.rides drop column if exists ascent_m;
alter table public.rides drop column if exists distance_km;
alter table public.rides drop column if exists pace_note;
alter table public.rides drop column if exists cancelled;
