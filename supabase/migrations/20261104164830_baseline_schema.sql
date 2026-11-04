-- 正式資料庫已經有這些表（專案 yvgjaljdxmsmtljcmemp）。
-- 本檔只用 CREATE TABLE IF NOT EXISTS，重複執行不會刪除或覆蓋現有資料。
-- 正式環境若用 SQL Editor 手動上線，不必執行本檔；本機 supabase db reset / db push 需要它來建立空資料庫。

create table if not exists public.riders (
  id uuid primary key default gen_random_uuid(),
  line_user_id text not null unique,
  name text not null,
  avatar_url text,
  ftp integer not null,
  weight numeric not null,
  z1 integer default 0,
  z2 integer default 0,
  z3 integer default 0,
  z4 integer default 0,
  z5 integer default 0,
  updated_at timestamptz default now(),
  status text default 'pending',
  mood text default '',
  last_seen timestamptz default now(),
  is_admin boolean default false,
  tire_width integer,
  attendance_count integer default 0,
  name_color text default ''
);

create table if not exists public.rides (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  date text not null,
  time text not null,
  location text not null,
  garmin_code text default '',
  note text default '',
  created_at timestamptz default now(),
  strava_url text default '',
  garmin_url text default '',
  location2 text default '',
  time2 text default '',
  deadline timestamptz,
  max_participants integer,
  weather_lat numeric,
  weather_lng numeric,
  weather_location_name text default '',
  is_finished boolean default false
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.guidelines (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  content text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides (id) on delete cascade,
  line_user_id text not null,
  name text not null,
  avatar_url text,
  created_at timestamptz default now(),
  unique (ride_id, line_user_id)
);

create table if not exists public.attendances (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid references public.rides (id) on delete cascade,
  line_user_id text not null,
  name text not null,
  avatar_url text,
  confirmed_at timestamptz default now(),
  unique (ride_id, line_user_id)
);

create table if not exists public.weather_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lat numeric not null,
  lng numeric not null,
  sort_order integer default 0
);
