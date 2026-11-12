import assert from 'node:assert/strict'
import test from 'node:test'
import { createRequire } from 'node:module'

createRequire(import.meta.url)('../lib/challenges.js')
const C = globalThis.PaceChallenges
const P = C.PLACES

function ride(extra) {
  return Object.assign({
    sport: 'Ride',
    points: [],
    distanceKm: 0,
    elevationGainM: 0,
    maxEle: 0,
    elapsedSec: 0
  }, extra)
}
function at(place, ele) {
  return { lat: place.lat, lng: place.lng, ele: ele }
}

test('west wuling tiers use elapsed time and a higher grade replaces a lower one', () => {
  assert.equal(C.westTier(2 * 3600 - 1), 'sub2')
  assert.equal(C.westTier(2 * 3600), 'sub3')
  assert.equal(C.westTier(3 * 3600 - 1), 'sub3')
  assert.equal(C.westTier(3 * 3600), 'sub4')
  assert.equal(C.westTier(4 * 3600 - 1), 'sub4')
  assert.equal(C.westTier(4 * 3600), 'finisher')
  const base = ride({
    points: [at(P.puliMonument, 450), at(P.wuling, 3270)],
    maxEle: 3275,
    elevationGainM: 2800
  })
  assert.equal(C.detect(Object.assign({}, base, { elapsedSec: 2 * 3600 - 1 }))[1].tier, 'sub2')
  assert.equal(C.detect(Object.assign({}, base, { elapsedSec: 5 * 3600 })).find(b => b.key === 'west_wuling').tier, 'finisher')
  assert.equal(C.detect(ride({
    sport: 'VirtualRide',
    points: [at(P.puliMonument, 450), at(P.wuling, 3270)],
    maxEle: 3275,
    elevationGainM: 2800,
    elapsedSec: 3600
  })).length, 0)
  assert.equal(C.higherTier('sub4', 'sub2'), 'sub2')
  assert.equal(C.higherTier('sub2', 'finisher'), 'sub2')
  assert.deepEqual(C.keepBest([
    { key: 'west_wuling', tier: 'sub4' },
    { key: 'west_wuling', tier: 'sub2' },
    { key: 'wuling', tier: '' }
  ]), [
    { key: 'west_wuling', tier: 'sub2' },
    { key: 'wuling', tier: '' }
  ])
})

test('verified summits match and unverified finishes do not invent a geofence', () => {
  assert.equal(P.xiaoxueshanLodge.verified, true)
  assert.equal(P.yakouTunnel.verified, true)
  assert.equal(P.pingshanSchool.verified, true)
  assert.equal(P.fenglinBridge.verified, false)
  assert.equal(P.haishanCamp.verified, false)
  assert.equal(P.alishanPark.verified, true)
  assert.equal(P.liulongtou.verified, true)
  const wuling = C.detect(ride({
    points: [at(P.wuling, 3205)],
    maxEle: 3210,
    elevationGainM: 1600
  }))
  assert.equal(wuling.some(b => b.key === 'wuling'), true)
  assert.equal(wuling.some(b => b.key === 'west_wuling'), false)
  assert.equal(C.detect(ride({
    points: [at(P.dasyueshanPark, 2000)],
    maxEle: 2600,
    elevationGainM: 2000
  })).some(b => b.key === 'dasyueshan'), false)
  assert.equal(C.detect(ride({
    points: [at(P.bali, 5), { lat: 22.67, lng: 120.31, ele: 8 }],
    distanceKm: 360,
    elapsedSec: 20 * 3600
  })).some(b => b.key === 'north_south'), false)
  assert.equal(C.detect(ride({
    points: [at(P.alishanPark, 2100)],
    maxEle: 2100,
    elevationGainM: 1600
  })).some(b => b.key === 'alishan'), true)
  assert.equal(C.detect(ride({
    points: [at(P.xiaoxueshanLodge, 2600)],
    maxEle: 2600,
    elevationGainM: 2000
  })).some(b => b.key === 'dasyueshan'), true)
  assert.equal(C.detect(ride({
    points: [at(P.bali, 5), at(P.worldGames, 8)],
    distanceKm: 360,
    elapsedSec: 20 * 3600
  })).some(b => b.key === 'north_south'), true)
  assert.equal(C.detect(ride({
    points: [at(P.fugui, 10), at(P.eluanbi, 8)],
    distanceKm: 520,
    elapsedSec: 30 * 3600
  })).some(b => b.key === 'twin_towers'), true)
})

test('confirmation writes a badge, ftp, or attendance only after the rider accepts', () => {
  const owned = [{ key: 'west_wuling', tier: 'sub4', earned_on: '2026-03-01' }]
  const declined = C.applyBadgeDecision(owned, { key: 'west_wuling', tier: 'sub2', earned_on: '2026-08-02' }, false)
  assert.equal(declined[0].tier, 'sub4')
  const upgraded = C.applyBadgeDecision(owned, { key: 'west_wuling', tier: 'sub2', earned_on: '2026-08-02', historical: true }, true)
  assert.equal(upgraded.length, 1)
  assert.equal(upgraded[0].tier, 'sub2')
  assert.equal(upgraded[0].earned_on, '2026-08-02')
  const kept = C.applyBadgeDecision(upgraded, { key: 'west_wuling', tier: 'finisher', earned_on: '2026-09-01' }, true)
  assert.equal(kept[0].tier, 'sub2')
  assert.equal(C.applyBadgeDecision([], { key: 'team', kind: 'team', historical: true, earned_on: '2026-01-01' }, true).length, 0)
  assert.deepEqual(C.historyOffers([{ key: 'wuling' }, { key: 'not-a-badge' }]), [{ key: 'wuling' }])
  assert.equal(C.applyFtpDecision(305, 318, false), 305)
  assert.equal(C.applyFtpDecision(305, 318, true), 318)
  const rows = []
  assert.equal(C.applyCheckinDecision(rows, { ride_id: 'ride-1', line_user_id: 'me', name: '阿揚' }, false).length, 0)
  const once = C.applyCheckinDecision(rows, { ride_id: 'ride-1', line_user_id: 'me', name: '阿揚' }, true)
  assert.equal(once.length, 1)
  assert.equal(C.applyCheckinDecision(once, { ride_id: 'ride-1', line_user_id: 'me', name: '阿揚' }, true).length, 1)
})

test('group ride check-in needs the same day, a close start, and the route', () => {
  const track = [
    { lat: 22.63, lng: 120.28 },
    { lat: 22.64, lng: 120.28 },
    { lat: 22.65, lng: 120.28 }
  ]
  const ride = { date: '2026-11-08', time: '06:00', track }
  assert.equal(C.matchGroupRide({
    sport: 'Ride', localDate: '2026-11-08', localTime: '06:20',
    points: track
  }, ride), true)
  assert.equal(C.matchGroupRide({
    sport: 'Ride', localDate: '2026-11-08', localTime: '12:00',
    points: track
  }, ride), false)
  assert.equal(C.matchGroupRide({
    sport: 'VirtualRide', localDate: '2026-11-08', localTime: '06:05',
    points: track
  }, ride), false)
  assert.equal(C.matchGroupRide({
    sport: 'Ride', localDate: '2026-11-08', localTime: '06:05',
    points: [{ lat: 25.0, lng: 121.5 }]
  }, ride), false)
})

test('round island stays off until all four gates are configured', () => {
  assert.equal(P.roundNorth.verified, true)
  assert.equal(P.roundWest.verified, true)
  assert.equal(P.roundEast.verified, true)
  assert.equal(P.shouka.verified, true)
  const gates = {
    north: { lat: 25.1, lng: 121.5, radiusM: 30000 },
    west: { lat: 23.7, lng: 120.2, radiusM: 30000 },
    south: { lat: 22.0, lng: 120.75, radiusM: 30000 },
    east: { lat: 23.5, lng: 121.4, radiusM: 30000 }
  }
  const parts = [{
    sport: 'Ride',
    startedAt: '2026-11-01T00:00:00Z',
    distanceKm: 960,
    points: [
      { lat: 25.1, lng: 121.5 },
      { lat: 23.7, lng: 120.2 },
      { lat: 22.0, lng: 120.75 },
      { lat: 23.5, lng: 121.4 }
    ]
  }]
  assert.equal(C.roundIsland(parts), null)
  assert.equal(C.roundIsland([{
    sport: 'Ride',
    startedAt: '2026-11-01T00:00:00Z',
    distanceKm: 960,
    points: [at(P.roundNorth, 10), at(P.roundWest, 20), at(P.shouka, 460), at(P.roundEast, 15)]
  }]).key, 'round_island')
  assert.equal(C.roundIsland(parts, gates).key, 'round_island')
  parts[0].startedAt = '2026-10-01T00:00:00Z'
  parts.push({ sport: 'Ride', startedAt: '2026-11-01T00:00:00Z', distanceKm: 10, points: parts[0].points })
  assert.equal(C.roundIsland(parts, gates), null)
})

test('badge prompts keep one row per badge and group a ride together', () => {
  const rows = [
    { id: 'a1', badge_key: 'alishan', earned_on: '2026-05-03', strava_activity_id: '11', activity_name: '再騎阿里山', started_at: '2026-05-03T05:00:00+08:00', status: 'pending' },
    { id: 'a1b', badge_key: 'alishan', earned_on: '2026-05-03', strava_activity_id: '11', activity_name: '再騎阿里山', started_at: '2026-05-03T05:00:00+08:00', status: 'pending' },
    { id: 'a2', badge_key: 'alishan', earned_on: '2026-03-29', strava_activity_id: '9', activity_name: '阿里山', started_at: '2026-03-29T05:00:00+08:00', status: 'pending' },
    { id: 'w1', badge_key: 'wuling', earned_on: '2026-05-03', strava_activity_id: '12', activity_name: '武嶺西進', started_at: '2026-05-03T05:10:00+08:00', status: 'pending' },
    { id: 's4', badge_key: 'west_wuling', tier: 'sub4', earned_on: '2026-05-03', strava_activity_id: '12', activity_name: '武嶺西進', started_at: '2026-05-03T05:10:00+08:00', elapsed_sec: 13000, status: 'pending' },
    { id: 'fin', badge_key: 'west_wuling', tier: 'finisher', earned_on: '2026-03-01', strava_activity_id: '3', activity_name: '慢騎', started_at: '2026-03-01T05:00:00+08:00', status: 'pending' }
  ]
  const grouped = C.groupBadgePrompts(rows)
  assert.equal(grouped.count, 3)
  assert.equal(grouped.groups[0].activityId, '12')
  assert.deepEqual(grouped.groups[0].badges.map(b => b.key + (b.tier ? ':' + b.tier : '')), ['wuling', 'west_wuling:sub4'])
  assert.equal(grouped.groups[1].activityId, '9')
  assert.equal(grouped.groups[1].badges[0].key, 'alishan')
  assert.equal(grouped.groups.some(g => g.activityId === '11'), false)
  assert.equal(grouped.groups.some(g => g.activityId === '3'), false)
})

test('strava cache drops rows older than seven days', () => {
  const now = '2026-11-12T00:00:00Z'
  const rows = [
    { id: 'fresh', created_at: '2026-11-06T00:00:01Z' },
    { id: 'edge', created_at: '2026-11-05T00:00:00Z' },
    { id: 'old', created_at: '2026-11-04T23:59:59Z' }
  ]
  assert.equal(C.stravaCacheExpired(rows[0].created_at, now), false)
  assert.equal(C.stravaCacheExpired(rows[1].created_at, now), false)
  assert.equal(C.stravaCacheExpired(rows[2].created_at, now), true)
  assert.deepEqual(C.purgeStravaCache(rows, now).map(r => r.id), ['fresh', 'edge'])
})
