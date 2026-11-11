-- 修正 strava_backend：PL/pgSQL 變數 nonce 與欄位 nonce 同名，
-- put_state / consume_state 會報 column reference "nonce" is ambiguous。
-- 不改已經上過的 20261110180000。這支只替換函式，可重複執行。
--
-- 同一支 migration 裡的 private.gear_shift_km、private.gear_revise_mileage
-- 參數都是 p_*，觸發列用 old / new，沒有和欄位同名，不用替換。

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
begin
  if coalesce(auth.role(), '') is distinct from 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if op = 'put_token' then
    insert into private.strava_tokens as t (
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
    on conflict on constraint strava_tokens_pkey do update set
      athlete_id = excluded.athlete_id,
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      scope = excluded.scope,
      last_sync_at = coalesce(excluded.last_sync_at, t.last_sync_at),
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
        from private.strava_tokens as t
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
      from private.strava_tokens as t
      where t.line_user_id = payload->>'line_user_id'
    ), 'null'::jsonb);

  elsif op = 'touch_sync' then
    update private.strava_tokens as t
      set last_sync_at = now(), updated_at = now()
      where t.line_user_id = payload->>'line_user_id';
    return jsonb_build_object('ok', true);

  elsif op = 'delete_token' then
    if coalesce(payload->>'athlete_id', '') <> '' then
      delete from private.strava_tokens as t
        where t.athlete_id = (payload->>'athlete_id')::bigint;
    else
      delete from private.strava_tokens as t
        where t.line_user_id = payload->>'line_user_id';
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
      where s.nonce = payload->>'nonce'
        and s.line_user_id = payload->>'line_user_id'
        and s.used_at is null
        and s.expires_at > now()
      returning s.nonce into consumed_nonce;
    return jsonb_build_object('ok', consumed_nonce is not null);

  elsif op = 'context' then
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
          'id', w.id, 'bike_id', w.bike_id, 'name', w.name, 'mounted', w.mounted
        ))
        from public.wheelsets as w where w.line_user_id = v_line_id
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

  elsif op = 'remove_activity' then
    select p.* into v_pending
      from public.pending_activities as p
      where p.line_user_id = payload->>'line_user_id'
        and p.source = 'strava'
        and p.external_id = payload->>'external_id';
    if found and v_pending.mileage_log_id is not null then
      delete from public.mileage_logs as m where m.id = v_pending.mileage_log_id;
    end if;
    delete from public.pending_activities as p
      where p.line_user_id = payload->>'line_user_id'
        and p.source = 'strava'
        and p.external_id = payload->>'external_id';
    return jsonb_build_object('ok', true);

  elsif op = 'apply' then
    v_line_id := payload->>'line_user_id';
    v_km := round((payload->>'distance_km')::numeric, 1);
    v_ride_day := (payload->>'occurred_on')::date;
    if v_km is null or v_km <= 0 or v_km > 2000 or v_ride_day is null then
      return jsonb_build_object('status', 'ignored');
    end if;
    insert into public.pending_activities as p (
      line_user_id, source, external_id, sport_type, name, occurred_on, distance_km,
      is_indoor, ask_chain, gear_external_id, status, bike_id, wheelset_id
    ) values (
      v_line_id, 'strava', payload->>'external_id', coalesce(payload->>'sport_type', ''),
      left(coalesce(payload->>'name', ''), 120), v_ride_day, v_km,
      coalesce((payload->>'is_indoor')::boolean, false),
      coalesce((payload->>'ask_chain')::boolean, false),
      coalesce(payload->>'gear_external_id', ''),
      case when coalesce((payload->>'assign')::boolean, false) then 'assigned' else 'pending' end,
      nullif(payload->>'bike_id', '')::uuid,
      nullif(payload->>'wheelset_id', '')::uuid
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

    if coalesce((payload->>'assign')::boolean, false)
      and nullif(payload->>'bike_id', '') is not null then
      insert into public.mileage_logs as m (
        line_user_id, ride_date, km, bike_id, wheelset_id, is_indoor, count_indoor_drivetrain,
        external_source, external_id
      ) values (
        v_line_id, v_ride_day, v_km,
        nullif(payload->>'bike_id', '')::uuid,
        nullif(payload->>'wheelset_id', '')::uuid,
        coalesce((payload->>'is_indoor')::boolean, false),
        coalesce((payload->>'count_indoor')::boolean, false),
        'strava', payload->>'external_id'
      )
      returning m.id into v_new_log;
      update public.pending_activities as p
        set status = 'assigned',
            mileage_log_id = v_new_log,
            bike_id = nullif(payload->>'bike_id', '')::uuid,
            wheelset_id = nullif(payload->>'wheelset_id', '')::uuid
        where p.id = v_pending.id;
      return jsonb_build_object('status', 'assigned', 'mileage_log_id', v_new_log);
    end if;

    update public.pending_activities as p
      set status = 'pending',
          bike_id = nullif(payload->>'bike_id', '')::uuid,
          wheelset_id = nullif(payload->>'wheelset_id', '')::uuid
      where p.id = v_pending.id and p.status is distinct from 'assigned';
    return jsonb_build_object('status', 'pending');
  end if;

  raise exception 'unknown op' using errcode = '22023';
end;
$$;

revoke all on function public.strava_backend(text, jsonb) from public, anon, authenticated;
grant execute on function public.strava_backend(text, jsonb) to service_role;
