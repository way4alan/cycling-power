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
  assert.deepEqual(kinds, ['bar_tape', 'brake_fluid', 'brake_pads', 'cassette_chainrings', 'chain', 'sealant', 'shift_cables', 'tires'])
  const chain = seeded.components.find(row => row.kind === 'chain')
  assert.equal(chain.interval_km, 500)
  assert.equal(chain.interval_months, 1)
  assert.equal(chain.reminder_kind, 'check')
  assert.equal(seeded.components.find(row => row.kind === 'tires').interval_km, null)
  assert.equal(seeded.components.find(row => row.kind === 'tires').interval_months, 36)
  assert.equal(seeded.components.find(row => row.kind === 'shift_cables').basis, 'rule_of_thumb')
  assert.equal(seeded.components.find(row => row.kind === 'sealant').wheelset_id, seeded.wheelset.id)
  assert.equal(chain.bike_id, 'b')
})

test('outdoor km updates the bike, chosen wheelset, and their consumables', () => {
  const before = state()
  const applied = G.applyMileage(before, { km: 25, bike_id: 'b1', wheelset_id: 'w-aero', is_indoor: false })
  assert.equal(applied.ok, true)
  assert.equal(applied.wheelsetId, 'w-aero')
  assert.equal(applied.bikes[0].odometer_km, 125)
  assert.equal(applied.wheelsets.find(row => row.id === 'w-aero').odometer_km, 65)
  assert.equal(applied.wheelsets.find(row => row.id === 'w-stock').odometer_km, 0)
  assert.equal(applied.components.find(row => row.kind === 'chain').accumulated_km, 25)
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
  assert.equal(skipped.components.find(row => row.kind === 'chain').accumulated_km, 0)
  const counted = G.applyMileage(state(), { km: 30, bike_id: 'b1', is_indoor: true, count_indoor_drivetrain: true })
  assert.equal(counted.applied, 'drivetrain')
  assert.equal(counted.bikes[0].odometer_km, 130)
  assert.equal(counted.components.find(row => row.kind === 'chain').accumulated_km, 30)
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
