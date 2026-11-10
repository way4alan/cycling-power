-- Strava 連線。可重複執行。
-- access / refresh token 只放在 private，PostgREST 沒有公開這個 schema。
-- 一般團員、anon、管理員的 JWT 都讀不到 token。只有 service_role 能透過 strava_backend 操作。

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to service_role;

create table if not exists private.strava_tokens (
  line_user_id text primary key,
  athlete_id bigint not null unique,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text not null default '',
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists private.strava_oauth_states (
  nonce text primary key,
  line_user_id text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table private.strava_tokens enable row level security;
alter table private.strava_tokens force row level security;
alter table private.strava_oauth_states enable row level security;
alter table private.strava_oauth_states force row level security;

revoke all on private.strava_tokens, private.strava_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on private.strava_tokens, private.strava_oauth_states to service_role;

alter table public.mileage_logs add column if not exists external_source text;
alter table public.mileage_logs add column if not exists external_id text;
alter table public.pending_activities add column if not exists ask_chain boolean not null default false;
alter table public.pending_activities add column if not exists gear_external_id text not null default '';
alter table public.pending_activities add column if not exists mileage_log_id uuid;

do $$ begin
  alter table public.pending_activities
    add constraint pending_activities_mileage_fk
    foreign key (mileage_log_id) references public.mileage_logs (id) on delete set null;
exception when duplicate_object then null; end $$;

create unique index if not exists mileage_logs_external_uidx
  on public.mileage_logs (line_user_id, external_source, external_id)
  where external_id is not null;

-- 改公里或刪除一筆里程時，把先前加上的里程減回來，再套上新的數字。
create or replace function private.gear_shift_km(
  p_line text,
  p_bike uuid,
  p_wheel uuid,
  p_km numeric,
  p_indoor boolean,
  p_count boolean
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_wheel uuid;
begin
  if p_km = 0 or p_bike is null then
    return;
  end if;
  if p_indoor and not p_count then
    return;
  end if;
  update public.bikes
    set odometer_km = greatest(0, odometer_km + p_km), updated_at = now()
    where id = p_bike and line_user_id = p_line;
  if p_indoor then
    update public.gear_components
      set accumulated_km = greatest(0, accumulated_km + p_km)
      where bike_id = p_bike and kind = 'chain_wax';
    return;
  end if;
  target_wheel := p_wheel;
  if target_wheel is null then
    select w.id into target_wheel from public.wheelsets w
    where w.bike_id = p_bike and w.mounted is true
    limit 1;
  end if;
  if target_wheel is not null then
    update public.wheelsets
      set odometer_km = greatest(0, odometer_km + p_km)
      where id = target_wheel and line_user_id = p_line;
    update public.gear_components
      set accumulated_km = greatest(0, accumulated_km + p_km)
      where wheelset_id = target_wheel;
  end if;
  update public.gear_components
    set accumulated_km = greatest(0, accumulated_km + p_km)
    where bike_id = p_bike;
end;
$$;

create or replace function private.gear_revise_mileage()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.gear_shift_km(old.line_user_id, old.bike_id, old.wheelset_id, -old.km, old.is_indoor, old.count_indoor_drivetrain);
    return old;
  end if;
  perform private.gear_shift_km(old.line_user_id, old.bike_id, old.wheelset_id, -old.km, old.is_indoor, old.count_indoor_drivetrain);
  perform private.gear_shift_km(new.line_user_id, new.bike_id, new.wheelset_id, new.km, new.is_indoor, new.count_indoor_drivetrain);
  return new;
end;
$$;

revoke all on function private.gear_shift_km(text, uuid, uuid, numeric, boolean, boolean), private.gear_revise_mileage() from public, anon;
grant execute on function private.gear_shift_km(text, uuid, uuid, numeric, boolean, boolean), private.gear_revise_mileage() to authenticated, service_role;

drop trigger if exists zz_gear_revise_mileage on public.mileage_logs;
create trigger zz_gear_revise_mileage
  before update or delete on public.mileage_logs
  for each row execute function private.gear_revise_mileage();

create or replace function public.strava_backend(op text, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  line_id text;
  nonce text;
  athlete bigint;
  existing public.pending_activities%rowtype;
  log_id uuid;
  new_log uuid;
  km numeric;
  ride_day date;
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if op = 'put_token' then
    insert into private.strava_tokens (
      line_user_id, athlete_id, access_token, refresh_token, expires_at, scope, last_sync_at, updated_at
    ) values (
      payload->>'line_user_id',
      (payload->>'athlete_id')::bigint,
      payload->>'access_token',
      payload->>'refresh_token',
      (payload->>'expires_at')::timestamptz,
      coalesce(payload->>'scope', ''),
      nullif(payload->>'last_sync_at', '')::timestamptz,
      now()
    )
    on conflict (line_user_id) do update set
      athlete_id = excluded.athlete_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      scope = excluded.scope,
      last_sync_at = coalesce(excluded.last_sync_at, private.strava_tokens.last_sync_at),
      updated_at = now();
    return jsonb_build_object('ok', true);
  elsif op = 'get_token' then
    if coalesce(payload->>'athlete_id', '') <> '' then
      return coalesce((
        select jsonb_build_object(
          'line_user_id', t.line_user_id,
          'athlete_id', t.athlete_id,
          'access_token', t.access_token,
          'refresh_token', t.refresh_token,
          'expires_at', t.expires_at,
          'scope', t.scope,
          'last_sync_at', t.last_sync_at
        )
        from private.strava_tokens t
        where t.athlete_id = (payload->>'athlete_id')::bigint
      ), 'null'::jsonb);
    end if;
    return coalesce((
      select jsonb_build_object(
        'line_user_id', t.line_user_id,
        'athlete_id', t.athlete_id,
        'access_token', t.access_token,
        'refresh_token', t.refresh_token,
        'expires_at', t.expires_at,
        'scope', t.scope,
        'last_sync_at', t.last_sync_at
      )
      from private.strava_tokens t
      where t.line_user_id = payload->>'line_user_id'
    ), 'null'::jsonb);
  elsif op = 'touch_sync' then
    update private.strava_tokens
      set last_sync_at = now(), updated_at = now()
      where line_user_id = payload->>'line_user_id';
    return jsonb_build_object('ok', true);
  elsif op = 'delete_token' then
    if coalesce(payload->>'athlete_id', '') <> '' then
      delete from private.strava_tokens where athlete_id = (payload->>'athlete_id')::bigint;
    else
      delete from private.strava_tokens where line_user_id = payload->>'line_user_id';
    end if;
    return jsonb_build_object('ok', true);
  elsif op = 'put_state' then
    insert into private.strava_oauth_states (nonce, line_user_id, expires_at)
    values (payload->>'nonce', payload->>'line_user_id', (payload->>'expires_at')::timestamptz)
    on conflict (nonce) do nothing;
    return jsonb_build_object('ok', true);
  elsif op = 'consume_state' then
    update private.strava_oauth_states
      set used_at = now()
      where nonce = payload->>'nonce'
        and line_user_id = payload->>'line_user_id'
        and used_at is null
        and expires_at > now()
      returning nonce into nonce;
    return jsonb_build_object('ok', nonce is not null);
  elsif op = 'context' then
    line_id := payload->>'line_user_id';
    return jsonb_build_object(
      'bikes', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', b.id, 'name', b.name, 'brand', b.brand,
          'strava_gear_id', b.strava_gear_id, 'archived', b.archived
        ))
        from public.bikes b where b.line_user_id = line_id
      ), '[]'::jsonb),
      'wheelsets', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', w.id, 'bike_id', w.bike_id, 'name', w.name, 'mounted', w.mounted
        ))
        from public.wheelsets w where w.line_user_id = line_id
      ), '[]'::jsonb),
      'last_bike_id', (
        select m.bike_id from public.mileage_logs m
        where m.line_user_id = line_id
        order by m.ride_date desc, m.created_at desc limit 1
      ),
      'last_wheel_id', (
        select m.wheelset_id from public.mileage_logs m
        where m.line_user_id = line_id and m.wheelset_id is not null
        order by m.ride_date desc, m.created_at desc limit 1
      )
    );
  elsif op = 'remove_activity' then
    select * into existing from public.pending_activities
      where line_user_id = payload->>'line_user_id'
        and source = 'strava'
        and external_id = payload->>'external_id';
    if existing.id is not null and existing.mileage_log_id is not null then
      delete from public.mileage_logs where id = existing.mileage_log_id;
    end if;
    delete from public.pending_activities
      where line_user_id = payload->>'line_user_id'
        and source = 'strava'
        and external_id = payload->>'external_id';
    return jsonb_build_object('ok', true);
  elsif op = 'apply' then
    line_id := payload->>'line_user_id';
    km := round((payload->>'distance_km')::numeric, 1);
    ride_day := (payload->>'occurred_on')::date;
    if km is null or km <= 0 or km > 2000 or ride_day is null then
      return jsonb_build_object('status', 'ignored');
    end if;
    insert into public.pending_activities (
      line_user_id, source, external_id, sport_type, name, occurred_on, distance_km,
      is_indoor, ask_chain, gear_external_id, status, bike_id, wheelset_id
    ) values (
      line_id, 'strava', payload->>'external_id', coalesce(payload->>'sport_type', ''),
      left(coalesce(payload->>'name', ''), 120), ride_day, km,
      coalesce((payload->>'is_indoor')::boolean, false),
      coalesce((payload->>'ask_chain')::boolean, false),
      coalesce(payload->>'gear_external_id', ''),
      case when coalesce((payload->>'assign')::boolean, false) then 'assigned' else 'pending' end,
      nullif(payload->>'bike_id', '')::uuid,
      nullif(payload->>'wheelset_id', '')::uuid
    )
    on conflict (line_user_id, source, external_id) do update set
      sport_type = excluded.sport_type,
      name = excluded.name,
      occurred_on = excluded.occurred_on,
      distance_km = excluded.distance_km,
      is_indoor = excluded.is_indoor,
      ask_chain = excluded.ask_chain,
      gear_external_id = excluded.gear_external_id
    returning * into existing;

    if existing.mileage_log_id is not null then
      update public.mileage_logs
        set km = existing.distance_km, ride_date = existing.occurred_on
        where id = existing.mileage_log_id;
      return jsonb_build_object('status', 'updated', 'mileage_log_id', existing.mileage_log_id);
    end if;

    if coalesce((payload->>'assign')::boolean, false)
      and nullif(payload->>'bike_id', '') is not null then
      insert into public.mileage_logs (
        line_user_id, ride_date, km, bike_id, wheelset_id, is_indoor, count_indoor_drivetrain,
        external_source, external_id
      ) values (
        line_id, ride_day, km,
        nullif(payload->>'bike_id', '')::uuid,
        nullif(payload->>'wheelset_id', '')::uuid,
        coalesce((payload->>'is_indoor')::boolean, false),
        coalesce((payload->>'count_indoor')::boolean, false),
        'strava', payload->>'external_id'
      )
      returning id into new_log;
      update public.pending_activities
        set status = 'assigned',
            mileage_log_id = new_log,
            bike_id = nullif(payload->>'bike_id', '')::uuid,
            wheelset_id = nullif(payload->>'wheelset_id', '')::uuid
        where id = existing.id;
      return jsonb_build_object('status', 'assigned', 'mileage_log_id', new_log);
    end if;

    update public.pending_activities
      set status = 'pending',
          bike_id = nullif(payload->>'bike_id', '')::uuid,
          wheelset_id = nullif(payload->>'wheelset_id', '')::uuid
      where id = existing.id and status is distinct from 'assigned';
    return jsonb_build_object('status', 'pending');
  end if;
  raise exception 'unknown op' using errcode = '22023';
end;
$$;

revoke all on function public.strava_backend(text, jsonb) from public, anon, authenticated;
grant execute on function public.strava_backend(text, jsonb) to service_role;
