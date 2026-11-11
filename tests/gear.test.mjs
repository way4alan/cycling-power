import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

createRequire(import.meta.url)('../lib/gear.js')
const G = globalThis.PaceGear

function bike() {
  return { id: 'b1', line_user_id: 'me', name: 'Madone SLR Gen 8', brand: 'Trek', odometer_km: 100, archived: false }
}
function state() {
  const seeded = G.seedBike(bike(), { wheelId: 'w-stock' })
  const aero = { id: 'w-aero', line_user_id: 'me', bike_id: 'b1', name: 'Bontrager Aeolus RSL', brand: 'Bontrager', odometer_km: 40, mounted: false }
  return {
    bikes: [bike()],
    wheelsets: [seeded.wheelset, aero],
    components: seeded.components.concat(G.seedWheelsetComponents(aero))
  }
}

test('a new bike starts with a factory wheelset and both consumable sets', () => {
  const seeded = G.seedBike({ id: 'b', line_user_id: 'me' })
  assert.equal(seeded.wheelset.name, '原廠輪組')
  assert.equal(seeded.wheelset.mounted, true)
  const kinds = seeded.components.map(row => row.kind).sort()
  assert.deepEqual(kinds, ['bar_tape', 'brake_fluid', 'brake_pads', 'cassette_chainrings', 'chain_replace', 'chain_wax', 'sealant', 'shift_cables', 'tires'])
  const wax = seeded.components.find(row => row.kind === 'chain_wax')
  const replace = seeded.components.find(row => row.kind === 'chain_replace')
  assert.equal(wax.interval_km, 250)
  assert.equal(wax.interval_months, null)
  assert.equal(wax.basis, 'team')
  assert.equal(replace.interval_km, null)
  assert.equal(replace.interval_months, null)
  assert.equal(seeded.components.find(row => row.kind === 'tires').interval_km, null)
  assert.equal(seeded.components.find(row => row.kind === 'tires').interval_months, 36)
  assert.equal(seeded.components.find(row => row.kind === 'shift_cables').basis, 'rule_of_thumb')
  assert.equal(seeded.components.find(row => row.kind === 'sealant').wheelset_id, seeded.wheelset.id)
  assert.equal(wax.bike_id, 'b')
})

test('outdoor km updates the bike, chosen wheelset, and their consumables', () => {
  const before = state()
  const applied = G.applyMileage(before, { km: 25, bike_id: 'b1', wheelset_id: 'w-aero', is_indoor: false })
  assert.equal(applied.ok, true)
  assert.equal(applied.wheelsetId, 'w-aero')
  assert.equal(applied.bikes[0].odometer_km, 125)
  assert.equal(applied.wheelsets.find(row => row.id === 'w-aero').odometer_km, 65)
  assert.equal(applied.wheelsets.find(row => row.id === 'w-stock').odometer_km, 0)
  assert.equal(applied.components.find(row => row.kind === 'chain_wax').accumulated_km, 25)
  assert.equal(applied.components.find(row => row.kind === 'tires' && row.wheelset_id === 'w-aero').accumulated_km, 25)
  assert.equal(applied.components.find(row => row.kind === 'tires' && row.wheelset_id === 'w-stock').accumulated_km, 0)
})

test('outdoor km without a wheelset uses the mounted one', () => {
  const applied = G.applyMileage(state(), { km: 10, bike_id: 'b1', is_indoor: false })
  assert.equal(applied.wheelsetId, 'w-stock')
  assert.equal(applied.wheelsets.find(row => row.id === 'w-stock').odometer_km, 10)
})

test('indoor rides skip the wheelset unless the chain box is ticked', () => {
  const skipped = G.applyMileage(state(), { km: 30, bike_id: 'b1', is_indoor: true, count_indoor_drivetrain: false })
  assert.equal(skipped.applied, 'none')
  assert.equal(skipped.bikes[0].odometer_km, 100)
  assert.equal(skipped.components.find(row => row.kind === 'chain_wax').accumulated_km, 0)
  const counted = G.applyMileage(state(), { km: 30, bike_id: 'b1', is_indoor: true, count_indoor_drivetrain: true })
  assert.equal(counted.applied, 'drivetrain')
  assert.equal(counted.bikes[0].odometer_km, 130)
  assert.equal(counted.components.find(row => row.kind === 'chain_wax').accumulated_km, 30)
  assert.equal(counted.components.find(row => row.kind === 'brake_pads').accumulated_km, 0)
  assert.equal(counted.wheelsets.find(row => row.id === 'w-stock').odometer_km, 0)
  assert.equal(counted.components.find(row => row.kind === 'sealant').accumulated_km, 0)
})

test('due status uses whichever of km or months comes first', () => {
  assert.equal(G.gearStatus({
    accumulated_km: 400, km_at_last_service: 0, interval_km: 500, interval_months: 1, last_service_date: '2026-11-01'
  }, '2026-11-10').status, 'soon')
  assert.equal(G.gearStatus({
    accumulated_km: 500, km_at_last_service: 0, interval_km: 500, interval_months: 1, last_service_date: '2026-11-09'
  }, '2026-11-10').status, 'due')
  const byTime = G.gearStatus({
    accumulated_km: 10, km_at_last_service: 0, interval_km: 500, interval_months: 1, last_service_date: '2026-10-01'
  }, '2026-11-10')
  assert.equal(byTime.status, 'due')
  assert.equal(byTime.limiter, 'months')
  assert.equal(G.gearStatus({
    accumulated_km: 0, km_at_last_service: 0, interval_km: null, interval_months: 3, last_service_date: '2026-07-01'
  }, '2026-11-10').label, '到期檢查')
  assert.equal(G.gearStatus({
    accumulated_km: 8000, km_at_last_service: 0, interval_km: null, interval_months: 36, last_service_date: '2026-01-01'
  }, '2026-11-10').status, 'ok')
  assert.equal(G.gearStatus({
    accumulated_km: 9000, km_at_last_service: 0, interval_km: null, interval_months: null, last_service_date: '2020-01-01'
  }, '2026-11-10').status, 'ok')
})

test('chain wax is due at 250 km and ignores months', () => {
  const base = { kind: 'chain_wax', accumulated_km: 0, km_at_last_service: 0, interval_km: 250, interval_months: null, last_service_date: '2020-01-01' }
  assert.equal(G.gearStatus(Object.assign({}, base, { accumulated_km: 100 }), '2026-11-10').status, 'ok')
  assert.equal(G.gearStatus(Object.assign({}, base, { accumulated_km: 200 }), '2026-11-10').status, 'soon')
  const due = G.gearStatus(Object.assign({}, base, { accumulated_km: 250 }), '2026-11-10')
  assert.equal(due.status, 'due')
  assert.equal(due.limiter, 'km')
  assert.equal(due.label, '到期檢查')
})

test('chain replacement history keeps every change and the km ridden since the last one', () => {
  const bike = { id: 'b1', odometer_km: 2480 }
  const first = G.recordChainReplacement([], {
    id: 'h1', bike_id: 'b1', replaced_on: '2025-06-01', bike_km: 800, brand: 'SRAM', note: '第一條'
  })
  const history = G.recordChainReplacement(first, {
    id: 'h2', bike_id: 'b1', replaced_on: '2026-08-01', bike_km: 2000, brand: 'KMC', note: ''
  })
  const summary = G.chainSummary(bike, history)
  assert.equal(summary.date, '2026/08/01')
  assert.equal(summary.km, 480)
  assert.deepEqual(summary.history.map(row => row.bike_km), [2000, 800])
  assert.equal(summary.history[1].brand, 'SRAM')
  assert.equal(summary.history[1].note, '第一條')
  const after = Object.assign({}, bike, { odometer_km: 2600 })
  const again = G.recordChainReplacement(history, {
    id: 'h3', bike_id: 'b1', replaced_on: '2026-11-10', bike_km: after.odometer_km, brand: '', note: '磨耗 0.8%'
  })
  const reset = G.chainSummary(after, again)
  assert.equal(reset.km, 0)
  assert.equal(reset.history.length, 3)
  assert.equal(reset.history[0].note, '磨耗 0.8%')
})

test('garage rows say how much is left and put due items first', () => {
  assert.equal(G.remainText({
    kind: 'chain_wax', accumulated_km: 130, km_at_last_service: 0, interval_km: 250, interval_months: null
  }, '2026-11-10'), '剩 120 km')
  assert.equal(G.remainText({
    kind: 'chain_wax', accumulated_km: 250, km_at_last_service: 0, interval_km: 250, interval_months: null, last_service_date: '2020-01-01'
  }, '2026-11-10'), '到期')
  assert.equal(G.remainText({
    kind: 'brake_fluid', interval_km: null, interval_months: 1, last_service_date: '2026-11-03', accumulated_km: 0
  }, '2026-11-10'), '剩 23 天')
  assert.equal(G.remainText({
    kind: 'brake_pads', interval_km: null, interval_months: 1, last_service_date: '2026-09-01', accumulated_km: 0
  }, '2026-11-10'), '已超過 40 天')
  assert.equal(G.remainText({
    kind: 'chain_replace', interval_km: null, interval_months: null, last_service_date: '2020-01-01'
  }, '2026-11-10'), '依磨耗判斷')
  const sorted = G.sortConsumables([
    { kind: 'bar_tape', interval_km: null, interval_months: 12, last_service_date: '2026-11-01', accumulated_km: 0 },
    { kind: 'chain_wax', interval_km: 250, interval_months: null, accumulated_km: 250, km_at_last_service: 0, last_service_date: '2026-01-01' },
    { kind: 'brake_pads', interval_km: null, interval_months: 1, last_service_date: '2026-10-16', accumulated_km: 0 },
    { kind: 'chain_replace', interval_km: null, interval_months: null, last_service_date: '2020-01-01' }
  ], '2026-11-10').map(part => part.kind)
  assert.deepEqual(sorted, ['chain_wax', 'brake_pads', 'bar_tape', 'chain_replace'])
  assert.equal(G.actionLabel({ kind: 'chain_wax' }), '已上蠟')
  assert.equal(G.actionLabel({ kind: 'chain_replace' }), '已更換')
  assert.equal(G.actionLabel({ kind: 'brake_pads' }), '已檢查')
  assert.equal(G.chainSinceText(
    { id: 'b1', odometer_km: 2480 },
    [{ bike_id: 'b1', replaced_on: '2026-08-12', bike_km: 2000 }]
  ), '上次換鍊 2026/08/12・已騎 480 km')
})

test('mileage sheet asks for a bike or wheelset only when there is more than one', () => {
  const one = G.mileagePrompt(
    [{ id: 'b1', archived: false }],
    [{ id: 'w1', bike_id: 'b1', mounted: true }],
    'b1'
  )
  assert.equal(one.showBikes, false)
  assert.equal(one.showWheelsets, false)
  assert.equal(one.wheelsetId, 'w1')
  const wheels = G.mileagePrompt(
    [{ id: 'b1', archived: false }],
    [{ id: 'w1', bike_id: 'b1', mounted: false }, { id: 'w2', bike_id: 'b1', mounted: true }],
    'b1'
  )
  assert.equal(wheels.showBikes, false)
  assert.equal(wheels.showWheelsets, true)
  assert.equal(wheels.wheelsetId, 'w2')
  const bikes = G.mileagePrompt(
    [{ id: 'b1', archived: false }, { id: 'b2', archived: false }, { id: 'b3', archived: true }],
    [{ id: 'w1', bike_id: 'b1', mounted: true }],
    ''
  )
  assert.equal(bikes.showBikes, true)
  assert.equal(bikes.bikeId, 'b1')
  assert.equal(bikes.showWheelsets, false)
})

test('strava import auto-assigns one setup, asks which bike otherwise, and suggests a name match', () => {
  const one = G.planStravaActivity({
    sport: 'Ride',
    bikes: [{ id: 'b', archived: false }],
    wheelsets: [{ id: 'w', bike_id: 'b', mounted: true }]
  })
  assert.equal(one.action, 'assign')
  assert.equal(one.bikeId, 'b')
  assert.equal(one.wheelsetId, 'w')
  assert.equal(G.planStravaActivity({
    sport: 'GravelRide', bikes: [{ id: 'b', archived: false }], wheelsets: [{ id: 'w', bike_id: 'b' }]
  }).action, 'assign')
  assert.equal(G.planStravaActivity({ sport: 'Run', bikes: [{ id: 'b' }], wheelsets: [] }).action, 'ignore')
  assert.equal(G.planStravaActivity({ sport: 'Swim', bikes: [], wheelsets: [] }).action, 'ignore')
  const indoor = G.planStravaActivity({
    sport: 'VirtualRide',
    bikes: [{ id: 'b', archived: false }],
    wheelsets: [{ id: 'w', bike_id: 'b', mounted: true }]
  })
  assert.equal(indoor.action, 'pending')
  assert.equal(indoor.askChain, true)
  assert.equal(indoor.notice, '這次騎哪台？')
  const pending = G.planStravaActivity({
    sport: 'MountainBikeRide',
    bikes: [{ id: 'b1', archived: false }, { id: 'b2', archived: false, strava_gear_id: 'g9' }],
    wheelsets: [
      { id: 'w1', bike_id: 'b1', mounted: true },
      { id: 'w2', bike_id: 'b2', mounted: true },
      { id: 'w3', bike_id: 'b2', mounted: false }
    ],
    lastBikeId: 'b1',
    lastWheelId: 'w1'
  })
  assert.equal(pending.action, 'pending')
  assert.equal(pending.bikeId, 'b1')
  assert.equal(pending.wheelsetId, 'w1')
  const matched = G.planStravaActivity({
    sport: 'EBikeRide',
    gearId: 'g9',
    bikes: [{ id: 'b1', archived: false }, { id: 'b2', archived: false, strava_gear_id: 'g9' }],
    wheelsets: [{ id: 'w2', bike_id: 'b2', mounted: true }]
  })
  assert.equal(matched.action, 'assign')
  assert.equal(matched.bikeId, 'b2')
  const suggested = G.suggestStravaBikes(
    [{ id: 'b', name: 'Madone SLR', brand: 'Trek', archived: false }],
    [{ id: 's1', name: 'madone slr' }, { id: 's2', name: 'Emonda' }]
  )
  assert.equal(suggested[0].stravaGearId, 's1')
  assert.equal(suggested[0].suggested, true)
})

test('strava authorize uses the mobile endpoint on phones and keeps the callback across login', () => {
  const desktop = 'https://www.strava.com/oauth/authorize?client_id=295868&redirect_uri=https%3A%2F%2Fcycling-power.vercel.app%2F%3Fstrava%3Dcallback&response_type=code&state=abc'
  const iphone = G.stravaConnectPlan(desktop, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', true)
  assert.equal(iphone.open, 'liff-external')
  assert.equal(new URL(iphone.url).pathname, '/oauth/mobile/authorize')
  assert.equal(new URL(iphone.url).searchParams.get('state'), 'abc')
  assert.equal(new URL(iphone.url).searchParams.get('redirect_uri'), 'https://cycling-power.vercel.app/?strava=callback')
  const android = G.stravaConnectPlan(desktop, 'Mozilla/5.0 (Linux; Android 14; Pixel 8)', false)
  assert.equal(android.open, 'assign')
  assert.equal(new URL(android.url).pathname, '/oauth/mobile/authorize')
  const mac = G.stravaConnectPlan(iphone.url, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', false)
  assert.equal(new URL(mac.url).pathname, '/oauth/authorize')
  assert.equal(mac.open, 'assign')
  const parsed = G.parseStravaCallback('?strava=callback&code=the-code&state=the-state')
  const session = new Map()
  const local = new Map()
  const store = (map) => ({
    getItem: (key) => map.get(key) || null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key)
  })
  G.persistStravaCallback(parsed, [store(session), store(local)])
  session.clear()
  assert.deepEqual(G.readStravaCallback([store(session), store(local)]), { code: 'the-code', state: 'the-state', error: '' })
  assert.equal(G.stravaLoginRedirect(parsed), 'https://cycling-power.vercel.app/?strava=callback&code=the-code&state=the-state')
  assert.equal(G.stravaCallbackScreen({ ok: true }).title, '已連結 Strava')
  assert.equal(G.stravaCallbackScreen({ error: 'access_denied' }).title, '沒有完成授權')
  assert.equal(G.stravaCallbackScreen({ error: 'invalid_state' }).title, '請回 App 再按一次連結')
  G.forgetStravaCallback([store(local)])
  assert.equal(G.readStravaCallback([store(session), store(local)]), null)
})

test('strava import only keeps bike sports and auto-assigns a single setup', () => {
  assert.equal(G.classifyStravaSport('Ride').action, 'import')
  assert.equal(G.classifyStravaSport('GravelRide').indoor, false)
  assert.equal(G.classifyStravaSport('MountainBikeRide').action, 'import')
  assert.equal(G.classifyStravaSport('EBikeRide').action, 'import')
  assert.deepEqual(G.classifyStravaSport('VirtualRide'), { action: 'import', indoor: true, askChain: true })
  assert.equal(G.classifyStravaSport('Run').action, 'ignore')
  assert.equal(G.classifyStravaSport('Swim').action, 'ignore')
  const only = G.assignImportedRide(
    [{ id: 'b', archived: false }],
    [{ id: 'w', bike_id: 'b' }]
  )
  assert.equal(only.status, 'auto')
  assert.equal(only.wheelsetId, 'w')
  const ask = G.assignImportedRide(
    [{ id: 'b', archived: false }, { id: 'c', archived: false }],
    [{ id: 'w', bike_id: 'b' }]
  )
  assert.equal(ask.status, 'pending')
  assert.match(ask.notice, /哪台車/)
})
