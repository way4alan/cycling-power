import { createHmac } from 'node:crypto'
import { execFile } from 'node:child_process'
import { spawn } from 'node:child_process'
import http from 'node:http'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const exec = promisify(execFile)
const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long'
const API = process.env.PACE_API || 'http://127.0.0.1:54321'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const A = 'U' + 'a'.repeat(32)
const B = 'U' + 'b'.repeat(32)
const ADMIN = 'U' + 'c'.repeat(32)
const PENDING = 'U' + 'd'.repeat(32)
const A_ID = '11111111-1111-1111-1111-111111111111'
const B_ID = '22222222-2222-2222-2222-222222222222'
const ADMIN_ID = '33333333-3333-3333-3333-333333333333'
const PENDING_ID = '44444444-4444-4444-4444-444444444444'
const RIDE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const B_REG = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

let failed = 0
function check(name, cond, detail) {
  if (cond) console.log('PASS', name)
  else {
    failed += 1
    console.error('FAIL', name, detail || '')
  }
}

function sign(claims, ttl = 3600) {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify({ iss: 'supabase', aud: claims.aud || claims.role, iat: now, exp: now + ttl, ...claims })).toString('base64url')
  const data = `${header}.${body}`
  const sig = createHmac('sha256', SECRET).update(data).digest('base64url')
  return `${data}.${sig}`
}

const anon = sign({ role: 'anon' })
const member = sign({ role: 'authenticated', sub: A, line_user_id: A })
const other = sign({ role: 'authenticated', sub: B, line_user_id: B })
const admin = sign({ role: 'authenticated', sub: ADMIN, line_user_id: ADMIN })
const pending = sign({ role: 'authenticated', sub: PENDING, line_user_id: PENDING })
const expired = sign({ role: 'authenticated', sub: A, line_user_id: A }, -120)

async function api(token, method, resource, body, prefer) {
  const headers = {
    apikey: anon,
    authorization: `Bearer ${token}`,
    'content-type': 'application/json'
  }
  if (method !== 'GET') headers.prefer = prefer || 'return=minimal'
  const res = await fetch(API + resource, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { json = null }
  return { status: res.status, text, json }
}
const ok = (status) => status >= 200 && status < 300

async function sql(query) {
  const { stdout } = await exec('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'pace', '-v', 'ON_ERROR_STOP=1', '-tAc', query])
  return stdout.trim()
}

async function reseed() {
  await exec('sudo', ['-n', '-u', 'postgres', 'psql', '-d', 'pace', '-v', 'ON_ERROR_STOP=1', '-f', path.join(ROOT, 'supabase/tests/seed.sql')])
}

function listen(server, port) {
  return new Promise((resolve) => server.listen(port, '127.0.0.1', resolve))
}

await reseed()

const anonRead = await api(anon, 'GET', '/riders_directory?select=id')
check('anon cannot read the directory', !ok(anonRead.status), anonRead.text)

const anonWrite = await api(anon, 'POST', '/riders', {
  line_user_id: A, name: '駭', ftp: 1, weight: 1, status: 'approved', is_admin: true
})
check('anon cannot insert a rider', !ok(anonWrite.status), anonWrite.text)
check('anon insert did not create a row', (await sql(`select count(*) from public.riders`)) === '4')

const anonTable = await api(anon, 'GET', '/rides?select=id')
check('anon cannot read rides', !ok(anonTable.status), anonTable.text)

const directory = await api(member, 'GET', '/riders_directory?select=id,line_user_id,name,status')
check('member can read the directory', ok(directory.status), directory.text)
const rows = directory.json || []
const self = rows.find((r) => r.id === A_ID)
const peer = rows.find((r) => r.id === B_ID)
check('member sees own line_user_id', self && self.line_user_id === A, JSON.stringify(self))
check('member does not see another line_user_id', peer && peer.line_user_id === null, JSON.stringify(peer))
check('member does not see pending riders', !rows.some((r) => r.id === PENDING_ID), JSON.stringify(rows.map((r) => r.id)))

const rawColumn = await api(member, 'GET', '/riders?select=line_user_id')
check('member cannot select line_user_id from the table', !ok(rawColumn.status), rawColumn.text)
const safeCols = await api(member, 'GET', '/riders?select=id,name')
check('member can still read other rider columns', ok(safeCols.status) && (safeCols.json || []).some((r) => r.id === B_ID), safeCols.text)

const ownUpdate = await api(member, 'PATCH', `/riders?id=eq.${A_ID}`, {
  ftp: 222, is_admin: true, status: 'pending', attendance_count: 40, name_color: '#ABCDEF', line_user_id: B
})
check('member can update own profile', ok(ownUpdate.status), ownUpdate.text)
const ownRow = await sql(`select ftp::int, is_admin, status, attendance_count, name_color, line_user_id from public.riders where id = '${A_ID}'`)
check('privileged columns stay locked for a member', ownRow === `222|f|approved|0||${A}`, ownRow)

const cross = await api(member, 'PATCH', `/riders?id=eq.${B_ID}`, { ftp: 999 })
check('member update of someone else is not an error response', ok(cross.status) || cross.status === 204, cross.text)
check('member did not change someone else', (await sql(`select ftp::int from public.riders where id = '${B_ID}'`)) === '210')

const pendingUp = await api(pending, 'PATCH', `/riders?id=eq.${PENDING_ID}`, { ftp: 181, status: 'approved', is_admin: true })
check('pending member can edit own application', ok(pendingUp.status), pendingUp.text)
check('pending member cannot self-approve or become admin',
  (await sql(`select ftp::int, status, is_admin from public.riders where id = '${PENDING_ID}'`)) === '181|pending|f')

const pendingReg = await api(pending, 'POST', '/registrations', {
  ride_id: RIDE_ID, line_user_id: ADMIN, name: '新'
})
check('pending member cannot register', !ok(pendingReg.status), pendingReg.text)

const spoof = await api(member, 'POST', '/registrations', {
  ride_id: RIDE_ID, line_user_id: B, name: '甲'
})
check('member can register', ok(spoof.status), spoof.text)
check('registration line_user_id is taken from the JWT',
  (await sql(`select line_user_id from public.registrations where ride_id = '${RIDE_ID}' and name = '甲'`)) === A)

const steal = await api(member, 'DELETE', `/registrations?id=eq.${B_REG}`)
check('deleting someone else returns success with no matching row', ok(steal.status) || steal.status === 204, steal.text)
check('someone else registration remains',
  (await sql(`select count(*) from public.registrations where id = '${B_REG}'`)) === '1')

const mineId = await sql(`select id from public.registrations where ride_id = '${RIDE_ID}' and line_user_id = '${A}'`)
const cancel = await api(member, 'DELETE', `/registrations?id=eq.${mineId}`)
check('member can cancel own registration', ok(cancel.status), cancel.text)
check('own registration is gone',
  (await sql(`select count(*) from public.registrations where line_user_id = '${A}'`)) === '0')

for (const [name, resource, body] of [
  ['ride', '/rides', { title: '偷發', date: '2026-11-09', time: '07:00', location: '測試' }],
  ['attendance', '/attendances', { ride_id: RIDE_ID, line_user_id: A, name: '甲' }],
  ['location', '/locations', { name: '偷', address: '偷' }],
  ['guideline', '/guidelines', { category: '偷', content: '偷' }],
  ['weather', '/weather_locations', { name: '偷', lat: 1, lng: 2 }]
]) {
  const res = await api(member, 'POST', resource, body)
  check(`member cannot write ${name}`, !ok(res.status), res.text)
}

const approve = await api(admin, 'PATCH', `/riders?id=eq.${PENDING_ID}`, { status: 'approved' })
check('admin can approve', ok(approve.status), approve.text)
check('pending rider is now approved', (await sql(`select status from public.riders where id = '${PENDING_ID}'`)) === 'approved')

const ride = await api(admin, 'POST', '/rides', { title: '管理員團', date: '2026-11-10', time: '06:30', location: '壽山' })
check('admin can create a ride', ok(ride.status), ride.text)
const createdRide = await sql(`select id from public.rides where title = '管理員團'`)
check('admin ride was stored', Boolean(createdRide), ride.text)

const attend = await api(admin, 'POST', '/attendances', {
  ride_id: RIDE_ID, line_user_id: B, name: '乙', avatar_url: ''
})
check('admin can record attendance', ok(attend.status), attend.text)
const count = await api(admin, 'PATCH', `/riders?id=eq.${B_ID}`, { attendance_count: 4 })
check('admin can change attendance_count', ok(count.status), count.text)
check('attendance row stored for the chosen rider',
  (await sql(`select line_user_id || '|' || (select attendance_count::text from public.riders where id = '${B_ID}') from public.attendances where ride_id = '${RIDE_ID}'`)) === `${B}|4`)

const memberDeleteRide = await api(member, 'DELETE', `/rides?id=eq.${createdRide}`)
check('member cannot delete a ride', (await sql(`select count(*) from public.rides where id = '${createdRide}'`)) === '1', memberDeleteRide.text)
const adminDeleteRide = await api(admin, 'DELETE', `/rides?id=eq.${createdRide}`)
check('admin can delete a ride', ok(adminDeleteRide.status), adminDeleteRide.text)
check('admin ride is gone', (await sql(`select count(*) from public.rides where id = '${createdRide}'`)) === '0')

const adminView = await api(admin, 'GET', `/riders_directory?id=eq.${B_ID}&select=line_user_id`)
check('admin can see another line_user_id', ok(adminView.status) && adminView.json?.[0]?.line_user_id === B, adminView.text)

const otherView = await api(other, 'GET', `/registrations_directory?id=eq.${B_REG}&select=line_user_id,rider_id`)
check('rider sees own registration line id and rider id',
  ok(otherView.status) && otherView.json?.[0]?.line_user_id === B && otherView.json?.[0]?.rider_id === B_ID,
  otherView.text)
const hiddenReg = await api(member, 'GET', `/registrations_directory?id=eq.${B_REG}&select=line_user_id,name,rider_id`)
check('other registration hides line_user_id but keeps name and rider id',
  ok(hiddenReg.status) && hiddenReg.json?.[0]?.line_user_id === null && hiddenReg.json?.[0]?.name === '乙' && hiddenReg.json?.[0]?.rider_id === B_ID,
  hiddenReg.text)

const stale = await api(expired, 'GET', '/rides?select=id')
check('expired JWT is rejected', stale.status === 401, stale.text)

const anonRoutes = await api(anon, 'GET', '/routes?select=id')
check('anon cannot read routes', !ok(anonRoutes.status), anonRoutes.text)
const anonTemplates = await api(anon, 'POST', '/ride_templates', { title: '偷', time: '06:00', location: '偷' })
check('anon cannot insert a template', !ok(anonTemplates.status), anonTemplates.text)
const anonGroups = await api(anon, 'GET', '/ride_groups?select=id')
check('anon cannot read ride groups', !ok(anonGroups.status), anonGroups.text)

const memberTemplate = await api(member, 'POST', '/ride_templates', { title: '偷範本', time: '06:00', location: '偷' })
check('member cannot create a template', !ok(memberTemplate.status), memberTemplate.text)
const memberTemplateRead = await api(member, 'GET', '/ride_templates?select=id,title')
check('member cannot read templates', ok(memberTemplateRead.status) && (memberTemplateRead.json || []).length === 0, memberTemplateRead.text)
const memberGroupWrite = await api(member, 'POST', '/ride_groups', { ride_id: RIDE_ID, name: '偷組', pace_note: 'x' })
check('member cannot create a ride group', !ok(memberGroupWrite.status), memberGroupWrite.text)
const memberRouteWrite = await api(member, 'POST', '/routes', { title: '偷路線', garmin_url: 'https://connect.garmin.com/modern/course/999' })
check('member cannot create a route', !ok(memberRouteWrite.status), memberRouteWrite.text)

const badUrl = await api(admin, 'POST', '/routes', { title: '壞連結', garmin_url: 'javascript:alert(1)' })
check('admin cannot store a javascript route URL', !ok(badUrl.status), badUrl.text)
const route = await api(admin, 'POST', '/routes', {
  title: '壽山',
  garmin_course_id: '123456',
  garmin_url: 'https://connect.garmin.com/modern/course/123456',
  original_url: 'https://connect.garmin.com/modern/course/123456',
  distance_km: 42,
  ascent_m: 380,
  distance_estimated: true,
  ascent_estimated: true,
  notes: '公開路線',
  track: [],
  point_count: 0
}, 'return=representation')
check('admin can save a route', ok(route.status) && route.json?.[0]?.id, route.text)
const routeId = route.json?.[0]?.id
const memberRouteRead = await api(member, 'GET', `/routes?id=eq.${routeId}&select=title,notes`)
check('approved member can read a route', ok(memberRouteRead.status) && memberRouteRead.json?.[0]?.title === '壽山', memberRouteRead.text)
const routeHack = await api(member, 'PATCH', `/routes?id=eq.${routeId}`, { title: '被改' })
check('member did not change a route', (await sql(`select title from public.routes where id = '${routeId}'`)) === '壽山', routeHack.text)
await api(admin, 'PATCH', `/riders?id=eq.${PENDING_ID}`, { status: 'pending' })
const pendingRoutes = await api(pending, 'GET', '/routes?select=id')
check('pending member does not receive routes', (pendingRoutes.json || []).length === 0, pendingRoutes.text)

const group = await api(admin, 'POST', '/ride_groups', {
  ride_id: RIDE_ID, name: 'A 組', pace_note: '有人輪帶', sort_order: 0
}, 'return=representation')
check('admin can define a ride group', ok(group.status) && group.json?.[0]?.id, group.text)
const groupId = group.json?.[0]?.id
const otherRide = await api(admin, 'POST', '/rides', {
  title: '另一場', date: '2026-12-01', time: '06:30', location: '壽山'
}, 'return=representation')
const otherRideId = otherRide.json?.[0]?.id
const otherGroup = await api(admin, 'POST', '/ride_groups', {
  ride_id: otherRideId, name: 'B 組', pace_note: '輕鬆', sort_order: 0
}, 'return=representation')
const otherGroupId = otherGroup.json?.[0]?.id
const wrongGroup = await api(member, 'POST', '/registrations', {
  ride_id: RIDE_ID, line_user_id: B, name: '甲', group_id: otherGroupId
})
check('member cannot join a group from another ride', !ok(wrongGroup.status), wrongGroup.text)
check('wrong group did not create a registration',
  (await sql(`select count(*) from public.registrations where ride_id = '${RIDE_ID}' and group_id = '${otherGroupId}'`)) === '0')
const grouped = await api(member, 'POST', '/registrations', {
  ride_id: RIDE_ID, line_user_id: B, name: '甲', avatar_url: '', group_id: groupId
})
check('member can sign up with a group on that ride', ok(grouped.status), grouped.text)
check('grouped signup keeps the JWT line id',
  (await sql(`select line_user_id || '|' || group_id from public.registrations where ride_id = '${RIDE_ID}' and name = '甲'`)) === `${A}|${groupId}`)
const groupedView = await api(other, 'GET', `/registrations_directory?ride_id=eq.${RIDE_ID}&select=line_user_id,group_id,name`)
const groupedRow = (groupedView.json || []).find((row) => row.name === '甲')
check('another member sees the group but not the line id',
  ok(groupedView.status) && groupedRow && groupedRow.line_user_id === null && groupedRow.group_id === groupId,
  groupedView.text)

const copied = await api(admin, 'POST', '/rides', {
  title: '晨騎',
  date: '2026-12-14',
  time: '06:00',
  location: '愛河之心',
  garmin_code: '',
  garmin_url: 'https://connect.garmin.com/modern/course/123456',
  note: '帶水',
  is_finished: false,
  cancelled: false,
  source_key: `ride:${RIDE_ID}:2026-12-14`
}, 'return=representation')
check('admin can publish a copied ride', ok(copied.status) && copied.json?.[0]?.id, copied.text)
const copiedId = copied.json?.[0]?.id
check('copied ride did not keep a groupride code or people',
  (await sql(`select coalesce(garmin_code, '') || '|' || is_finished::text || '|' || cancelled::text || '|' || (select count(*)::text from public.registrations where ride_id = '${copiedId}') from public.rides where id = '${copiedId}'`)) === '|false|false|0')
const again = await api(admin, 'POST', '/rides', {
  title: '晨騎', date: '2026-12-14', time: '06:00', location: '愛河之心', source_key: `ride:${RIDE_ID}:2026-12-14`
})
check('the same copy cannot be published twice', !ok(again.status), again.text)
check('duplicate copy did not add a row',
  (await sql(`select count(*) from public.rides where source_key = 'ride:${RIDE_ID}:2026-12-14'`)) === '1')
const template = await api(admin, 'POST', '/ride_templates', {
  title: '週日晨騎', time: '06:00', location: '愛河之心', garmin_url: 'https://connect.garmin.com/modern/course/123456'
}, 'return=representation')
check('admin can save a template without creating a ride', ok(template.status) && template.json?.[0]?.id, template.text)
check('saving a template did not add another ride',
  (await sql(`select count(*) from public.rides where title = '週日晨騎'`)) === '0')

check('existing rides default to sunday', (await sql(`select category from public.rides where id = '${RIDE_ID}'`)) === 'sunday')
const memberCat = await api(member, 'PATCH', `/rides?id=eq.${RIDE_ID}`, { category: 'challenge', pacing_guide: '偷改' })
check('member cannot change ride category',
  (await sql(`select category || '|' || pacing_guide from public.rides where id = '${RIDE_ID}'`)) === 'sunday|', memberCat.text)
const adminCat = await api(admin, 'PATCH', `/rides?id=eq.${RIDE_ID}`, {
  category: 'challenge',
  pacing_guide: '自己的節奏',
  supply_points: '20 公里補水',
  cutoff_times: '09:30 關一',
  gear_list: '頭燈、雨衣'
})
check('admin can set category and challenge notes', ok(adminCat.status), adminCat.text)
check('challenge notes were stored',
  (await sql(`select category || '|' || pacing_guide || '|' || supply_points from public.rides where id = '${RIDE_ID}'`)) === 'challenge|自己的節奏|20 公里補水')
const badCat = await api(admin, 'PATCH', `/rides?id=eq.${RIDE_ID}`, { category: 'secret' })
check('unknown category is rejected', !ok(badCat.status), badCat.text)
check('rejected category did not stick', (await sql(`select category from public.rides where id = '${RIDE_ID}'`)) === 'challenge')
const plainRide = await api(admin, 'POST', '/rides', { title: '預設類型', date: '2026-12-21', time: '06:00', location: '愛河' }, 'return=representation')
check('a new ride without category is sunday', ok(plainRide.status) && plainRide.json?.[0]?.category === 'sunday', plainRide.text)

const mock = http.createServer((req, res) => {
  let data = ''
  req.on('data', (chunk) => { data += chunk })
  req.on('end', () => {
    const params = new URLSearchParams(data)
    if (params.get('id_token') === 'good-token-which-is-long-enough' && params.get('client_id') === '2010470481') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({
        iss: 'https://access.line.me',
        sub: A,
        aud: '2010470481',
        exp: Math.floor(Date.now() / 1000) + 600
      }))
      return
    }
    res.writeHead(400)
    res.end('{}')
  })
})
await listen(mock, 9999)
const deno = spawn(process.env.DENO || 'deno', [
  'run', '--allow-net', '--allow-env', path.join(ROOT, 'supabase/functions/line-auth/index.ts')
], {
  env: {
    ...process.env,
    PORT: '8787',
    LINE_CHANNEL_ID: '2010470481',
    JWT_SECRET: SECRET,
    ALLOW_INSECURE_LINE_VERIFY_URL: '1',
    LINE_VERIFY_URL: 'http://127.0.0.1:9999/verify',
    JWT_TTL_SECONDS: '1800'
  },
  stdio: ['ignore', 'pipe', 'pipe']
})
let denoLog = ''
deno.stderr.on('data', (buf) => { denoLog += buf })
deno.stdout.on('data', (buf) => { denoLog += buf })
let issued = null
for (let i = 0; i < 50; i++) {
  try {
    const res = await fetch('http://127.0.0.1:8787', {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: anon },
      body: JSON.stringify({ id_token: 'good-token-which-is-long-enough' })
    })
    issued = { status: res.status, json: await res.json() }
    break
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}
check('line-auth exchanges a verified id token', issued && issued.status === 200 && issued.json.expires_in === 1800, JSON.stringify(issued) + denoLog)
if (issued && issued.json?.access_token) {
  const viaFunction = await api(issued.json.access_token, 'PATCH', `/riders?id=eq.${A_ID}`, { ftp: 230 })
  check('JWT from line-auth can update only that LINE user', ok(viaFunction.status), viaFunction.text)
  check('line-auth JWT wrote the row', (await sql(`select ftp::int from public.riders where id = '${A_ID}'`)) === '230')
  const forged = await api(issued.json.access_token, 'PATCH', `/riders?id=eq.${ADMIN_ID}`, { is_admin: false })
  check('line-auth JWT cannot demote an admin', (await sql(`select is_admin from public.riders where id = '${ADMIN_ID}'`)) === 't', forged.text)
}
const rejected = await fetch('http://127.0.0.1:8787', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id_token: 'bad-token-which-is-long-enough' })
})
check('line-auth rejects an unverified id token', rejected.status === 401, String(rejected.status))

deno.kill()
mock.close()

if (failed) {
  console.error(`${failed} checks failed`)
  process.exit(1)
}
console.log('RLS HTTP checks passed')
