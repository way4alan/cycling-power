-- 個人完攀徽章、本人確認，以及 Strava 暫存 7 天清除。可重複執行。
-- 確認後的徽章是 PACE 自己的紀錄。原始活動仍只在 pending_activities，超過 7 天刪除。

alter table public.riders add column if not exists bio text not null default '';
alter table public.riders add column if not exists share_garage boolean not null default false;
alter table public.riders add column if not exists share_power boolean not null default false;
alter table public.riders add column if not exists history_scan_used boolean not null default false;
alter table public.pending_activities add column if not exists device_name text not null default '';
alter table public.pending_activities add column if not exists cached_at timestamptz not null default now();

create table if not exists public.member_badges (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  badge_key text not null,
  tier text not null default '',
  earned_on date not null,
  created_at timestamptz not null default now(),
  unique (line_user_id, badge_key)
);

create table if not exists public.badge_prompts (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  badge_key text not null,
  tier text not null default '',
  earned_on date not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists public.ride_checkin_prompts (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  ride_id uuid,
  ride_title text not null default '',
  ride_date date,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

create table if not exists public.ftp_prompts (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  proposed_ftp integer not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

do $$ begin
  alter table public.badge_prompts add constraint badge_prompts_status check (status in ('pending', 'confirmed', 'dismissed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_checkin_prompts add constraint ride_checkin_prompts_status check (status in ('pending', 'confirmed', 'dismissed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ftp_prompts add constraint ftp_prompts_status check (status in ('pending', 'confirmed', 'dismissed'));
exception when duplicate_object then null; end $$;

alter table public.member_badges enable row level security;
alter table public.member_badges force row level security;
alter table public.badge_prompts enable row level security;
alter table public.badge_prompts force row level security;
alter table public.ride_checkin_prompts enable row level security;
alter table public.ride_checkin_prompts force row level security;
alter table public.ftp_prompts enable row level security;
alter table public.ftp_prompts force row level security;

drop policy if exists member_badges_read on public.member_badges;
drop policy if exists member_badges_write on public.member_badges;
create policy member_badges_read on public.member_badges for select to authenticated
  using (private.current_is_approved());
create policy member_badges_write on public.member_badges for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));

drop policy if exists badge_prompts_self on public.badge_prompts;
create policy badge_prompts_self on public.badge_prompts for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
drop policy if exists ride_checkin_prompts_self on public.ride_checkin_prompts;
create policy ride_checkin_prompts_self on public.ride_checkin_prompts for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
drop policy if exists ftp_prompts_self on public.ftp_prompts;
create policy ftp_prompts_self on public.ftp_prompts for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));

grant select on public.member_badges to authenticated;
grant select, insert, update, delete on public.member_badges, public.badge_prompts, public.ride_checkin_prompts, public.ftp_prompts to authenticated;
grant all on public.member_badges, public.badge_prompts, public.ride_checkin_prompts, public.ftp_prompts to service_role;
revoke all on public.member_badges, public.badge_prompts, public.ride_checkin_prompts, public.ftp_prompts from anon, public;

-- 本人若打開「公開車庫」，其他已核准成員才看得到車。管理員沒有額外權限。
-- 政策不能直接查 riders，一般成員沒有那張表的權限。
create or replace function private.shares_garage(target text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.riders r
    where r.line_user_id = target and r.share_garage is true and r.status = 'approved'
  )
$$;
revoke all on function private.shares_garage(text) from public, anon;
grant execute on function private.shares_garage(text) to authenticated, service_role;
drop policy if exists bikes_all on public.bikes;
drop policy if exists bikes_select on public.bikes;
drop policy if exists bikes_write on public.bikes;
drop policy if exists bikes_update on public.bikes;
drop policy if exists bikes_delete on public.bikes;
create policy bikes_select on public.bikes for select to authenticated
  using (
    private.is_self(line_user_id)
    or (private.current_is_approved() and private.shares_garage(line_user_id))
  );
create policy bikes_write on public.bikes for insert to authenticated
  with check (private.is_self(line_user_id));
create policy bikes_update on public.bikes for update to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
create policy bikes_delete on public.bikes for delete to authenticated
  using (private.is_self(line_user_id));

create or replace function public.purge_expired_strava_cache()
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
  delete from public.pending_activities where cached_at < now() - interval '7 days';
  delete from public.badge_prompts where status = 'pending' and expires_at < now();
  delete from public.ride_checkin_prompts where status = 'pending' and expires_at < now();
  delete from public.ftp_prompts where status = 'pending' and expires_at < now();
end;
$$;

revoke all on function public.purge_expired_strava_cache() from public, anon, authenticated;
grant execute on function public.purge_expired_strava_cache() to service_role;

create table if not exists public.team_badges (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  badge_key text not null,
  year integer not null,
  earned_on date not null,
  created_at timestamptz not null default now(),
  unique (line_user_id, badge_key, year)
);
alter table public.team_badges enable row level security;
alter table public.team_badges force row level security;
drop policy if exists team_badges_read on public.team_badges;
create policy team_badges_read on public.team_badges for select to authenticated
  using (private.current_is_approved());
grant select on public.team_badges to authenticated;
grant all on public.team_badges to service_role;
revoke all on public.team_badges from anon, public;

drop policy if exists wheelsets_shared on public.wheelsets;
create policy wheelsets_shared on public.wheelsets for select to authenticated
  using (private.current_is_approved() and private.shares_garage(line_user_id));
drop policy if exists gear_components_shared on public.gear_components;
create policy gear_components_shared on public.gear_components for select to authenticated
  using (private.current_is_approved() and private.shares_garage(line_user_id));
drop policy if exists chain_replacements_shared on public.chain_replacements;
create policy chain_replacements_shared on public.chain_replacements for select to authenticated
  using (private.current_is_approved() and private.shares_garage(line_user_id));

create or replace function public.forget_member_strava(target text)
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
  delete from public.pending_activities where line_user_id = target;
  delete from public.badge_prompts where line_user_id = target and status = 'pending';
  delete from public.ride_checkin_prompts where line_user_id = target and status = 'pending';
  delete from public.ftp_prompts where line_user_id = target and status = 'pending';
end;
$$;

create or replace function public.forget_my_strava_cache()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me text := private.current_line_id();
begin
  if me is null or not private.current_is_approved() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.pending_activities where line_user_id = me;
  delete from public.badge_prompts where line_user_id = me and status = 'pending';
  delete from public.ride_checkin_prompts where line_user_id = me and status = 'pending';
  delete from public.ftp_prompts where line_user_id = me and status = 'pending';
end;
$$;

create or replace function public.confirm_my_badge(prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.badge_prompts%rowtype;
  rank_next int;
  rank_old int;
begin
  if not private.current_is_approved() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into found from public.badge_prompts
    where id = prompt_id and line_user_id = private.current_line_id() and status = 'pending';
  if found.id is null then
    raise exception 'missing' using errcode = 'P0002';
  end if;
  rank_next := case found.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end;
  insert into public.member_badges as b (line_user_id, badge_key, tier, earned_on)
  values (found.line_user_id, found.badge_key, found.tier, found.earned_on)
  on conflict (line_user_id, badge_key) do update
    set tier = case
          when b.badge_key = 'west_wuling' and (
            case excluded.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end
          ) > (
            case b.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end
          ) then excluded.tier
          else b.tier
        end,
        earned_on = case
          when b.badge_key = 'west_wuling' and (
            case excluded.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end
          ) > (
            case b.tier when 'sub2' then 4 when 'sub3' then 3 when 'sub4' then 2 when 'finisher' then 1 else 0 end
          ) then excluded.earned_on
          else b.earned_on
        end;
  update public.badge_prompts set status = 'confirmed' where id = found.id;
end;
$$;

create or replace function public.dismiss_my_prompt(kind text, prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me text := private.current_line_id();
begin
  if me is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if kind = 'badge' then
    update public.badge_prompts set status = 'dismissed' where id = prompt_id and line_user_id = me and status = 'pending';
  elsif kind = 'checkin' then
    update public.ride_checkin_prompts set status = 'dismissed' where id = prompt_id and line_user_id = me and status = 'pending';
  elsif kind = 'ftp' then
    update public.ftp_prompts set status = 'dismissed' where id = prompt_id and line_user_id = me and status = 'pending';
  else
    raise exception 'unknown kind' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.confirm_my_checkin(prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.ride_checkin_prompts%rowtype;
  me_name text;
begin
  if not private.current_is_approved() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into found from public.ride_checkin_prompts
    where id = prompt_id and line_user_id = private.current_line_id() and status = 'pending';
  if found.id is null or found.ride_id is null then
    raise exception 'missing' using errcode = 'P0002';
  end if;
  select name into me_name from public.riders where line_user_id = found.line_user_id;
  insert into public.attendances (ride_id, line_user_id, name)
  values (found.ride_id, found.line_user_id, coalesce(me_name, ''))
  on conflict (ride_id, line_user_id) do nothing;
  update public.ride_checkin_prompts set status = 'confirmed' where id = found.id;
end;
$$;

create or replace function public.confirm_my_ftp(prompt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.ftp_prompts%rowtype;
begin
  if not private.current_is_approved() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into found from public.ftp_prompts
    where id = prompt_id and line_user_id = private.current_line_id() and status = 'pending';
  if found.id is null or found.proposed_ftp is null or found.proposed_ftp <= 0 then
    raise exception 'missing' using errcode = 'P0002';
  end if;
  update public.riders set ftp = found.proposed_ftp, updated_at = now()
    where line_user_id = found.line_user_id;
  update public.ftp_prompts set status = 'confirmed' where id = found.id;
end;
$$;

revoke insert, update, delete on public.member_badges from authenticated;
revoke insert, update, delete on public.badge_prompts, public.ride_checkin_prompts, public.ftp_prompts from authenticated;

revoke all on function public.forget_member_strava(text) from public, anon, authenticated;
grant execute on function public.forget_member_strava(text) to service_role;
revoke all on function public.forget_my_strava_cache() from public, anon;
grant execute on function public.forget_my_strava_cache() to authenticated;
revoke all on function public.confirm_my_badge(uuid) from public, anon;
grant execute on function public.confirm_my_badge(uuid) to authenticated;
revoke all on function public.dismiss_my_prompt(text, uuid) from public, anon;
grant execute on function public.dismiss_my_prompt(text, uuid) to authenticated;
revoke all on function public.confirm_my_checkin(uuid) from public, anon;
grant execute on function public.confirm_my_checkin(uuid) to authenticated;
revoke all on function public.confirm_my_ftp(uuid) from public, anon;
grant execute on function public.confirm_my_ftp(uuid) to authenticated;

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
  r.name_color,
  r.bio,
  r.share_garage,
  r.share_power,
  case when private.is_self(r.line_user_id) then r.history_scan_used else false end as history_scan_used
from public.riders r
where r.status = 'approved'
   or private.is_self(r.line_user_id)
   or private.current_is_admin();

create or replace view public.member_badges_public
with (security_barrier = true, security_invoker = false) as
select
  b.id,
  r.id as rider_id,
  b.badge_key,
  b.tier,
  b.earned_on
from public.member_badges b
join public.riders r on r.line_user_id = b.line_user_id
where r.status = 'approved'
  and private.current_is_approved();

create or replace view public.garage_public
with (security_barrier = true, security_invoker = false) as
select
  r.id as rider_id,
  b.id as bike_id,
  b.name,
  b.brand,
  b.odometer_km
from public.bikes b
join public.riders r on r.line_user_id = b.line_user_id
where r.status = 'approved'
  and r.share_garage is true
  and b.archived is not true
  and private.current_is_approved();

grant select on public.riders_directory, public.member_badges_public, public.garage_public to authenticated, service_role;
revoke all on public.member_badges_public, public.garage_public from anon, public;
