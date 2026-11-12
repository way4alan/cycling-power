import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const ME = 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const OTHER = 'Ubbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

let failed = 0
function check(name, cond, detail) {
  if (cond) console.log('PASS', name)
  else {
    failed += 1
    console.error('FAIL', name, detail || '')
  }
}

async function sql(query) {
  const { stdout } = await exec('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'pace', '-v', 'ON_ERROR_STOP=1', '-tA', '-c', query])
  return stdout.trim().split('\n').filter(Boolean).pop() || ''
}
function asRider(line, statement) {
  return `select set_config('request.jwt.claims', '{"role":"authenticated","line_user_id":"${line}"}', true);
select set_config('role', 'authenticated', true);
${statement}`
}

async function main() {
  await sql(`delete from public.attendances where line_user_id in ('${ME}', '${OTHER}')`)
  await sql(`delete from public.member_badges where line_user_id in ('${ME}', '${OTHER}')`)
  await sql(`delete from public.badge_prompts where line_user_id in ('${ME}', '${OTHER}')`)
  await sql(`delete from public.ride_checkin_prompts where line_user_id in ('${ME}', '${OTHER}')`)
  await sql(`delete from public.ftp_prompts where line_user_id in ('${ME}', '${OTHER}')`)
  await sql(`delete from public.pending_activities where line_user_id in ('${ME}', '${OTHER}')`)

  await sql(`insert into public.pending_activities (line_user_id, external_id, cached_at, distance_km, occurred_on)
    values ('${ME}', 'old-cache', now() - interval '8 days', 10, current_date),
           ('${ME}', 'fresh-cache', now() - interval '6 days', 12, current_date)`)
  await sql(`select public.purge_expired_strava_cache()`)
  check('seven day purge removes only the expired cache',
    (await sql(`select string_agg(external_id, ',' order by external_id) from public.pending_activities where line_user_id = '${ME}'`)) === 'fresh-cache')

  await sql(`insert into public.member_badges (line_user_id, badge_key, tier, earned_on)
    values ('${ME}', 'west_wuling', 'sub4', '2026-03-01')`)
  await sql(`insert into public.badge_prompts (line_user_id, badge_key, tier, earned_on)
    values ('${ME}', 'west_wuling', 'sub2', '2026-08-02')`)
  const prompt = await sql(`select id from public.badge_prompts where line_user_id = '${ME}' and tier = 'sub2'`)
  check('badge and prompt rows exist', /^[0-9a-f-]{36}$/.test(prompt), prompt)

  const seen = await sql(asRider(OTHER, `select (select count(*) from public.badge_prompts)::text || '|' || (select count(*) from public.member_badges)::text`))
  check('another member sees the pace badge and not the strava prompt', seen === '0|1', seen)

  await sql(asRider(ME, `select public.confirm_my_badge('${prompt}'::uuid)`))
  check('confirming a higher west wuling grade replaces the lower one',
    (await sql(`select tier from public.member_badges where line_user_id = '${ME}' and badge_key = 'west_wuling'`)) === 'sub2')

  await sql(`insert into public.badge_prompts (line_user_id, badge_key, tier, earned_on)
    values ('${ME}', 'west_wuling', 'finisher', '2026-09-01')`)
  const lower = await sql(`select id from public.badge_prompts where line_user_id = '${ME}' and tier = 'finisher' and status = 'pending'`)
  await sql(asRider(ME, `select public.confirm_my_badge('${lower}'::uuid)`))
  check('a lower grade does not replace the higher one',
    (await sql(`select tier from public.member_badges where line_user_id = '${ME}' and badge_key = 'west_wuling'`)) === 'sub2')

  const ride = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
  await sql(`insert into public.ride_checkin_prompts (line_user_id, ride_id, ride_title, ride_date)
    values ('${ME}', '${ride}', '晨騎', current_date)`)
  const checkin = await sql(`select id from public.ride_checkin_prompts where line_user_id = '${ME}' and status = 'pending'`)
  await sql(asRider(ME, `select public.confirm_my_checkin('${checkin}'::uuid)`))
  check('check-in is written only through the confirmed prompt',
    (await sql(`select count(*) from public.attendances where line_user_id = '${ME}' and ride_id = '${ride}'`)) === '1')

  const beforeFtp = await sql(`select ftp::int::text from public.riders where line_user_id = '${ME}'`)
  await sql(`insert into public.ftp_prompts (line_user_id, proposed_ftp) values ('${ME}', 318)`)
  const ftp = await sql(`select id from public.ftp_prompts where line_user_id = '${ME}' and status = 'pending'`)
  await sql(asRider(ME, `select public.dismiss_my_prompt('ftp', '${ftp}'::uuid)`))
  const ftpResult = await sql(`select r.ftp::int::text || '|' || p.status from public.riders r left join public.ftp_prompts p on p.id = '${ftp}' where r.line_user_id = '${ME}'`)
  check('dismissing ftp leaves the pace ftp unchanged', ftpResult === beforeFtp + '|dismissed', ftpResult)
  await sql(`insert into public.ftp_prompts (line_user_id, proposed_ftp) values ('${ME}', 240)`)
  const ftpYes = await sql(`select id from public.ftp_prompts where line_user_id = '${ME}' and status = 'pending' and proposed_ftp = 240`)
  await sql(asRider(ME, `select public.confirm_my_ftp('${ftpYes}'::uuid)`))
  check('confirming ftp updates the pace value',
    (await sql(`select ftp::int::text from public.riders where line_user_id = '${ME}'`)) === '240')

  await sql(`select public.forget_member_strava('${ME}')`)
  check('forgetting strava cache keeps the confirmed badge',
    (await sql(`select (select count(*) from public.pending_activities where line_user_id = '${ME}')::text || '|' || (select count(*) from public.member_badges where line_user_id = '${ME}')::text`)) === '0|1')
  const purgePriv = await sql(`select has_function_privilege('anon', 'public.purge_expired_strava_cache()', 'execute')`)
  const confirmPriv = await sql(`select has_function_privilege('anon', 'public.confirm_my_badge(uuid)', 'execute')`)
  check('anon cannot run the purge', purgePriv === 'f' || purgePriv === 'false', purgePriv)
  check('anon cannot confirm a badge', confirmPriv === 'f' || confirmPriv === 'false', confirmPriv)

  if (failed) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
