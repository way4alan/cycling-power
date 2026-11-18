-- 輪組改成屬於人，不再綁在某一台車。
-- 上線順序：先套用這支 migration，再部署前端。Strava edge function 不用先重新部署，
-- strava_backend 會用裝上紀錄決定活動當下的輪組。
-- 不刪任何車、輪組、耗材、換鍊或里程。已封存的車，輪組卸下但保留。

alter table public.wheelsets add column if not exists archived boolean not null default false;
alter table public.bikes add column if not exists baseline_km numeric not null default 0;
alter table public.wheelsets add column if not exists baseline_km numeric not null default 0;
alter table public.gear_components add column if not exists baseline_km numeric not null default 0;
alter table public.wheelsets alter column bike_id drop not null;

create table if not exists public.wheelset_mounts (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  bike_id uuid not null references public.bikes (id) on delete cascade,
  wheelset_id uuid not null references public.wheelsets (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_at is null or end_at > start_at)
);

create index if not exists wheelset_mounts_bike_idx on public.wheelset_mounts (bike_id, start_at);
create index if not exists wheelset_mounts_wheel_idx on public.wheelset_mounts (wheelset_id, start_at);
create unique index if not exists wheelset_mounts_open_bike_uidx
  on public.wheelset_mounts (bike_id) where end_at is null;
create unique index if not exists wheelset_mounts_open_wheel_uidx
  on public.wheelset_mounts (wheelset_id) where end_at is null;

insert into public.wheelset_mounts (line_user_id, bike_id, wheelset_id, start_at)
select w.line_user_id, w.bike_id, w.id, coalesce(w.created_at, now())
from public.wheelsets as w
join public.bikes as b on b.id = w.bike_id
where w.mounted is true
  and b.archived is not true
  and not exists (
    select 1 from public.wheelset_mounts as m where m.wheelset_id = w.id
  );

do $$
declare
  person record;
  new_id uuid;
  bike uuid;
begin
  for person in
    select distinct b.line_user_id
    from public.bikes as b
    where not exists (
      select 1 from public.wheelsets as w
      where w.line_user_id = b.line_user_id and w.archived is not true
    )
  loop
    insert into public.wheelsets (line_user_id, name, mounted, archived, odometer_km, baseline_km)
    values (person.line_user_id, '原廠輪組', false, false, 0, 0)
    returning id into new_id;
    select b.id into bike from public.bikes as b
      where b.line_user_id = person.line_user_id and b.archived is not true
      order by b.created_at
      limit 1;
    if bike is not null then
      insert into public.wheelset_mounts (line_user_id, bike_id, wheelset_id, start_at)
      values (person.line_user_id, bike, new_id, now());
    end if;
  end loop;
end $$;

update public.bikes as b
  set baseline_km = greatest(0, b.odometer_km - coalesce((
    select sum(m.km) from public.mileage_logs as m
    where m.bike_id = b.id
      and (m.is_indoor is not true or m.count_indoor_drivetrain is true)
  ), 0));

update public.wheelsets as w
  set baseline_km = greatest(0, w.odometer_km - coalesce((
    select sum(m.km) from public.mileage_logs as m
    where m.wheelset_id = w.id and m.is_indoor is not true
  ), 0));

update public.gear_components as c
  set baseline_km = greatest(0, c.accumulated_km - coalesce((
    select sum(m.km) from public.mileage_logs as m
    where m.line_user_id = c.line_user_id
      and (
        (c.bike_id is not null and m.bike_id = c.bike_id and (
          (c.kind = 'chain_wax' and (m.is_indoor is not true or m.count_indoor_drivetrain is true))
          or (c.kind <> 'chain_wax' and m.is_indoor is not true)
        ))
        or (c.wheelset_id is not null and m.wheelset_id = c.wheelset_id and m.is_indoor is not true)
      )
  ), 0));

update public.wheelsets set bike_id = null, mounted = false;

drop index if exists public.wheelsets_one_mounted_uidx;

create or replace function private.recompute_gear_km(target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(target, '') = '' then
    return;
  end if;
  update public.bikes as b
    set odometer_km = b.baseline_km + coalesce((
      select sum(m.km) from public.mileage_logs as m
      where m.bike_id = b.id
        and (m.is_indoor is not true or m.count_indoor_drivetrain is true)
    ), 0),
    updated_at = now()
    where b.line_user_id = target;
  update public.wheelsets as w
    set odometer_km = w.baseline_km + coalesce((
      select sum(m.km) from public.mileage_logs as m
      where m.wheelset_id = w.id and m.is_indoor is not true
    ), 0)
    where w.line_user_id = target;
  update public.gear_components as c
    set accumulated_km = c.baseline_km + coalesce((
      select sum(m.km) from public.mileage_logs as m
      where m.line_user_id = c.line_user_id
        and (
          (c.bike_id is not null and m.bike_id = c.bike_id and (
            (c.kind = 'chain_wax' and (m.is_indoor is not true or m.count_indoor_drivetrain is true))
            or (c.kind <> 'chain_wax' and m.is_indoor is not true)
          ))
          or (c.wheelset_id is not null and m.wheelset_id = c.wheelset_id and m.is_indoor is not true)
        )
    ), 0)
    where c.line_user_id = target;
end;
$$;

create or replace function private.reattribute_wheels(target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.mileage_logs as m
    set wheelset_id = (
      select wm.wheelset_id
      from public.wheelset_mounts as wm
      where wm.bike_id = m.bike_id
        and wm.line_user_id = m.line_user_id
        and (wm.start_at at time zone 'Asia/Taipei')::date <= m.ride_date
        and (wm.end_at is null or (wm.end_at at time zone 'Asia/Taipei')::date > m.ride_date)
      order by wm.start_at desc
      limit 1
    )
    where m.line_user_id = target
      and m.is_indoor is not true;
  update public.mileage_logs as m
    set wheelset_id = null
    where m.line_user_id = target
      and m.is_indoor is true;
  perform private.recompute_gear_km(target);
end;
$$;

create or replace function private.wheel_on_date(target_bike uuid, ride_day date)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select wm.wheelset_id
  from public.wheelset_mounts as wm
  where wm.bike_id = target_bike
    and (wm.start_at at time zone 'Asia/Taipei')::date <= ride_day
    and (wm.end_at is null or (wm.end_at at time zone 'Asia/Taipei')::date > ride_day)
  order by wm.start_at desc
  limit 1
$$;

create or replace function private.gear_mount_overlap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.wheelset_mounts as wm
    where wm.id is distinct from new.id
      and wm.bike_id = new.bike_id
      and wm.start_at < coalesce(new.end_at, 'infinity'::timestamptz)
      and new.start_at < coalesce(wm.end_at, 'infinity'::timestamptz)
  ) or exists (
    select 1 from public.wheelset_mounts as wm
    where wm.id is distinct from new.id
      and wm.wheelset_id = new.wheelset_id
      and wm.start_at < coalesce(new.end_at, 'infinity'::timestamptz)
      and new.start_at < coalesce(wm.end_at, 'infinity'::timestamptz)
  ) then
    raise exception 'mount overlap' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists gear_mount_overlap on public.wheelset_mounts;
create trigger gear_mount_overlap
  before insert or update on public.wheelset_mounts
  for each row execute function private.gear_mount_overlap();

create or replace function private.gear_seed_bike()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wheel uuid;
begin
  if not exists (
    select 1 from public.wheelsets as w
    where w.line_user_id = new.line_user_id and w.archived is not true
  ) then
    insert into public.wheelsets (line_user_id, name, mounted, archived, odometer_km, baseline_km)
    values (new.line_user_id, '原廠輪組', false, false, 0, 0)
    returning id into wheel;
    insert into public.wheelset_mounts (line_user_id, bike_id, wheelset_id, start_at)
    values (new.line_user_id, new.id, wheel, now());
  end if;
  insert into public.gear_components (
    line_user_id, bike_id, kind, last_service_date, interval_km, interval_months, reminder_kind, basis
  ) values
    (new.line_user_id, new.id, 'chain_wax', current_date, 250, null, 'replace', 'team'),
    (new.line_user_id, new.id, 'chain_replace', current_date, null, null, 'replace', 'official'),
    (new.line_user_id, new.id, 'brake_fluid', current_date, null, 12, 'check', 'mixed'),
    (new.line_user_id, new.id, 'brake_pads', current_date, null, 1, 'check', 'mixed'),
    (new.line_user_id, new.id, 'cassette_chainrings', current_date, null, null, 'check', 'official'),
    (new.line_user_id, new.id, 'shift_cables', current_date, null, null, 'replace', 'rule_of_thumb'),
    (new.line_user_id, new.id, 'bar_tape', current_date, null, 6, 'replace', 'rule_of_thumb');
  insert into public.chain_replacements (line_user_id, bike_id, replaced_on, bike_km, note, brand)
  values (new.line_user_id, new.id, current_date, new.odometer_km, '', '');
  return new;
end;
$$;

create or replace function private.gear_guard_last_wheelset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.skip_row_guard() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and new.archived is true and old.archived is not true) then
    if (
      select count(*) from public.wheelsets as w
      where w.line_user_id = old.line_user_id and w.archived is not true and w.id <> old.id
    ) < 1 then
      raise exception 'need at least one wheelset' using errcode = '42501';
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists gear_single_mounted on public.wheelsets;
drop trigger if exists gear_guard_last_wheelset on public.wheelsets;
create trigger gear_guard_last_wheelset
  after delete or update on public.wheelsets
  for each row execute function private.gear_guard_last_wheelset();

create or replace function private.gear_apply_mileage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bikes as b
    where b.id = new.bike_id and b.line_user_id = new.line_user_id and b.archived is not true
  ) then
    raise exception 'bike not found' using errcode = '42501';
  end if;
  if new.is_indoor then
    new.wheelset_id := null;
    return new;
  end if;
  if new.wheelset_id is null then
    new.wheelset_id := private.wheel_on_date(new.bike_id, new.ride_date);
  end if;
  if new.wheelset_id is not null and not exists (
    select 1 from public.wheelsets as w
    where w.id = new.wheelset_id and w.line_user_id = new.line_user_id and w.archived is not true
  ) then
    raise exception 'wheelset not found' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.gear_recompute_after_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text;
begin
  who := case when tg_op = 'DELETE' then old.line_user_id else new.line_user_id end;
  perform private.recompute_gear_km(who);
  if tg_op = 'UPDATE' and old.line_user_id is distinct from new.line_user_id then
    perform private.recompute_gear_km(old.line_user_id);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists zz_gear_revise_mileage on public.mileage_logs;
drop trigger if exists zz_gear_recompute_log on public.mileage_logs;
create trigger zz_gear_recompute_log
  after insert or update or delete on public.mileage_logs
  for each row execute function private.gear_recompute_after_log();

create or replace function private.gear_unmount_archived_bike()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.archived is true and old.archived is not true then
    update public.wheelset_mounts
      set end_at = now()
      where bike_id = new.id and end_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists gear_unmount_archived_bike on public.bikes;
create trigger gear_unmount_archived_bike
  after update on public.bikes
  for each row execute function private.gear_unmount_archived_bike();

create or replace function public.mount_wheelset(target_bike uuid, target_wheel uuid)
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
  if not exists (
    select 1 from public.bikes as b
    where b.id = target_bike and b.line_user_id = me and b.archived is not true
  ) then
    raise exception 'bike not found' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.wheelsets as w
    where w.id = target_wheel and w.line_user_id = me and w.archived is not true
  ) then
    raise exception 'wheelset not found' using errcode = '42501';
  end if;
  update public.wheelset_mounts
    set end_at = now()
    where line_user_id = me and end_at is null
      and (bike_id = target_bike or wheelset_id = target_wheel);
  insert into public.wheelset_mounts (line_user_id, bike_id, wheelset_id, start_at)
  values (me, target_bike, target_wheel, now());
end;
$$;

create or replace function public.set_mount_start(mount_id uuid, start_on date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me text := private.current_line_id();
  found public.wheelset_mounts%rowtype;
begin
  if me is null or not private.current_is_approved() or start_on is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into found from public.wheelset_mounts
    where id = mount_id and line_user_id = me;
  if found.id is null then
    raise exception 'missing' using errcode = 'P0002';
  end if;
  update public.wheelset_mounts
    set start_at = (start_on::timestamp at time zone 'Asia/Taipei')
    where id = found.id;
  perform private.reattribute_wheels(me);
end;
$$;

create or replace function public.archive_my_wheelset(target_wheel uuid)
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
  update public.wheelset_mounts
    set end_at = now()
    where wheelset_id = target_wheel and line_user_id = me and end_at is null;
  update public.wheelsets
    set archived = true
    where id = target_wheel and line_user_id = me;
end;
$$;

revoke all on function private.recompute_gear_km(text), private.reattribute_wheels(text), private.wheel_on_date(uuid, date), private.gear_mount_overlap(), private.gear_recompute_after_log(), private.gear_unmount_archived_bike() from public, anon, authenticated;
grant execute on function private.recompute_gear_km(text), private.reattribute_wheels(text), private.wheel_on_date(uuid, date) to service_role;

revoke all on function public.mount_wheelset(uuid, uuid), public.set_mount_start(uuid, date), public.archive_my_wheelset(uuid) from public, anon;
grant execute on function public.mount_wheelset(uuid, uuid), public.set_mount_start(uuid, date), public.archive_my_wheelset(uuid) to authenticated;

alter table public.wheelset_mounts enable row level security;
alter table public.wheelset_mounts force row level security;
drop policy if exists wheelset_mounts_all on public.wheelset_mounts;
drop policy if exists wheelset_mounts_shared on public.wheelset_mounts;
create policy wheelset_mounts_all on public.wheelset_mounts for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
create policy wheelset_mounts_shared on public.wheelset_mounts for select to authenticated
  using (private.current_is_approved() and private.shares_garage(line_user_id));
grant select, insert, update, delete on public.wheelset_mounts to authenticated;
grant all on public.wheelset_mounts to service_role;
revoke all on public.wheelset_mounts from anon, public;

create or replace function private.gear_stamp_baseline()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.baseline_km = 0 then
    if tg_table_name = 'gear_components' then
      new.baseline_km := new.accumulated_km;
    else
      new.baseline_km := new.odometer_km;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists gear_stamp_baseline_bikes on public.bikes;
create trigger gear_stamp_baseline_bikes before insert on public.bikes
  for each row execute function private.gear_stamp_baseline();
drop trigger if exists gear_stamp_baseline_wheels on public.wheelsets;
create trigger gear_stamp_baseline_wheels before insert on public.wheelsets
  for each row execute function private.gear_stamp_baseline();
drop trigger if exists gear_stamp_baseline_parts on public.gear_components;
create trigger gear_stamp_baseline_parts before insert on public.gear_components
  for each row execute function private.gear_stamp_baseline();

do $$
declare
  person record;
begin
  for person in
    select distinct line_user_id from public.bikes
    union
    select distinct line_user_id from public.wheelsets
  loop
    perform private.recompute_gear_km(person.line_user_id);
  end loop;
end $$;

-- 下面整支取代 strava_backend。context 的 bike_id 是目前裝上的車，不是輪組舊欄位。
-- apply 在非室內時，用活動日期當下裝在那台車的輪組。
create or replace function public.strava_backend(op text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line_id text;
  consumed_nonce text;
  v_pending public.pending_activities%rowtype;
  v_new_log uuid;
  v_km numeric;
  v_ride_day date;
  v_bike uuid;
  v_wheel uuid;
  v_indoor boolean;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if op = 'context' then
    v_line_id := payload->>'line_user_id';
    return jsonb_build_object(
      'bikes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'name', b.name, 'brand', b.brand,
          'strava_gear_id', b.strava_gear_id, 'archived', b.archived
        ))
        from public.bikes as b where b.line_user_id = v_line_id
      ), '[]'::jsonb),
      'wheelsets', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', w.id,
          'bike_id', (
            select wm.bike_id from public.wheelset_mounts as wm
            where wm.wheelset_id = w.id and wm.end_at is null
            limit 1
          ),
          'name', w.name,
          'mounted', exists (
            select 1 from public.wheelset_mounts as wm
            where wm.wheelset_id = w.id and wm.end_at is null
          )
        ))
        from public.wheelsets as w
        where w.line_user_id = v_line_id and w.archived is not true
      ), '[]'::jsonb),
      'last_bike_id', (
        select m.bike_id from public.mileage_logs as m
        where m.line_user_id = v_line_id
        order by m.ride_date desc, m.created_at desc limit 1
      ),
      'last_wheel_id', (
        select m.wheelset_id from public.mileage_logs as m
        where m.line_user_id = v_line_id and m.wheelset_id is not null
        order by m.ride_date desc, m.created_at desc limit 1
      )
    );
  elsif op = 'apply' then
    v_line_id := payload->>'line_user_id';
    v_km := round((payload->>'distance_km')::numeric, 1);
    v_ride_day := (payload->>'occurred_on')::date;
    v_indoor := coalesce((payload->>'is_indoor')::boolean, false);
    v_bike := nullif(payload->>'bike_id', '')::uuid;
    v_wheel := case when v_indoor then null else nullif(payload->>'wheelset_id', '')::uuid end;
    if not v_indoor and v_bike is not null then
      v_wheel := coalesce(private.wheel_on_date(v_bike, v_ride_day), v_wheel);
    end if;
    if v_km is null or v_km <= 0 or v_km > 2000 or v_ride_day is null then
      return jsonb_build_object('status', 'ignored');
    end if;
    insert into public.pending_activities as p (
      line_user_id, source, external_id, sport_type, name, occurred_on, distance_km,
      is_indoor, ask_chain, gear_external_id, status, bike_id, wheelset_id
    ) values (
      v_line_id, 'strava', payload->>'external_id', coalesce(payload->>'sport_type', ''),
      left(coalesce(payload->>'name', ''), 120), v_ride_day, v_km,
      v_indoor,
      coalesce((payload->>'ask_chain')::boolean, false),
      coalesce(payload->>'gear_external_id', ''),
      case when coalesce((payload->>'assign')::boolean, false) then 'assigned' else 'pending' end,
      v_bike, v_wheel
    )
    on conflict on constraint pending_activities_line_user_id_source_external_id_key do update set
      sport_type = excluded.sport_type,
      name = excluded.name,
      occurred_on = excluded.occurred_on,
      distance_km = excluded.distance_km,
      is_indoor = excluded.is_indoor,
      ask_chain = excluded.ask_chain,
      gear_external_id = excluded.gear_external_id
    returning * into v_pending;
    if v_pending.mileage_log_id is not null then
      update public.mileage_logs as m
        set km = v_pending.distance_km, ride_date = v_pending.occurred_on
        where m.id = v_pending.mileage_log_id;
      return jsonb_build_object('status', 'updated', 'mileage_log_id', v_pending.mileage_log_id);
    end if;
    if coalesce((payload->>'assign')::boolean, false) and v_bike is not null then
      insert into public.mileage_logs as m (
        line_user_id, ride_date, km, bike_id, wheelset_id, is_indoor, count_indoor_drivetrain,
        external_source, external_id
      ) values (
        v_line_id, v_ride_day, v_km, v_bike, v_wheel, v_indoor,
        coalesce((payload->>'count_indoor')::boolean, false),
        'strava', payload->>'external_id'
      )
      returning m.id into v_new_log;
      update public.pending_activities as p
        set status = 'assigned', mileage_log_id = v_new_log, bike_id = v_bike, wheelset_id = v_wheel
        where p.id = v_pending.id;
      return jsonb_build_object('status', 'assigned', 'mileage_log_id', v_new_log);
    end if;
    update public.pending_activities as p
      set status = 'pending', bike_id = v_bike, wheelset_id = v_wheel
      where p.id = v_pending.id and p.status is distinct from 'assigned';
    return jsonb_build_object('status', 'pending');

  elsif op = 'put_token' then
    insert into private.strava_tokens as t (
      line_user_id, athlete_id, access_token, refresh_token, expires_at, scope, last_sync_at, updated_at
    ) values (
      payload->>'line_user_id', (payload->>'athlete_id')::bigint, payload->>'access_token',
      payload->>'refresh_token', (payload->>'expires_at')::timestamptz, coalesce(payload->>'scope', ''),
      nullif(payload->>'last_sync_at', '')::timestamptz, now()
    )
    on conflict on constraint strava_tokens_pkey do update set
      athlete_id = excluded.athlete_id, access_token = excluded.access_token,
      refresh_token = excluded.refresh_token, expires_at = excluded.expires_at,
      scope = excluded.scope, last_sync_at = coalesce(excluded.last_sync_at, t.last_sync_at), updated_at = now();
    return jsonb_build_object('ok', true);

  elsif op = 'get_token' then
    if coalesce(payload->>'athlete_id', '') <> '' then
      return coalesce((
        select jsonb_build_object(
          'line_user_id', t.line_user_id, 'athlete_id', t.athlete_id, 'access_token', t.access_token,
          'refresh_token', t.refresh_token, 'expires_at', t.expires_at, 'scope', t.scope, 'last_sync_at', t.last_sync_at
        ) from private.strava_tokens as t where t.athlete_id = (payload->>'athlete_id')::bigint
      ), 'null'::jsonb);
    end if;
    return coalesce((
      select jsonb_build_object(
        'line_user_id', t.line_user_id, 'athlete_id', t.athlete_id, 'access_token', t.access_token,
        'refresh_token', t.refresh_token, 'expires_at', t.expires_at, 'scope', t.scope, 'last_sync_at', t.last_sync_at
      ) from private.strava_tokens as t where t.line_user_id = payload->>'line_user_id'
    ), 'null'::jsonb);

  elsif op = 'touch_sync' then
    update private.strava_tokens as t set last_sync_at = now(), updated_at = now()
      where t.line_user_id = payload->>'line_user_id';
    return jsonb_build_object('ok', true);

  elsif op = 'delete_token' then
    if coalesce(payload->>'athlete_id', '') <> '' then
      delete from private.strava_tokens as t where t.athlete_id = (payload->>'athlete_id')::bigint;
    else
      delete from private.strava_tokens as t where t.line_user_id = payload->>'line_user_id';
    end if;
    return jsonb_build_object('ok', true);

  elsif op = 'put_state' then
    insert into private.strava_oauth_states as s (nonce, line_user_id, expires_at)
    values (payload->>'nonce', payload->>'line_user_id', (payload->>'expires_at')::timestamptz)
    on conflict on constraint strava_oauth_states_pkey do nothing;
    return jsonb_build_object('ok', true);

  elsif op = 'consume_state' then
    update private.strava_oauth_states as s
      set used_at = now()
      where s.nonce = payload->>'nonce' and s.line_user_id = payload->>'line_user_id'
        and s.used_at is null and s.expires_at > now()
      returning s.nonce into consumed_nonce;
    return jsonb_build_object('ok', consumed_nonce is not null);

  elsif op = 'remove_activity' then
    select p.* into v_pending from public.pending_activities as p
      where p.line_user_id = payload->>'line_user_id' and p.source = 'strava'
        and p.external_id = payload->>'external_id';
    if found and v_pending.mileage_log_id is not null then
      delete from public.mileage_logs as m where m.id = v_pending.mileage_log_id;
    end if;
    delete from public.pending_activities as p
      where p.line_user_id = payload->>'line_user_id' and p.source = 'strava'
        and p.external_id = payload->>'external_id';
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'unknown op' using errcode = '22023';
end;
$$;

revoke all on function public.strava_backend(text, jsonb) from public, anon, authenticated;
grant execute on function public.strava_backend(text, jsonb) to service_role;
