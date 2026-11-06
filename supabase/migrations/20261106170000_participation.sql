-- 團騎參加、範本、路線庫。可重複執行，不刪既有團員、團騎、報名、出席。
-- 先執行本檔，再更新網站。網站在這些表還沒有時會停用新功能，不會把讀取失敗當成新團員。
-- 新表只用 RLS。不新增會繞過政策的 security definer view。
-- registrations_directory 仍是既有的遮罩 view（authenticated 不能直接讀 line_user_id），只在最後加 group_id。

alter table public.rides add column if not exists cancelled boolean not null default false;
alter table public.rides add column if not exists pace_note text not null default '';
alter table public.rides add column if not exists distance_km numeric;
alter table public.rides add column if not exists ascent_m numeric;
alter table public.rides add column if not exists distance_estimated boolean not null default false;
alter table public.rides add column if not exists ascent_estimated boolean not null default false;
alter table public.rides add column if not exists route_id uuid;
alter table public.rides add column if not exists source_key text;

alter table public.registrations add column if not exists group_id uuid;

create table if not exists public.routes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  garmin_course_id text,
  garmin_url text not null default '',
  original_url text not null default '',
  distance_km numeric,
  ascent_m numeric,
  distance_estimated boolean not null default false,
  ascent_estimated boolean not null default false,
  notes text not null default '',
  track jsonb not null default '[]'::jsonb,
  point_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ride_groups (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides (id) on delete cascade,
  name text not null,
  pace_note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ride_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  time text not null default '',
  time2 text not null default '',
  location text not null default '',
  location2 text not null default '',
  note text not null default '',
  strava_url text not null default '',
  garmin_url text not null default '',
  pace_note text not null default '',
  distance_km numeric,
  ascent_m numeric,
  distance_estimated boolean not null default false,
  ascent_estimated boolean not null default false,
  route_id uuid,
  max_participants integer,
  weather_lat numeric,
  weather_lng numeric,
  weather_location_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ride_template_groups (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.ride_templates (id) on delete cascade,
  name text not null,
  pace_note text not null default '',
  sort_order integer not null default 0
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'rides_route_id_fkey') then
    alter table public.rides
      add constraint rides_route_id_fkey
      foreign key (route_id) references public.routes (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'registrations_group_id_fkey') then
    alter table public.registrations
      add constraint registrations_group_id_fkey
      foreign key (group_id) references public.ride_groups (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ride_templates_route_id_fkey') then
    alter table public.ride_templates
      add constraint ride_templates_route_id_fkey
      foreign key (route_id) references public.routes (id) on delete set null;
  end if;
end $$;

do $$ begin
  alter table public.rides add constraint rides_pace_note_len check (char_length(pace_note) <= 300);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rides add constraint rides_source_key_shape check (
    source_key is null or source_key ~ '^(ride|template):[A-Za-z0-9_-]{1,80}:[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rides add constraint rides_distance_range check (distance_km is null or (distance_km >= 0 and distance_km < 2000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.rides add constraint rides_ascent_range check (ascent_m is null or (ascent_m >= 0 and ascent_m < 20000));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.routes add constraint routes_title_len check (char_length(title) between 1 and 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.routes add constraint routes_notes_len check (char_length(notes) <= 2000);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.routes add constraint routes_course_id_shape check (
    garmin_course_id is null or garmin_course_id = '' or garmin_course_id ~ '^[0-9]{3,20}$'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.routes add constraint routes_track_shape check (
    jsonb_typeof(track) = 'array' and jsonb_array_length(track) <= 500
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.routes add constraint routes_distance_range check (distance_km is null or (distance_km >= 0 and distance_km < 2000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.routes add constraint routes_ascent_range check (ascent_m is null or (ascent_m >= 0 and ascent_m < 20000));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.routes add constraint routes_urls_safe check (
    (garmin_url = '' or (
      char_length(garmin_url) <= 2000 and garmin_url ~* '^https?://' and garmin_url !~ '[[:space:]]'
      and position('@' in garmin_url) = 0 and garmin_url !~ '[<>"'']'
    ))
    and (original_url = '' or (
      char_length(original_url) <= 2000 and original_url ~* '^https?://' and original_url !~ '[[:space:]]'
      and position('@' in original_url) = 0 and original_url !~ '[<>"'']'
    ))
  );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.ride_groups add constraint ride_groups_name_len check (char_length(name) between 1 and 40);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_groups add constraint ride_groups_pace_len check (char_length(pace_note) <= 200);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_templates add constraint ride_templates_title_len check (char_length(title) between 1 and 120);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_templates add constraint ride_templates_urls_safe check (
    (garmin_url = '' or (
      char_length(garmin_url) <= 2000 and garmin_url ~* '^https?://' and garmin_url !~ '[[:space:]]'
      and position('@' in garmin_url) = 0 and garmin_url !~ '[<>"'']'
    ))
    and (strava_url = '' or (
      char_length(strava_url) <= 2000 and strava_url ~* '^https?://' and strava_url !~ '[[:space:]]'
      and position('@' in strava_url) = 0 and strava_url !~ '[<>"'']'
    ))
  );
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.ride_template_groups add constraint ride_template_groups_name_len check (char_length(name) between 1 and 40);
exception when duplicate_object then null; end $$;

create index if not exists rides_date_idx on public.rides (date);
create index if not exists rides_route_id_idx on public.rides (route_id);
create unique index if not exists rides_source_key_uidx on public.rides (source_key) where source_key is not null and source_key <> '';
create index if not exists ride_groups_ride_idx on public.ride_groups (ride_id, sort_order);
create index if not exists registrations_group_idx on public.registrations (group_id);
create unique index if not exists routes_course_uidx on public.routes (garmin_course_id) where garmin_course_id is not null and garmin_course_id <> '';
create index if not exists ride_templates_title_idx on public.ride_templates (title);
create index if not exists ride_template_groups_template_idx on public.ride_template_groups (template_id, sort_order);

create or replace function private.registrations_check_group()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.group_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.ride_groups g
    where g.id = new.group_id
      and g.ride_id = new.ride_id
  ) then
    raise exception 'group does not belong to this ride' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.registrations_check_group() from public, anon;
grant execute on function private.registrations_check_group() to authenticated, service_role;

drop trigger if exists registrations_check_group on public.registrations;
create trigger registrations_check_group
  before insert or update on public.registrations
  for each row execute function private.registrations_check_group();

alter table public.routes enable row level security;
alter table public.ride_groups enable row level security;
alter table public.ride_templates enable row level security;
alter table public.ride_template_groups enable row level security;
alter table public.routes force row level security;
alter table public.ride_groups force row level security;
alter table public.ride_templates force row level security;
alter table public.ride_template_groups force row level security;

drop policy if exists routes_select on public.routes;
drop policy if exists routes_write on public.routes;
drop policy if exists ride_groups_select on public.ride_groups;
drop policy if exists ride_groups_write on public.ride_groups;
drop policy if exists ride_templates_all on public.ride_templates;
drop policy if exists ride_template_groups_all on public.ride_template_groups;

create policy routes_select on public.routes
  for select to authenticated
  using ((select private.current_is_approved()) or (select private.current_is_admin()));
create policy routes_write on public.routes
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));

create policy ride_groups_select on public.ride_groups
  for select to authenticated
  using ((select private.current_is_approved()) or (select private.current_is_admin()));
create policy ride_groups_write on public.ride_groups
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));

create policy ride_templates_all on public.ride_templates
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));
create policy ride_template_groups_all on public.ride_template_groups
  for all to authenticated
  using ((select private.current_is_admin()))
  with check ((select private.current_is_admin()));

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
  r.id as rider_id,
  g.group_id
from public.registrations g
left join public.riders r on r.line_user_id = g.line_user_id;

revoke all on public.registrations_directory from public, anon;
grant select on public.registrations_directory to authenticated, service_role;

grant select, insert, update, delete on
  public.routes,
  public.ride_groups,
  public.ride_templates,
  public.ride_template_groups
to authenticated;

grant all on
  public.routes,
  public.ride_groups,
  public.ride_templates,
  public.ride_template_groups
to service_role;

revoke all on
  public.routes,
  public.ride_groups,
  public.ride_templates,
  public.ride_template_groups
from anon, public;
