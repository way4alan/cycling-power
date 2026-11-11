import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const LINE = 'U' + 'e'.repeat(32)
const BIKE = '55555555-5555-5555-5555-555555555555'

let failed = 0
function check(name, cond, detail) {
  if (cond) console.log('PASS', name)
  else {
    failed += 1
    console.error('FAIL', name, detail || '')
  }
}

async function sql(query) {
  const { stdout } = await exec('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'pace', '-v', 'ON_ERROR_STOP=1', '-tAc', query])
  return stdout.trim().split('\n').filter(Boolean).pop() || ''
}

function svc(op, payload) {
  const json = JSON.stringify(payload)
  return sql(`with cfg as (
    select set_config('request.jwt.claims', '{"role":"service_role"}', true)
  )
  select public.strava_backend('${op}', $payload$${json}$payload$::jsonb)::text from cfg`)
}

async function main() {
  await sql(`delete from public.mileage_logs where line_user_id = '${LINE}'`)
  await sql(`delete from public.pending_activities where line_user_id = '${LINE}'`)
  await sql(`delete from public.bikes where id = '${BIKE}'`)
  await sql(`delete from private.strava_oauth_states where line_user_id = '${LINE}'`)
  await sql(`delete from private.strava_tokens where line_user_id = '${LINE}'`)

  check('oauth state primary key is strava_oauth_states_pkey',
    (await sql(`select conname from pg_constraint where conrelid = 'private.strava_oauth_states'::regclass and contype = 'p'`)) === 'strava_oauth_states_pkey')
  check('pending activity conflict target keeps its generated name',
    (await sql(`select conname from pg_constraint where conrelid = 'public.pending_activities'::regclass and contype = 'u'`)) === 'pending_activities_line_user_id_source_external_id_key')
  check('anon and authenticated cannot execute strava_backend',
    (await sql(`select has_function_privilege('anon', 'public.strava_backend(text,jsonb)', 'execute')::text`)) === 'false'
    && (await sql(`select has_function_privilege('authenticated', 'public.strava_backend(text,jsonb)', 'execute')::text`)) === 'false'
    && (await sql(`select has_function_privilege('service_role', 'public.strava_backend(text,jsonb)', 'execute')::text`)) === 'true')

  await sql(`do $$
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated","line_user_id":"${LINE}"}', true);
    set local role authenticated;
    perform public.strava_backend('get_token', '{}'::jsonb);
    raise exception 'authenticated executed strava_backend';
  exception
    when insufficient_privilege then null;
  end $$`)
  await sql(`do $$
  begin
    set local role anon;
    perform public.strava_backend('get_token', '{}'::jsonb);
    raise exception 'anon executed strava_backend';
  exception
    when insufficient_privilege then null;
  end $$`)
  const forbidden = await sql(`create temp table strava_msg (msg text);
  do $$
  declare
    msg text := 'allowed';
  begin
    perform set_config('request.jwt.claims', '{"role":"authenticated","line_user_id":"${LINE}"}', true);
    begin
      perform public.strava_backend('put_state', '{"nonce":"nope","line_user_id":"${LINE}","expires_at":"2030-01-01T00:00:00Z"}'::jsonb);
    exception
      when sqlstate '42501' then msg := 'forbidden';
    end;
    insert into strava_msg values (msg);
  end $$;
  select msg from strava_msg`)
  check('authenticated jwt cannot run strava_backend', forbidden === 'forbidden', forbidden)

  check('put_state accepts a nonce',
    (await svc('put_state', { nonce: 'state-1', line_user_id: LINE, expires_at: '2030-01-01T00:00:00Z' })).includes('"ok": true'))
  check('put_state again does not duplicate the nonce',
    (await svc('put_state', { nonce: 'state-1', line_user_id: LINE, expires_at: '2030-01-01T00:00:00Z' })).includes('"ok": true')
    && (await sql(`select count(*) from private.strava_oauth_states where nonce = 'state-1'`)) === '1')
  check('consume_state accepts the nonce once',
    (await svc('consume_state', { nonce: 'state-1', line_user_id: LINE })) === '{"ok": true}')
  check('a reused nonce is rejected',
    (await svc('consume_state', { nonce: 'state-1', line_user_id: LINE })) === '{"ok": false}'
    && (await sql(`select used_at is not null from private.strava_oauth_states where nonce = 'state-1'`)) === 't')
  check('an expired nonce is rejected and stays unused',
    (await svc('put_state', { nonce: 'state-old', line_user_id: LINE, expires_at: '2000-01-01T00:00:00Z' })).includes('"ok": true')
    && (await svc('consume_state', { nonce: 'state-old', line_user_id: LINE })) === '{"ok": false}'
    && (await sql(`select used_at is null from private.strava_oauth_states where nonce = 'state-old'`)) === 't')
  await svc('put_state', { nonce: 'state-other', line_user_id: LINE, expires_at: '2030-01-01T00:00:00Z' })
  check('a nonce cannot be consumed by another rider',
    (await svc('consume_state', { nonce: 'state-other', line_user_id: 'U' + 'f'.repeat(32) })) === '{"ok": false}'
    && (await sql(`select used_at is null from private.strava_oauth_states where nonce = 'state-other'`)) === 't')

  check('put_token stores a connection',
    (await svc('put_token', {
      line_user_id: LINE, athlete_id: 77, access_token: 'access-old', refresh_token: 'refresh-old',
      expires_at: '2030-01-01T00:00:00Z', scope: 'activity:read_all,profile:read_all'
    })).includes('"ok": true'))
  const got = await svc('get_token', { line_user_id: LINE })
  check('get_token returns the access token for that rider', got.includes('"access_token": "access-old') || got.includes('"access_token":"access-old'), got)
  check('put_token refreshes the access token and keeps last_sync empty',
    (await svc('put_token', {
      line_user_id: LINE, athlete_id: 77, access_token: 'access-new', refresh_token: 'refresh-new',
      expires_at: '2031-01-01T00:00:00Z', scope: 'activity:read_all,profile:read_all'
    })).includes('"ok": true')
    && (await svc('get_token', { line_user_id: LINE })).includes('access-new')
    && !(await svc('get_token', { line_user_id: LINE })).includes('access-old'))
  check('get_token can look up the athlete',
    (await svc('get_token', { athlete_id: 77 })).includes('access-new'))
  check('touch_sync records a time',
    (await svc('touch_sync', { line_user_id: LINE })).includes('"ok": true')
    && (await svc('get_token', { line_user_id: LINE })).includes('last_sync_at'))
  const afterTouch = await svc('get_token', { line_user_id: LINE })
  check('refresh does not wipe the last sync time',
    (await svc('put_token', {
      line_user_id: LINE, athlete_id: 77, access_token: 'access-kept', refresh_token: 'refresh-kept',
      expires_at: '2032-01-01T00:00:00Z', scope: 'activity:read_all,profile:read_all'
    })).includes('"ok": true')
    && (await svc('get_token', { line_user_id: LINE })).includes(afterTouch.match(/"last_sync_at": ?"([^"]+)"/)?.[1] || 'missing-sync'))

  await sql(`insert into public.bikes (id, line_user_id, name, brand, odometer_km)
    values ('${BIKE}', '${LINE}', 'Madone', 'Trek', 0)`)
  const wheel = await sql(`select id from public.wheelsets where bike_id = '${BIKE}' and mounted`)
  check('context lists the bike and its wheelset',
    (await svc('context', { line_user_id: LINE })).includes(BIKE)
    && (await svc('context', { line_user_id: LINE })).includes(wheel))

  const assigned = await svc('apply', {
    line_user_id: LINE, external_id: 'ride-1', sport_type: 'Ride', name: '河濱',
    occurred_on: '2026-11-08', distance_km: 10, is_indoor: false, ask_chain: false,
    assign: true, bike_id: BIKE, wheelset_id: wheel, count_indoor: false
  })
  check('apply inserts one assigned ride',
    assigned.includes('"status": "assigned"') || assigned.includes('"status":"assigned"'), assigned)
  check('the first distance landed on the bike',
    (await sql(`select odometer_km::int from public.bikes where id = '${BIKE}'`)) === '10'
    && (await sql(`select count(*) from public.mileage_logs where external_id = 'ride-1'`)) === '1')
  const updated = await svc('apply', {
    line_user_id: LINE, external_id: 'ride-1', sport_type: 'Ride', name: '河濱',
    occurred_on: '2026-11-08', distance_km: 16, is_indoor: false, ask_chain: false,
    assign: true, bike_id: BIKE, wheelset_id: wheel, count_indoor: false
  })
  check('apply updates the same ride instead of inserting another',
    (updated.includes('"status": "updated"') || updated.includes('"status":"updated"'))
    && (await sql(`select count(*) from public.mileage_logs where external_id = 'ride-1'`)) === '1'
    && (await sql(`select km::int from public.mileage_logs where external_id = 'ride-1'`)) === '16'
    && (await sql(`select odometer_km::int from public.bikes where id = '${BIKE}'`)) === '16', updated)
  const pending = await svc('apply', {
    line_user_id: LINE, external_id: 'ride-2', sport_type: 'VirtualRide', name: '室內',
    occurred_on: '2026-11-09', distance_km: 12, is_indoor: true, ask_chain: true,
    assign: false, bike_id: BIKE, wheelset_id: '', count_indoor: false
  })
  check('a non-assigned activity stays pending and does not move the odometer',
    (pending.includes('"status": "pending"') || pending.includes('"status":"pending"'))
    && (await sql(`select status || '|' || ask_chain::text from public.pending_activities where external_id = 'ride-2'`)) === 'pending|true'
    && (await sql(`select odometer_km::int from public.bikes where id = '${BIKE}'`)) === '16', pending)
  const ignored = await svc('apply', {
    line_user_id: LINE, external_id: 'ride-3', sport_type: 'Ride', name: '太長',
    occurred_on: '2026-11-09', distance_km: 0, is_indoor: false, ask_chain: false,
    assign: true, bike_id: BIKE, wheelset_id: wheel, count_indoor: false
  })
  check('a zero-kilometer activity is ignored',
    (ignored.includes('"status": "ignored"') || ignored.includes('"status":"ignored"'))
    && (await sql(`select count(*) from public.pending_activities where external_id = 'ride-3'`)) === '0', ignored)
  check('remove_activity deletes the ride and reverses the distance',
    (await svc('remove_activity', { line_user_id: LINE, external_id: 'ride-1' })).includes('"ok": true')
    && (await sql(`select count(*) from public.mileage_logs where external_id = 'ride-1'`)) === '0'
    && (await sql(`select count(*) from public.pending_activities where external_id = 'ride-1'`)) === '0'
    && (await sql(`select odometer_km::int from public.bikes where id = '${BIKE}'`)) === '0')

  check('delete_token by athlete removes the row',
    (await svc('delete_token', { athlete_id: 77 })).includes('"ok": true')
    && (await svc('get_token', { athlete_id: 77 })) === 'null')
  await svc('put_token', {
    line_user_id: LINE, athlete_id: 78, access_token: 'access-bye', refresh_token: 'refresh-bye',
    expires_at: '2030-01-01T00:00:00Z', scope: 'activity:read_all,profile:read_all'
  })
  check('delete_token by rider removes the row',
    (await svc('delete_token', { line_user_id: LINE })).includes('"ok": true')
    && (await svc('get_token', { line_user_id: LINE })) === 'null')

  const unknown = await sql(`create temp table strava_unknown (msg text);
  do $$
  declare
    msg text := 'unexpected';
  begin
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    begin
      perform public.strava_backend('nope', '{}'::jsonb);
    exception
      when sqlstate '22023' then msg := 'unknown';
    end;
    insert into strava_unknown values (msg);
  end $$;
  select msg from strava_unknown`)
  check('an unknown action is rejected', unknown === 'unknown', unknown)

  if (failed) {
    console.error(failed + ' strava backend checks failed')
    process.exit(1)
  }
  console.log('strava backend SQL checks passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
