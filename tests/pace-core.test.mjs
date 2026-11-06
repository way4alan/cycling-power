import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

createRequire(import.meta.url)('../lib/pace-core.js')
const P = globalThis.PaceCore

const riders = [
  { id: 'hi', line_user_id: 'Uhi', name: '小林', ftp: 330, weight: 72, status: 'approved', attendance_count: 50, last_seen: '2026-11-06' },
  { id: 'me', line_user_id: 'Ume', name: '阿揚', ftp: 305, weight: 68, status: 'approved', attendance_count: 1 },
  { id: 'kev', line_user_id: 'Ukev', name: 'Kevin', ftp: 290, weight: 66, status: 'approved' },
  { id: 'low', line_user_id: 'Ulow', name: '大熊', ftp: 200, weight: 85, status: 'approved' },
  { id: 'once', line_user_id: 'Uonce', name: 'Momo', ftp: 210, weight: 52, status: 'approved' },
  { id: 'pend', line_user_id: 'Upend', name: '新人', ftp: 400, weight: 60, status: 'pending' }
]

function ride(id, date, extra) {
  return Object.assign({ id, date, time: '06:00', is_finished: true, cancelled: false, title: id, location: '愛河' }, extra)
}

function att(rideId, rider) {
  return { ride_id: rideId, rider_id: rider.id, line_user_id: rider.line_user_id, name: rider.name }
}

test('Taipei calendar boundaries and the 56-day window', () => {
  assert.equal(P.taipeiDate(new Date('2026-11-05T16:30:00Z')), '2026-11-06')
  assert.equal(P.taipeiDate(new Date('2026-11-06T15:59:00Z')), '2026-11-06')
  assert.equal(P.taipeiDate(new Date('2026-11-06T16:00:00Z')), '2026-11-07')
  const today = '2026-11-06'
  assert.equal(P.shiftISODate(today, -56), '2026-09-11')
  const rides = [
    ride('in', '2026-09-11'),
    ride('out', '2026-09-10'),
    ride('today', '2026-11-06'),
    ride('future', '2026-11-07', { is_finished: true }),
    ride('cancel', '2026-11-01', { cancelled: true }),
    ride('open', '2026-11-02', { is_finished: false })
  ]
  const attendances = [
    att('in', riders[1]), att('today', riders[1]),
    att('out', riders[1]), att('future', riders[1]), att('cancel', riders[1]), att('open', riders[1])
  ]
  const board = P.podium({ today, riders, rides, attendances })
  assert.equal(board.counts.me, 2)
  assert.equal(board.eligible.some(r => r.id === 'me'), true)
  assert.equal(board.counts.hi, undefined)
})

test('dedupe, future, cancelled, registrations and all-time count do not invent podium riders', () => {
  const today = '2026-11-06'
  const rides = [
    ride('a', '2026-11-01'),
    ride('b', '2026-11-02'),
    ride('future', '2026-11-20'),
    ride('cancel', '2026-10-20', { cancelled: true }),
    ride('soon', '2026-11-08', { is_finished: false })
  ]
  const attendances = [
    att('a', riders[0]), att('a', riders[0]),
    att('future', riders[0]),
    att('cancel', riders[0]),
    att('a', riders[2]), att('b', riders[2]),
    att('a', riders[5])
  ]
  const board = P.podium({ today, riders, rides, attendances })
  assert.equal(board.counts.hi, 1)
  assert.equal(board.top.some(r => r.id === 'hi'), false)
  assert.equal(board.counts.kev, 2)
  assert.equal(board.counts.pend, undefined)
  assert.equal(board.top.length, 1)
  assert.equal(board.top[0].id, 'kev')
  assert.equal(board.emptySlots, 2)
  assert.equal(board.eligible.some(r => r.name === '新人'), false)
  assert.equal(JSON.stringify(board.top).includes('小林'), false)
})

test('fewer than three qualifiers stay empty and power order is only among qualifiers', () => {
  const today = '2026-11-06'
  const rides = [ride('a', '2026-11-01'), ride('b', '2026-11-03'), ride('c', '2026-10-15')]
  const attendances = [
    att('a', riders[1]), att('b', riders[1]),
    att('a', riders[3]), att('b', riders[3]), att('c', riders[3]),
    att('a', riders[4])
  ]
  const board = P.podium({ today, riders, rides, attendances })
  assert.deepEqual(board.top.map(r => r.id), ['me', 'low'])
  assert.equal(board.emptySlots, 1)
  assert.equal(board.eligible.length, 2)
  assert.ok(board.counts.me >= 2)
  assert.equal(board.counts.once, 1)
})

test('monthly board uses Taipei month, excludes cancelled and ties by skipping the next rank', () => {
  const today = P.taipeiDate(new Date('2026-10-31T16:30:00Z'))
  assert.equal(today, '2026-11-01')
  const rides = [
    ride('oct', '2026-10-31'),
    ride('nov1', '2026-11-01'),
    ride('nov2', '2026-11-01'),
    ride('cancel', '2026-11-01', { cancelled: true }),
    ride('future', '2026-11-20'),
    ride('draft', '2026-11-01', { is_finished: false })
  ]
  const bear = riders[3]
  const yang = riders[1]
  const kev = riders[2]
  const attendances = [
    att('oct', bear),
    att('nov1', bear), att('nov2', bear), att('nov1', bear),
    att('cancel', bear), att('future', bear), att('draft', bear),
    att('nov1', yang), att('nov2', yang),
    att('nov1', kev)
  ]
  const month = P.monthlyBoard({ today, riders, rides, attendances })
  assert.equal(month.month, '2026-11')
  assert.equal(month.rows.find(r => r.riderId === 'low').count, 2)
  assert.equal(month.rows.find(r => r.riderId === 'me').count, 2)
  assert.equal(month.rows.find(r => r.riderId === 'kev').count, 1)
  assert.deepEqual(month.rows.map(r => r.rank), [1, 1, 3])
  assert.equal(month.rows[0].count, month.rows[1].count)
  assert.ok(month.rows[0].name.localeCompare(month.rows[1].name, 'zh-Hant') <= 0)
})

test('copy and templates do not carry people, old code, date, or status', () => {
  const source = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: '晨騎',
    date: '2026-01-01',
    time: '06:00',
    location: '愛河之心',
    garmin_code: 'OLDCODE',
    garmin_url: 'https://connect.garmin.com/modern/course/123456',
    note: '帶水',
    is_finished: true,
    cancelled: true,
    created_at: '2026-01-01T00:00:00Z',
    registrations: [{ line_user_id: 'Usecret', name: '甲' }],
    attendances: [{ line_user_id: 'Usecret', name: '甲' }]
  }
  const groups = [{ id: 'g-old', ride_id: source.id, name: 'A 組', pace_note: '有人輪帶', sort_order: 0 }]
  const draft = P.rideDraftFromSource(source, groups)
  assert.equal(draft.date, undefined)
  assert.equal(draft.garmin_code, undefined)
  assert.equal(draft.id, undefined)
  assert.equal(draft.groups[0].id, undefined)
  assert.equal(draft.groups[0].name, 'A 組')
  assert.equal(JSON.stringify(draft).includes('OLDCODE'), false)
  assert.equal(JSON.stringify(draft).includes('Usecret'), false)
  const preview = P.previewCopies([{
    key: 'one',
    sourceKind: 'ride',
    sourceId: source.id,
    date: '2026-12-07',
    garminCode: '',
    draft
  }])
  const payload = preview.items[0].payload
  assert.equal(preview.items[0].blockers.length, 0)
  assert.equal(payload.date, '2026-12-07')
  assert.equal(payload.garmin_code, '')
  assert.equal(payload.is_finished, false)
  assert.equal(payload.cancelled, false)
  assert.equal(payload.id, undefined)
  assert.equal(payload.created_at, undefined)
  assert.equal(payload.title, '晨騎')
  assert.equal(payload.garmin_url, 'https://connect.garmin.com/modern/course/123456')
  assert.equal(preview.items[0].registrationCount, 0)
  assert.equal(preview.items[0].attendanceCount, 0)
  const fresh = P.previewCopies([{ sourceKind: 'ride', sourceId: source.id, date: '2026-12-08', garminCode: 'FRESH', draft }])
  assert.equal(fresh.items[0].payload.garmin_code, 'FRESH')
  const applied = P.applyTemplate({ title: '週日晨騎', time: '06:30', location: '壽山', garmin_code: 'NOPE', date: '1999-01-01' }, groups)
  assert.equal(applied.published, false)
  assert.equal(applied.persisted, false)
  assert.equal(applied.draft.date, undefined)
  assert.equal(applied.draft.garmin_code, undefined)
  assert.equal(applied.draft.title, '週日晨騎')
})

test('bulk preview blocks missing dates and duplicate clicks do not insert', async () => {
  const draft = P.rideDraftFromSource({ title: '晨騎', time: '06:00', location: '愛河' }, [])
  const item = (date, key) => ({ key, sourceKind: 'ride', sourceId: 'ride-old', date, draft, garminCode: '' })
  const missing = P.previewCopies([item('', 'a')])
  assert.ok(missing.items[0].blockers.includes('缺少新日期'))
  assert.equal(missing.items[0].payload, null)
  let calls = 0
  const insert = async () => { calls += 1; return { id: 'new-' + calls } }
  const blocked = await P.publishCopies([item('', 'a')], insert)
  assert.equal(calls, 0)
  assert.equal(blocked.results[0].status, 'blocked')
  const dup = await P.publishCopies([item('2026-12-01', 'a'), item('2026-12-01', 'b')], insert)
  assert.equal(calls, 1)
  assert.equal(dup.results[0].status, 'published')
  assert.equal(dup.results[1].status, 'blocked')
  const busy = await P.publishCopies([item('2026-12-02', 'c')], insert, { locked: true })
  assert.equal(busy.reason, 'busy')
  assert.equal(calls, 1)
  calls = 0
  let n = 0
  const flaky = async () => {
    n += 1
    if (n === 2) return { error: true, code: '23505', duplicate: true }
    if (n === 3) return { error: true }
    return { id: 'ok-' + n }
  }
  const partial = await P.publishCopies([
    item('2026-12-03', 'p1'),
    item('2026-12-04', 'p2'),
    item('2026-12-05', 'p3'),
    item('2026-12-06', 'p4')
  ], flaky)
  assert.deepEqual(partial.results.map(r => r.status), ['published', 'duplicate', 'failed', 'published'])
  assert.equal(partial.partial, true)
  assert.equal(partial.results[1].status === 'published', false)
})

test('group signup stays optional and rejects another ride group', () => {
  const groups = [
    { id: 'g1', ride_id: 'ride-1', name: 'A 組', pace_note: '巡航' },
    { id: 'g2', ride_id: 'ride-2', name: 'B 組', pace_note: '輕鬆' }
  ]
  const plain = P.buildRegistration({ rideId: 'ride-1', groupId: '', groups, allowGroup: true })
  assert.equal(plain.ok, true)
  assert.equal(plain.grouped, false)
  assert.equal(plain.row.group_id, undefined)
  const chosen = P.buildRegistration({ rideId: 'ride-1', groupId: 'g1', groups, allowGroup: true })
  assert.equal(chosen.row.group_id, 'g1')
  assert.equal(chosen.row.line_user_id, undefined)
  const wrong = P.buildRegistration({ rideId: 'ride-1', groupId: 'g2', groups, allowGroup: true })
  assert.equal(wrong.ok, false)
  assert.equal(wrong.reason, 'bad-group')
  const oldSchema = P.buildRegistration({ rideId: 'ride-1', groupId: 'g1', groups, allowGroup: false })
  assert.equal(oldSchema.ok, false)
})

test('GPX parser handles elevation, missing elevation, and hostile files', () => {
  const gpx = `<?xml version="1.0"?>
    <gpx><trk><trkseg>
      <trkpt lat="22.6300" lon="120.2800"><ele>10</ele></trkpt>
      <trkpt lat="22.6400" lon="120.2800"><ele>40</ele></trkpt>
      <trkpt lat="22.6500" lon="120.2800"><ele>35</ele></trkpt>
    </trkseg></trk></gpx>`
  const parsed = P.parseGpx(gpx)
  assert.equal(parsed.ok, true)
  assert.equal(parsed.distanceEstimated, true)
  assert.ok(parsed.distanceKm > 2 && parsed.distanceKm < 2.4)
  assert.equal(parsed.ascentM, 30)
  assert.equal(parsed.ascentEstimated, true)
  assert.ok(P.trackSvg(parsed.points).includes('<polyline'))
  assert.equal(P.trackSvg(parsed.points).includes('<script'), false)
  const flat = P.parseGpx('<gpx><trkpt lat="22.63" lon="120.28"/><trkpt lat="22.64" lon="120.29"/></gpx>')
  assert.equal(flat.ok, true)
  assert.equal(flat.ascentM, null)
  assert.match(flat.message, /沒有高度/)
  assert.equal(P.parseGpx('').reason, 'empty')
  assert.equal(P.parseGpx('<gpx><trk></trk></gpx>').reason, 'no-points')
  assert.equal(P.parseGpx('<gpx><trkpt lat="nope" lon="120"></trkpt></gpx>').reason, 'no-points')
  const entity = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><gpx><trkpt lat="22.6" lon="120.2">&xxe;</trkpt></gpx>`
  assert.equal(P.parseGpx(entity).reason, 'untrusted')
  assert.equal(P.parseGpx('x'.repeat(20), { maxBytes: 10 }).reason, 'oversized')
  const gap = P.parseGpx(`<gpx>
    <trkpt lat="22.63" lon="120.28"><ele>10</ele></trkpt>
    <trkpt lat="22.64" lon="120.28"></trkpt>
    <trkpt lat="22.65" lon="120.28"><ele>50</ele></trkpt>
  </gpx>`)
  assert.equal(gap.ascentM, null)
})

test('Garmin course URLs normalize to the same id and reject unsafe links', () => {
  const a = P.normalizeGarminUrl('https://connect.garmin.com/modern/course/123456?lang=zh-TW')
  const b = P.normalizeGarminUrl('http://connect.garmin.com/course/123456')
  const c = P.normalizeGarminUrl('https://connect.garmin.com/modern/course/embed/123456')
  assert.equal(a.courseId, '123456')
  assert.equal(b.courseId, '123456')
  assert.equal(c.courseId, '123456')
  assert.equal(a.canonical, b.canonical)
  assert.equal(a.canonical, 'https://connect.garmin.com/modern/course/123456')
  assert.equal(a.original.includes('lang=zh-TW'), true)
  const activity = P.normalizeGarminUrl('https://connect.garmin.com/modern/activity/123456')
  assert.equal(activity.ok, true)
  assert.equal(activity.courseId, null)
  assert.equal(P.normalizeGarminUrl('javascript:alert(1)').ok, false)
  assert.equal(P.normalizeGarminUrl('https://user:pass@connect.garmin.com/modern/course/123456').ok, false)
  assert.equal(P.safeHttpUrl('javascript:https://connect.garmin.com/modern/course/1'), '')
  const routes = [{ id: 'r1', garmin_course_id: '123456', title: '壽山' }]
  assert.equal(P.findRouteByCourseId(routes, a.courseId).title, '壽山')
})

test('announcement uses saved fields only, escapes text, and deep-links that ride', () => {
  const built = P.buildAnnouncement({
    id: 'ride-next',
    title: '週日晨騎 <script>',
    date: '2026-11-08',
    time: '06:00',
    location: '愛河之心｜高雄市',
    distance_km: 62.4,
    distance_estimated: true,
    pace_note: '分組自己騎',
    note: '',
    garmin_url: 'https://connect.garmin.com/modern/course/123456',
    garmin_code: '',
    groups: [{ name: 'A 組', pace_note: '有人輪帶' }]
  }, { liffId: '2010470481-aY3CdaJS' })
  assert.equal(built.ok, true)
  assert.match(built.text, /2026年11月8日/)
  assert.match(built.text, /06:00 愛河之心/)
  assert.match(built.text, /62\.4 km（估算）/)
  assert.match(built.text, /A 組/)
  assert.equal(built.text.includes('爬升'), false)
  assert.equal(built.text.includes('備註'), false)
  assert.equal(built.text.includes('GroupRide'), false)
  assert.equal(built.text.includes('待補'), false)
  assert.equal(built.deepLink, 'https://liff.line.me/2010470481-aY3CdaJS?ride=ride-next')
  assert.equal(built.flex.altText.length > 0, true)
  assert.equal(built.flex.contents.footer.contents.every(b => b.action.type === 'uri' && b.action.uri.startsWith('https://')), true)
  assert.equal(P.escapeHtml(built.text).includes('<script>'), false)
  assert.match(P.escapeHtml(built.text), /&lt;script&gt;/)
  const withCode = P.buildAnnouncement({
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    title: '旗津',
    date: '2026-11-02',
    time: '06:10',
    location: '民族路',
    garmin_code: 'AB1234',
    note: '記得帶水'
  }, { liffId: '2010470481-aY3CdaJS' })
  assert.match(withCode.text, /GroupRide 代碼：AB1234/)
  assert.match(withCode.text, /記得帶水/)
  assert.equal(withCode.text.includes('距離'), false)
  assert.match(withCode.deepLink, /ride=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/)
})

test('share target picker cancel and fallback are not reported as sent', async () => {
  let calls = 0
  const ready = {
    isApiAvailable(name) { return name === 'shareTargetPicker' },
    async shareTargetPicker() { calls += 1; return undefined }
  }
  const cancelled = await P.runShare(ready, { type: 'flex', altText: 'x', contents: {} })
  assert.equal(cancelled.status, 'cancelled')
  assert.equal(cancelled.sent, false)
  assert.equal(calls, 1)
  const sent = await P.runShare({
    isApiAvailable() { return true },
    async shareTargetPicker() { return { status: 'success' } }
  }, { type: 'text', text: 'hi' })
  assert.deepEqual(sent, { status: 'sent', sent: true })
  const thrown = await P.runShare({
    isApiAvailable() { return true },
    async shareTargetPicker() { throw new Error('picker') }
  }, { type: 'text', text: 'hi' })
  assert.equal(thrown.sent, false)
  assert.equal(thrown.status, 'error')
  const missing = { isApiAvailable() { return false }, shareTargetPicker() { calls += 1 } }
  const unavailable = await P.runShare(missing, { type: 'text', text: 'hi' })
  assert.equal(unavailable.status, 'unavailable')
  assert.equal(unavailable.sent, false)
  assert.deepEqual(P.copyResult(), { status: 'copied', sent: false })
  assert.equal(P.shareAvailability(null), 'unavailable')
})

test('a failed directory read is not treated as a new member', () => {
  assert.equal(P.interpretRiderLookup({ data: null, error: { code: '42P01', message: 'relation riders_directory does not exist' } }).kind, 'error')
  assert.equal(P.interpretRiderLookup({ data: null, error: { code: 'PGRST116', message: 'no rows' } }).kind, 'new')
  assert.equal(P.interpretRiderLookup({ data: null, error: null }).kind, 'new')
  assert.equal(P.interpretRiderLookup({ data: { status: 'pending' }, error: null }).kind, 'pending')
  assert.equal(P.interpretRiderLookup({ data: { status: 'approved', id: '1' }, error: null }).kind, 'member')
  assert.equal(P.isMissingSchemaError({ code: 'PGRST205', message: 'Could not find the table' }), true)
  assert.equal(P.isMissingSchemaError({ code: '42501', message: 'permission denied' }), false)
})

test('next ride is the soonest upcoming unfinished ride', () => {
  const now = new Date('2026-11-06T22:30:00Z').getTime()
  const rides = [
    { id: 'later', date: '2026-11-15', time: '06:00', is_finished: false },
    { id: 'next', date: '2026-11-08', time: '06:00', is_finished: false },
    { id: 'done', date: '2026-11-01', time: '06:00', is_finished: true },
    { id: 'cancel', date: '2026-11-07', time: '06:00', cancelled: true, is_finished: false },
    { id: 'gone', date: '2026-11-06', time: '06:00', is_finished: false }
  ]
  assert.equal(P.nextUpcoming(rides, now).id, 'next')
})
