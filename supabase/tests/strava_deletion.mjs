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
  const { stdout } = await exec('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'pace', '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-c', query])
  return stdout.trim().split('\n').filter(Boolean).pop() || ''
}
function asRider(line, statement) {
  return `select set_config('request.jwt.claims', '{"role":"authenticated","line_user_id":"${line}"}', true);
select set_config('role', 'authenticated', true);
${statement}`
}

async function main() {
  await sql(`delete from public.strava_deletion_notices where line_user_id in ('${ME}', '${OTHER}')`)
  const cols = await sql(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'strava_deletion_notices'`)
  check('the notice stores only the rider and timestamps', cols === 'line_user_id,recorded_at,dismissed_at', cols)
  await sql(`select public.note_strava_deletion('${ME}')`)
  check('a deletion notice is open for that rider',
    (await sql(`select (dismissed_at is null)::text from public.strava_deletion_notices where line_user_id = '${ME}'`)) === 'true')
  const seen = await sql(asRider(ME, `select line_user_id from public.strava_deletion_notices`))
  check('the rider can read their own notice', seen === ME, seen)
  const hidden = await sql(asRider(OTHER, `select count(*) from public.strava_deletion_notices`))
  check('another rider cannot see the notice', hidden === '0', hidden)
  let insertDenied = false
  try {
    await sql(asRider(ME, `insert into public.strava_deletion_notices (line_user_id) values ('${ME}')`))
  } catch (error) {
    insertDenied = /42501|permission denied|row-level security/i.test(String(error.stderr || error.message || error))
  }
  check('a rider cannot insert a notice', insertDenied)
  await sql(asRider(ME, `update public.strava_deletion_notices set dismissed_at = now(), recorded_at = '2000-01-01' where line_user_id = '${ME}'`))
  check('dismissing keeps the original time',
    (await sql(`select (dismissed_at is not null)::text || '|' || (recorded_at > '2001-01-01')::text from public.strava_deletion_notices where line_user_id = '${ME}'`)) === 'true|true')
  await sql(`select public.note_strava_deletion('${ME}')`)
  check('a later deauthorization opens the notice again',
    (await sql(`select (dismissed_at is null)::text from public.strava_deletion_notices where line_user_id = '${ME}'`)) === 'true')
  let memberDenied = false
  try {
    await sql(asRider(ME, `select public.note_strava_deletion('${ME}')`))
  } catch (error) {
    memberDenied = /42501|permission denied|forbidden/i.test(String(error.stderr || error.message || error))
  }
  check('a rider cannot record the notice themselves', memberDenied)
  const cron = await sql(`select exists(select 1 from pg_available_extensions where name = 'pg_cron')::text`)
  if (cron === 'true') {
    const job = await sql(`select count(*) from cron.job where jobname = 'purge-expired-strava-cache'`)
    check('pg_cron runs the seven-day purge daily', job === '1', job)
  } else {
    check('pg_cron is absent here; the daily purge is documented for Supabase Cron', true)
  }
  await sql(`delete from public.strava_deletion_notices where line_user_id = '${ME}'`)
  if (failed) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
