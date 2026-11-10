-- 個人裝備庫與保養里程。可重複執行。不讀、不改別人的裝備，也不動目錄 view。
-- 車、輪組、耗材、里程只屬於 JWT 裡的本人。管理員也看不到別人的裝備。
-- 新增一台車會自動建立「原廠輪組」與預設耗材。里程由 trigger 累加，避免前端漏算。

create table if not exists public.bikes (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  name text not null,
  brand text not null default '',
  strava_gear_id text,
  odometer_km numeric not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wheelsets (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  bike_id uuid not null references public.bikes (id) on delete cascade,
  name text not null,
  brand text not null default '',
  odometer_km numeric not null default 0,
  mounted boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.gear_components (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  bike_id uuid references public.bikes (id) on delete cascade,
  wheelset_id uuid references public.wheelsets (id) on delete cascade,
  kind text not null,
  last_service_date date,
  km_at_last_service numeric not null default 0,
  accumulated_km numeric not null default 0,
  interval_km numeric,
  interval_months numeric,
  reminder_kind text not null default 'check',
  basis text not null default 'official',
  brand_note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.mileage_logs (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  ride_date date not null,
  km numeric not null,
  bike_id uuid not null references public.bikes (id) on delete cascade,
  wheelset_id uuid references public.wheelsets (id) on delete set null,
  is_indoor boolean not null default false,
  count_indoor_drivetrain boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.chain_replacements (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  bike_id uuid not null references public.bikes (id) on delete cascade,
  replaced_on date not null,
  bike_km numeric not null,
  note text not null default '',
  brand text not null default '',
  created_at timestamptz not null default now()
);

-- 之後 Strava 同步用。這一版沒有 OAuth，也不會寫入正式活動。
create table if not exists public.pending_activities (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null,
  source text not null default 'strava',
  external_id text not null,
  sport_type text not null default '',
  name text not null default '',
  occurred_on date,
  distance_km numeric,
  is_indoor boolean not null default false,
  status text not null default 'pending',
  bike_id uuid references public.bikes (id) on delete set null,
  wheelset_id uuid references public.wheelsets (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (line_user_id, source, external_id)
);

do $$ begin
  alter table public.bikes add constraint bikes_name_len check (char_length(name) between 1 and 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.bikes add constraint bikes_odometer_nonneg check (odometer_km >= 0 and odometer_km < 1000000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wheelsets add constraint wheelsets_name_len check (char_length(name) between 1 and 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.wheelsets add constraint wheelsets_odometer_nonneg check (odometer_km >= 0 and odometer_km < 1000000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.gear_components add constraint gear_components_parent check (
    (bike_id is not null and wheelset_id is null and kind in ('chain_wax', 'chain_replace', 'brake_fluid', 'brake_pads', 'cassette_chainrings', 'shift_cables', 'bar_tape'))
    or
    (wheelset_id is not null and bike_id is null and kind in ('sealant', 'tires'))
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.gear_components add constraint gear_components_reminder check (reminder_kind in ('check', 'replace'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.gear_components add constraint gear_components_basis check (basis in ('official', 'mixed', 'rule_of_thumb', 'team'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.gear_components add constraint gear_components_km_nonneg check (accumulated_km >= 0 and km_at_last_service >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.chain_replacements add constraint chain_replacements_km_nonneg check (bike_km >= 0 and bike_km < 1000000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.chain_replacements add constraint chain_replacements_note_len check (char_length(note) <= 200 and char_length(brand) <= 80);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.mileage_logs add constraint mileage_logs_km_pos check (km > 0 and km <= 2000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.pending_activities add constraint pending_activities_status check (status in ('pending', 'assigned', 'ignored'));
exception when duplicate_object then null; end $$;

create index if not exists bikes_owner_idx on public.bikes (line_user_id);
create index if not exists wheelsets_bike_idx on public.wheelsets (bike_id);
create unique index if not exists wheelsets_one_mounted_uidx on public.wheelsets (bike_id) where mounted;
create index if not exists gear_components_bike_idx on public.gear_components (bike_id);
create index if not exists gear_components_wheel_idx on public.gear_components (wheelset_id);
create index if not exists mileage_logs_owner_idx on public.mileage_logs (line_user_id, ride_date);
create index if not exists chain_replacements_bike_idx on public.chain_replacements (bike_id, replaced_on);
create index if not exists pending_activities_owner_idx on public.pending_activities (line_user_id, status);

create or replace function private.gear_stamp_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.skip_row_guard() then
    return new;
  end if;
  new.line_user_id := private.current_line_id();
  if new.line_user_id is null or btrim(new.line_user_id) = '' then
    raise exception 'missing line identity' using errcode = '42501';
  end if;
  if not private.current_is_approved() then
    raise exception 'not approved' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.gear_seed_wheelset()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.gear_components (
    line_user_id, wheelset_id, kind, last_service_date, interval_km, interval_months, reminder_kind, basis
  ) values
    (new.line_user_id, new.id, 'sealant', current_date, null, 3, 'replace', 'official'),
    (new.line_user_id, new.id, 'tires', current_date, null, 36, 'check', 'official');
  return new;
end;
$$;

create or replace function private.gear_seed_bike()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.wheelsets (line_user_id, bike_id, name, mounted)
  values (new.line_user_id, new.id, '原廠輪組', true);
  insert into public.gear_components (
    line_user_id, bike_id, kind, last_service_date, interval_km, interval_months, reminder_kind, basis
  ) values
    (new.line_user_id, new.id, 'chain_wax', current_date, 250, null, 'replace', 'team'),
    (new.line_user_id, new.id, 'chain_replace', current_date, null, null, 'replace', 'official'),
    (new.line_user_id, new.id, 'brake_fluid', current_date, null, 12, 'check', 'mixed'),
    (new.line_user_id, new.id, 'brake_pads', current_date, null, 1, 'check', 'mixed'),
    (new.line_user_id, new.id, 'cassette_chainrings', current_date, null, null, 'check', 'official'),
    (new.line_user_id, new.id, 'shift_cables', current_date, null, 12, 'check', 'rule_of_thumb'),
    (new.line_user_id, new.id, 'bar_tape', current_date, null, 12, 'replace', 'rule_of_thumb');
  insert into public.chain_replacements (line_user_id, bike_id, replaced_on, bike_km, note, brand)
  values (new.line_user_id, new.id, current_date, new.odometer_km, '', '');
  return new;
end;
$$;

create or replace function private.gear_guard_chain()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.bikes b
    where b.id = new.bike_id and b.line_user_id = new.line_user_id
  ) then
    raise exception 'bike not found' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.gear_guard_last_wheelset()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select count(*) from public.wheelsets where bike_id = old.bike_id) <= 1 then
    raise exception 'a bike needs at least one wheelset' using errcode = '42501';
  end if;
  return old;
end;
$$;

create or replace function private.gear_single_mounted()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.mounted then
    update public.wheelsets
      set mounted = false
      where bike_id = new.bike_id and id is distinct from new.id and mounted is true;
  end if;
  return new;
end;
$$;

create or replace function private.gear_apply_mileage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_wheel uuid;
begin
  if not exists (
    select 1 from public.bikes b
    where b.id = new.bike_id and b.line_user_id = new.line_user_id and b.archived is not true
  ) then
    raise exception 'bike not found' using errcode = '42501';
  end if;
  if new.is_indoor and not new.count_indoor_drivetrain then
    new.wheelset_id := null;
    return new;
  end if;
  update public.bikes set odometer_km = odometer_km + new.km, updated_at = now() where id = new.bike_id;
  if new.is_indoor then
    update public.gear_components
      set accumulated_km = accumulated_km + new.km
      where bike_id = new.bike_id and kind = 'chain_wax';
    new.wheelset_id := null;
    return new;
  end if;
  target_wheel := new.wheelset_id;
  if target_wheel is null then
    select w.id into target_wheel from public.wheelsets w
    where w.bike_id = new.bike_id and w.mounted is true
    limit 1;
  end if;
  if target_wheel is null or not exists (
    select 1 from public.wheelsets w
    where w.id = target_wheel and w.bike_id = new.bike_id and w.line_user_id = new.line_user_id
  ) then
    raise exception 'wheelset does not belong to this bike' using errcode = '42501';
  end if;
  new.wheelset_id := target_wheel;
  update public.wheelsets set odometer_km = odometer_km + new.km where id = target_wheel;
  update public.gear_components set accumulated_km = accumulated_km + new.km where bike_id = new.bike_id;
  update public.gear_components set accumulated_km = accumulated_km + new.km where wheelset_id = target_wheel;
  return new;
end;
$$;

revoke all on function
  private.gear_stamp_owner(),
  private.gear_seed_wheelset(),
  private.gear_seed_bike(),
  private.gear_guard_chain(),
  private.gear_guard_last_wheelset(),
  private.gear_single_mounted(),
  private.gear_apply_mileage()
from public, anon;
grant execute on function
  private.gear_stamp_owner(),
  private.gear_seed_wheelset(),
  private.gear_seed_bike(),
  private.gear_guard_chain(),
  private.gear_guard_last_wheelset(),
  private.gear_single_mounted(),
  private.gear_apply_mileage()
to authenticated, service_role;

drop trigger if exists gear_stamp_bikes on public.bikes;
create trigger gear_stamp_bikes before insert or update on public.bikes
  for each row execute function private.gear_stamp_owner();
drop trigger if exists gear_stamp_wheelsets on public.wheelsets;
create trigger gear_stamp_wheelsets before insert or update on public.wheelsets
  for each row execute function private.gear_stamp_owner();
drop trigger if exists gear_stamp_components on public.gear_components;
create trigger gear_stamp_components before insert or update on public.gear_components
  for each row execute function private.gear_stamp_owner();
drop trigger if exists gear_stamp_mileage on public.mileage_logs;
create trigger gear_stamp_mileage before insert or update on public.mileage_logs
  for each row execute function private.gear_stamp_owner();
drop trigger if exists gear_stamp_chain_replacements on public.chain_replacements;
create trigger gear_stamp_chain_replacements before insert or update on public.chain_replacements
  for each row execute function private.gear_stamp_owner();
drop trigger if exists z_gear_guard_chain on public.chain_replacements;
create trigger z_gear_guard_chain before insert or update on public.chain_replacements
  for each row execute function private.gear_guard_chain();
drop trigger if exists gear_stamp_pending on public.pending_activities;
create trigger gear_stamp_pending before insert or update on public.pending_activities
  for each row execute function private.gear_stamp_owner();

drop trigger if exists gear_seed_bike on public.bikes;
create trigger gear_seed_bike after insert on public.bikes
  for each row execute function private.gear_seed_bike();
drop trigger if exists gear_seed_wheelset on public.wheelsets;
create trigger gear_seed_wheelset after insert on public.wheelsets
  for each row execute function private.gear_seed_wheelset();
drop trigger if exists gear_guard_last_wheelset on public.wheelsets;
create trigger gear_guard_last_wheelset before delete on public.wheelsets
  for each row execute function private.gear_guard_last_wheelset();
drop trigger if exists gear_single_mounted on public.wheelsets;
create trigger gear_single_mounted before insert or update on public.wheelsets
  for each row execute function private.gear_single_mounted();
drop trigger if exists gear_apply_mileage on public.mileage_logs;
drop trigger if exists zz_gear_apply_mileage on public.mileage_logs;
create trigger zz_gear_apply_mileage before insert on public.mileage_logs
  for each row execute function private.gear_apply_mileage();

alter table public.bikes enable row level security;
alter table public.wheelsets enable row level security;
alter table public.gear_components enable row level security;
alter table public.mileage_logs enable row level security;
alter table public.chain_replacements enable row level security;
alter table public.pending_activities enable row level security;
alter table public.bikes force row level security;
alter table public.wheelsets force row level security;
alter table public.gear_components force row level security;
alter table public.mileage_logs force row level security;
alter table public.chain_replacements force row level security;
alter table public.pending_activities force row level security;

drop policy if exists bikes_all on public.bikes;
drop policy if exists wheelsets_all on public.wheelsets;
drop policy if exists gear_components_all on public.gear_components;
drop policy if exists mileage_logs_all on public.mileage_logs;
drop policy if exists chain_replacements_all on public.chain_replacements;
drop policy if exists pending_activities_all on public.pending_activities;

create policy bikes_all on public.bikes for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
create policy wheelsets_all on public.wheelsets for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
create policy gear_components_all on public.gear_components for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
create policy mileage_logs_all on public.mileage_logs for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
create policy chain_replacements_all on public.chain_replacements for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));
create policy pending_activities_all on public.pending_activities for all to authenticated
  using (private.is_self(line_user_id))
  with check (private.is_self(line_user_id));

grant select, insert, update, delete on
  public.bikes, public.wheelsets, public.gear_components, public.mileage_logs, public.chain_replacements, public.pending_activities
to authenticated;
grant all on
  public.bikes, public.wheelsets, public.gear_components, public.mileage_logs, public.chain_replacements, public.pending_activities
to service_role;
revoke all on
  public.bikes, public.wheelsets, public.gear_components, public.mileage_logs, public.chain_replacements, public.pending_activities
from anon, public;
