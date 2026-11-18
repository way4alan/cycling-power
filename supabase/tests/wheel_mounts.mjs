import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const ME = 'Uaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
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
  const lines = stdout.trim().split('\n').map(line => line.trim()).filter(Boolean)
  return lines.find(line => /^[0-9a-f-]{36}$/.test(line)) || lines.pop() || ''
}
function asRider(statement) {
  return `select set_config('request.jwt.claims', '{"role":"authenticated","line_user_id":"${ME}"}', true);
select set_config('role', 'authenticated', true);
${statement}`
}

async function main() {
  await sql(`delete from public.mileage_logs where line_user_id = '${ME}'`)
  await sql(`delete from public.wheelset_mounts where line_user_id = '${ME}'`)
  await sql(`delete from public.chain_replacements where line_user_id = '${ME}'`)
  await sql(`delete from public.gear_components where line_user_id = '${ME}'`)
  await sql(`delete from public.wheelsets where line_user_id = '${ME}'`)
  await sql(`delete from public.bikes where line_user_id = '${ME}'`)

  const first = await sql(`insert into public.bikes (line_user_id, name, odometer_km) values ('${ME}', 'Emonda', 100) returning id`)
  check('first bike keeps the entered distance as its baseline',
    (await sql(`select baseline_km::int::text || '|' || odometer_km::int::text from public.bikes where id = '${first}'`)) === '100|100')
  check('a member with no wheelset gets one factory wheel mounted on the new bike',
    (await sql(`select count(*)::text || '|' || count(*) filter (where end_at is null)::text from public.wheelset_mounts where line_user_id = '${ME}' and bike_id = '${first}'`)) === '1|1')
  const wheelsAfterFirst = await sql(`select count(*) from public.wheelsets where line_user_id = '${ME}'`)
  const second = await sql(`insert into public.bikes (line_user_id, name, odometer_km) values ('${ME}', 'Madone', 40) returning id`)
  check('a second bike does not create another wheelset',
    (await sql(`select count(*) from public.wheelsets where line_user_id = '${ME}'`)) === wheelsAfterFirst, wheelsAfterFirst)
  const parts = await sql(`select count(*) from public.gear_components where bike_id = '${second}'`)
  check('the new bike still gets its own consumables', parts === '7', parts)
  const keptChains = await sql(`select count(*) from public.chain_replacements where bike_id in ('${first}', '${second}')`)
  check('chain history rows are created and kept', keptChains === '2', keptChains)

  const extra = await sql(`insert into public.wheelsets (line_user_id, name) values ('${ME}', 'Aeolus') returning id`)
  await sql(asRider(`select public.mount_wheelset('${second}'::uuid, '${extra}'::uuid)`))
  check('Madone now has the new wheel mounted',
    (await sql(`select wheelset_id::text from public.wheelset_mounts where bike_id = '${second}' and end_at is null`)) === extra)
  check('the factory wheel stays mounted on Emonda',
    (await sql(`select count(*) from public.wheelset_mounts where bike_id = '${first}' and end_at is null`)) === '1')
  check('one wheel is not mounted on two bikes',
    (await sql(`select count(*) from public.wheelset_mounts where wheelset_id = '${extra}' and end_at is null`)) === '1')

  await sql(`insert into public.mileage_logs (line_user_id, ride_date, km, bike_id, is_indoor) values ('${ME}', current_date, 12, '${second}', false)`)
  check('outdoor distance is added on top of the baseline',
    (await sql(`select odometer_km::int::text from public.bikes where id = '${second}'`)) === '52')
  check('that ride lands on the wheel mounted today',
    (await sql(`select wheelset_id::text from public.mileage_logs where bike_id = '${second}'`)) === extra)
  check('tire km follows the wheel, chain wax follows the bike',
    (await sql(`select (select accumulated_km::int from public.gear_components where wheelset_id = '${extra}' and kind = 'tires')::text || '|' || (select accumulated_km::int from public.gear_components where bike_id = '${second}' and kind = 'chain_wax')::text`)) === '12|12')

  const mount = await sql(`select id from public.wheelset_mounts where wheelset_id = '${extra}' and end_at is null`)
  await sql(`update public.mileage_logs set ride_date = current_date - 10 where bike_id = '${second}'`)
  await sql(asRider(`select public.set_mount_start('${mount}'::uuid, (current_date - 10))`))
  check('moving the mount start reattributes the earlier ride onto that wheel',
    (await sql(`select wheelset_id::text from public.mileage_logs where bike_id = '${second}'`)) === extra)

  await sql(`update public.mileage_logs set km = 20, bike_id = '${first}' where bike_id = '${second}'`)
  check('editing the ride distance and bike recomputes both bikes',
    (await sql(`select odometer_km::int::text from public.bikes where id = '${first}'`)) === '120'
    && (await sql(`select odometer_km::int::text from public.bikes where id = '${second}'`)) === '40')

  let blocked = false
  try {
    await sql(asRider(`update public.wheelsets set archived = true where line_user_id = '${ME}'`))
  } catch (error) {
    blocked = /need at least one wheelset/i.test(String(error.stderr || error.message || ''))
  }
  check('the last wheelsets cannot all be archived', blocked)
  check('archiving did not delete wheel rows',
    (await sql(`select count(*) from public.wheelsets where line_user_id = '${ME}' and archived is not true`)) === '2')

  if (failed) process.exit(1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
