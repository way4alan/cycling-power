// 與 lib/challenges.js 同一套門檻。只留下完成項目，不保存原始軌跡。
// 這份資料不會送去任何 AI。

const HOUR = 3600
const EARTH = 6371000

export type Point = { lat: number; lng: number; ele?: number | null }
export type Place = { lat: number | null; lng: number | null; radiusM: number }
export type ActivityView = {
  sport?: string
  points: Point[]
  distanceKm: number
  elevationGainM: number
  maxEle: number
  elapsedSec: number
  localDate?: string
  localTime?: string
  startedAt?: string
}
export type RideWindow = { id?: string; date?: string; time?: string; title?: string; track?: { lat: number; lng?: number; lon?: number }[] }

export const PLACES: Record<string, Place> = {
  wuling: { lat: 24.136889, lng: 121.277111, radiusM: 300 },
  puliMonument: { lat: 23.973837, lng: 120.97969, radiusM: 500 },
  alishanShouzhen: { lat: 23.517635, lng: 120.810678, radiusM: 400 },
  alishanPark: { lat: 23.508423, lng: 120.801112, radiusM: 400 },
  tataka: { lat: 23.487556, lng: 120.891722, radiusM: 400 },
  taiping: { lat: 24.497724, lng: 121.5350318, radiusM: 500 },
  jianqing: { lat: 24.502297, lng: 121.525294, radiusM: 500 },
  shanlinxi: { lat: 23.636667, lng: 120.796417, radiusM: 400 },
  liulongtou: { lat: 23.6551935, lng: 120.7879628, radiusM: 400 },
  bali: { lat: 25.143745, lng: 121.396088, radiusM: 500 },
  pingshanSchool: { lat: 22.694429, lng: 120.301663, radiusM: 500 },
  worldGames: { lat: 22.702854, lng: 120.293633, radiusM: 600 },
  fugui: { lat: 25.298, lng: 121.537, radiusM: 800 },
  fenglinBridge: { lat: null, lng: null, radiusM: 400 },
  eluanbi: { lat: 21.9022, lng: 120.8528, radiusM: 1000 },
  haishanCamp: { lat: null, lng: null, radiusM: 500 },
  shouka: { lat: 22.245239, lng: 120.835549, radiusM: 800 },
  xiaoxueshanLodge: { lat: 24.282771, lng: 121.027483, radiusM: 400 },
  yakouTunnel: { lat: 23.2655622, lng: 120.9552683, radiusM: 400 },
  yakouEast: { lat: 23.2640577, lng: 120.9608922, radiusM: 400 },
  roundNorth: { lat: 25.298, lng: 121.537, radiusM: 5000 },
  roundWest: { lat: 24.079676, lng: 120.554091, radiusM: 6000 },
  roundEast: { lat: 23.993951, lng: 121.60093, radiusM: 5000 },
}

function toRad(n: number) { return n * Math.PI / 180 }
function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH * Math.asin(Math.min(1, Math.sqrt(s)))
}
function visited(points: Point[], place: Place) {
  if (place.lat == null || place.lng == null) return false
  return points.some((p) => haversineM(p, { lat: place.lat as number, lng: place.lng as number }) <= place.radiusM)
}
function blocked(sport?: string) {
  return sport === 'VirtualRide' || sport === 'Run' || sport === 'Swim'
}
function climb(activity: ActivityView, place: Place, minEle: number, minGain: number) {
  if (blocked(activity.sport) || place.lat == null) return false
  if (!visited(activity.points, place)) return false
  return activity.maxEle >= minEle && activity.elevationGainM >= minGain
}
function climbAny(activity: ActivityView, places: Place[], minEle: number, minGain: number) {
  return places.some((place) => climb(activity, place, minEle, minGain))
}
function visitedAny(points: Point[], places: Place[]) {
  return places.some((place) => visited(points, place))
}
export function westTier(elapsedSec: number) {
  if (!(elapsedSec >= 0)) return null
  if (elapsedSec < 2 * HOUR) return 'sub2'
  if (elapsedSec < 3 * HOUR) return 'sub3'
  if (elapsedSec < 4 * HOUR) return 'sub4'
  return 'finisher'
}
export function detectActivity(activity: ActivityView) {
  const out: { key: string; tier: string }[] = []
  if (!activity || blocked(activity.sport)) return out
  const points = activity.points || []
  if (climb(activity, PLACES.wuling, 3200, 1500)) out.push({ key: 'wuling', tier: '' })
  if (climbAny(activity, [PLACES.alishanShouzhen, PLACES.alishanPark], 2050, 1500)) out.push({ key: 'alishan', tier: '' })
  if (climb(activity, PLACES.tataka, 2500, 1800)) out.push({ key: 'tatajia', tier: '' })
  if (climb(activity, PLACES.xiaoxueshanLodge, 2500, 1400)) out.push({ key: 'dasyueshan', tier: '' })
  if (climbAny(activity, [PLACES.yakouTunnel, PLACES.yakouEast], 2650, 1500)) out.push({ key: 'yakou', tier: '' })
  if (climbAny(activity, [PLACES.taiping, PLACES.jianqing], 1850, 1400)) out.push({ key: 'taipingshan', tier: '' })
  if (climbAny(activity, [PLACES.shanlinxi, PLACES.liulongtou], 1550, 1200)) out.push({ key: 'shanlinxi', tier: '' })
  if (visited(points, PLACES.bali) && visitedAny(points, [PLACES.pingshanSchool, PLACES.worldGames]) && activity.distanceKm >= 340 && activity.elapsedSec <= 24 * HOUR) {
    out.push({ key: 'north_south', tier: '' })
  }
  if (visitedAny(points, [PLACES.fugui, PLACES.fenglinBridge]) && visitedAny(points, [PLACES.eluanbi, PLACES.haishanCamp]) && activity.distanceKm >= 500 && activity.elapsedSec <= 32 * HOUR) {
    out.push({ key: 'twin_towers', tier: '' })
  }
  const southOk = visitedAny(points, [PLACES.eluanbi, PLACES.shouka])
  if (visited(points, PLACES.roundNorth) && visited(points, PLACES.roundWest) && southOk && visited(points, PLACES.roundEast) && activity.distanceKm >= 900) {
    out.push({ key: 'round_island', tier: '' })
  }
  if (visited(points, PLACES.puliMonument) && visited(points, PLACES.wuling) && activity.maxEle >= 3200 && activity.elevationGainM >= 1500) {
    const tier = westTier(activity.elapsedSec)
    if (tier) out.push({ key: 'west_wuling', tier })
  }
  return out
}

export function decodePolyline(encoded: string): Point[] {
  const points: Point[] = []
  let index = 0
  let lat = 0
  let lng = 0
  while (index < encoded.length) {
    let shift = 0
    let result = 0
    let byte = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index <= encoded.length)
    lat += (result & 1) ? ~(result >> 1) : (result >> 1)
    shift = 0
    result = 0
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20 && index <= encoded.length)
    lng += (result & 1) ? ~(result >> 1) : (result >> 1)
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points
}

export function viewFromStrava(activity: {
  sport_type?: string
  type?: string
  distance?: number
  total_elevation_gain?: number
  elev_high?: number
  elapsed_time?: number
  start_date_local?: string
  map?: { summary_polyline?: string }
}): ActivityView {
  const local = String(activity.start_date_local || '')
  return {
    sport: activity.sport_type || activity.type || '',
    points: activity.map?.summary_polyline ? decodePolyline(activity.map.summary_polyline) : [],
    distanceKm: Number(activity.distance || 0) / 1000,
    elevationGainM: Number(activity.total_elevation_gain || 0),
    maxEle: Number(activity.elev_high || 0),
    elapsedSec: Number(activity.elapsed_time || 0),
    localDate: local.slice(0, 10),
    localTime: local.slice(11, 16),
    startedAt: local,
  }
}

function minutesOf(value?: string) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''))
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}
export function matchGroupRide(activity: ActivityView, ride: RideWindow) {
  if (!activity || !ride || blocked(activity.sport)) return false
  if (String(activity.localDate || '') !== String(ride.date || '')) return false
  const startMin = minutesOf(activity.localTime)
  const rideMin = minutesOf(ride.time)
  if (startMin == null || rideMin == null || Math.abs(startMin - rideMin) > 240) return false
  const track = ride.track || []
  const points = activity.points || []
  if (!track.length || !points.length) return false
  const near = track.filter((tp) => {
    const spot = { lat: Number(tp.lat), lng: Number(tp.lng != null ? tp.lng : tp.lon) }
    return points.some((p) => haversineM(p, spot) <= 400)
  }).length
  return near / track.length >= 0.3
}
