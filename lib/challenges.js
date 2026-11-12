/* Personal summit rules. No network. Does not keep Strava tracks. */
;(function (root) {
  var EARTH_M = 6371000
  var HOUR = 3600
  function toRad(n) { return n * Math.PI / 180 }
  function haversineM(a, b) {
    var dLat = toRad(b.lat - a.lat)
    var dLng = toRad(b.lng - a.lng)
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
    return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(s)))
  }
  function visited(points, place) {
    if (!place || place.lat == null || place.lng == null) return false
    return (points || []).some(function (p) {
      return haversineM(p, place) <= place.radiusM
    })
  }
  function maxEle(points) {
    return (points || []).reduce(function (m, p) {
      return p.ele == null ? m : Math.max(m, Number(p.ele))
    }, -Infinity)
  }
  function elevationGain(points) {
    var gain = 0
    var prev = null
    ;(points || []).forEach(function (p) {
      if (p.ele == null) return
      if (prev != null && p.ele > prev) gain += p.ele - prev
      prev = p.ele
    })
    return gain
  }
  /* Verified points keep a source. Unverified finishes stay null and never match. */
  var PLACES = {
    wuling: { lat: 24.136889, lng: 121.277111, radiusM: 300, verified: true, source: 'https://zh.wikipedia.org/wiki/%E6%AD%A6%E5%B6%BA' },
    puliMonument: { lat: 23.973837, lng: 120.97969, radiusM: 500, verified: true, source: 'https://www.tad.gov.tw/m1.aspx?id=644&sNo=0001016' },
    alishanShouzhen: { lat: 23.517635, lng: 120.810678, radiusM: 400, verified: true, source: 'https://zh.wikipedia.org/wiki/%E9%98%BF%E9%87%8C%E5%B1%B1%E5%8F%97%E9%8E%AE%E5%AE%AE' },
    alishanGate: { lat: null, lng: null, radiusM: 400, verified: false },
    tataka: { lat: 23.487556, lng: 120.891722, radiusM: 400, verified: true, source: 'https://en.wikipedia.org/wiki/Tataka_Visitor_Center' },
    dasyueshanPark: { lat: 24.244806, lng: 120.975, radiusM: 400, verified: true, source: 'https://zh.wikipedia.org/zh-hant/%E5%A4%A7%E9%9B%AA%E5%B1%B1%E5%9C%8B%E5%AE%B6%E6%A3%AE%E6%9E%97%E9%81%8A%E6%A8%82%E5%8D%80' },
    xiaoxueshanLodge: { lat: null, lng: null, radiusM: 400, verified: false },
    yakouSaddle: { lat: 23.26448, lng: 120.95811, radiusM: 1000, verified: true, source: 'https://zh.wikipedia.org/zh-hant/%E5%9F%A1%E5%8F%A3_(%E5%8D%97%E6%A9%AB%E5%85%AC%E8%B7%AF)' },
    yakouTunnel: { lat: null, lng: null, radiusM: 400, verified: false },
    taiping: { lat: 24.497724, lng: 121.5350318, radiusM: 500, verified: true, source: 'https://zh.wikipedia.org/zh-tw/%E5%A4%AA%E5%B9%B3%E5%B1%B1%E5%9C%8B%E5%AE%B6%E6%A3%AE%E6%9E%97%E9%81%8A%E6%A8%82%E5%8D%80' },
    shanlinxi: { lat: 23.636667, lng: 120.796417, radiusM: 400, verified: true, source: 'https://en.wikipedia.org/wiki/Shanlinxi_Forest_Recreation_Area' },
    liulongtou: { lat: null, lng: null, radiusM: 300, verified: false },
    bali: { lat: 25.143745, lng: 121.396088, radiusM: 500, verified: true, source: 'https://zh.wikipedia.org/zh-tw/%E5%85%AB%E9%87%8C%E6%BC%A2%E6%B0%91%E7%A5%A0' },
    pingshanSchool: { lat: null, lng: null, radiusM: 500, verified: false },
    fugui: { lat: 25.298, lng: 121.537, radiusM: 800, verified: true, source: 'https://zh.wikipedia.org/zh-tw/%E5%AF%8C%E8%B2%B4%E8%A7%92%E7%87%88%E5%A1%94' },
    fenglinBridge: { lat: null, lng: null, radiusM: 400, verified: false },
    eluanbi: { lat: 21.9022, lng: 120.8528, radiusM: 1000, verified: true, source: 'https://zh.wikipedia.org/zh-tw/%E9%B5%9D%E9%91%BE%E9%BC%BB%E7%87%88%E5%A1%94' },
    haishanCamp: { lat: null, lng: null, radiusM: 500, verified: false },
    shouka: { lat: 22.245239, lng: 120.835549, radiusM: 800, verified: true, source: 'https://zh.wikipedia.org/wiki/%E5%A3%BD%E5%B3%A0' },
    roundNorth: { lat: null, lng: null, radiusM: 25000, verified: false },
    roundWest: { lat: null, lng: null, radiusM: 25000, verified: false },
    roundSouth: { lat: null, lng: null, radiusM: 25000, verified: false },
    roundEast: { lat: null, lng: null, radiusM: 25000, verified: false }
  }
  var BADGES = {
    wuling: { name: '武嶺', kind: 'climb' },
    alishan: { name: '阿里山', kind: 'climb' },
    tatajia: { name: '塔塔加', kind: 'climb' },
    dasyueshan: { name: '大雪山', kind: 'climb' },
    yakou: { name: '南橫埡口', kind: 'climb' },
    taipingshan: { name: '太平山', kind: 'climb' },
    shanlinxi: { name: '杉林溪', kind: 'climb' },
    north_south: { name: '一日北高', kind: 'endurance' },
    twin_towers: { name: '一日雙塔', kind: 'endurance' },
    round_island: { name: '環島', kind: 'endurance' },
    west_wuling: { name: '西進武嶺', kind: 'timed', tiers: ['sub2', 'sub3', 'sub4', 'finisher'] }
  }
  var TIER_RANK = { finisher: 1, sub4: 2, sub3: 3, sub2: 4 }
  function blockedSport(sport) {
    return sport === 'VirtualRide' || sport === 'Run' || sport === 'Swim'
  }
  function climb(activity, place, minEle, minGain) {
    if (blockedSport(activity.sport)) return null
    if (!place || place.lat == null) return null
    var points = activity.points || []
    var ele = activity.maxEle != null ? activity.maxEle : maxEle(points)
    var gain = activity.elevationGainM != null ? activity.elevationGainM : elevationGain(points)
    if (!visited(points, place)) return null
    if (!(ele >= minEle) || !(gain >= minGain)) return null
    return { ok: true }
  }
  function westTier(elapsedSec) {
    if (!(elapsedSec >= 0)) return null
    if (elapsedSec < 2 * HOUR) return 'sub2'
    if (elapsedSec < 3 * HOUR) return 'sub3'
    if (elapsedSec < 4 * HOUR) return 'sub4'
    return 'finisher'
  }
  function higherTier(current, next) {
    if (!next) return current || null
    if (!current) return next
    return (TIER_RANK[next] || 0) > (TIER_RANK[current] || 0) ? next : current
  }
  function detect(activity) {
    var out = []
    if (!activity || blockedSport(activity.sport)) return out
    var points = activity.points || []
    if (climb(activity, PLACES.wuling, 3200, 1500)) out.push({ key: 'wuling', tier: '' })
    if (climb(activity, PLACES.alishanShouzhen, 2050, 1500)) out.push({ key: 'alishan', tier: '' })
    if (climb(activity, PLACES.tataka, 2500, 1800)) out.push({ key: 'tatajia', tier: '' })
    if (PLACES.xiaoxueshanLodge.lat != null && climb(activity, PLACES.xiaoxueshanLodge, 2500, 1400)) out.push({ key: 'dasyueshan', tier: '' })
    if (PLACES.yakouTunnel.lat != null && climb(activity, PLACES.yakouTunnel, 2650, 1500)) out.push({ key: 'yakou', tier: '' })
    if (climb(activity, PLACES.taiping, 1850, 1400)) out.push({ key: 'taipingshan', tier: '' })
    if (climb(activity, PLACES.shanlinxi, 1550, 1200)) out.push({ key: 'shanlinxi', tier: '' })
    if (PLACES.pingshanSchool.lat != null && visited(points, PLACES.bali) && visited(points, PLACES.pingshanSchool) && activity.distanceKm >= 340 && activity.elapsedSec <= 24 * HOUR) {
      out.push({ key: 'north_south', tier: '' })
    }
    if (visited(points, PLACES.fugui) && visited(points, PLACES.eluanbi) && activity.distanceKm >= 500 && activity.elapsedSec <= 32 * HOUR) {
      out.push({ key: 'twin_towers', tier: '' })
    }
    var tier = null
    if (visited(points, PLACES.puliMonument) && visited(points, PLACES.wuling)) {
      var ele = activity.maxEle != null ? activity.maxEle : maxEle(points)
      var gain = activity.elevationGainM != null ? activity.elevationGainM : elevationGain(points)
      if (ele >= 3200 && gain >= 1500) tier = westTier(activity.elapsedSec)
    }
    if (tier) out.push({ key: 'west_wuling', tier: tier })
    var loop = roundIsland([activity])
    if (loop) out.push(loop)
    return out
  }
  function roundIsland(parts, gates) {
    var g = gates || {
      north: PLACES.roundNorth,
      west: PLACES.roundWest,
      south: PLACES.roundSouth,
      east: PLACES.roundEast
    }
    var keys = ['north', 'west', 'south', 'east']
    if (keys.some(function (k) { return !g[k] || g[k].lat == null || g[k].lng == null })) return null
    var list = (parts || []).filter(function (a) { return a && !blockedSport(a.sport) })
    if (!list.length) return null
    var times = list.map(function (a) { return Date.parse(a.startedAt) })
    if (times.some(function (n) { return !Number.isFinite(n) })) return null
    var span = Math.max.apply(null, times) - Math.min.apply(null, times)
    if (span > 14 * 24 * HOUR * 1000) return null
    var km = list.reduce(function (s, a) { return s + Number(a.distanceKm || 0) }, 0)
    if (!(km >= 900)) return null
    var points = []
    list.forEach(function (a) { points = points.concat(a.points || []) })
    if (!keys.every(function (k) { return visited(points, g[k]) })) return null
    return { key: 'round_island', tier: '' }
  }
  function minutesOf(value) {
    var m = /^(\d{1,2}):(\d{2})/.exec(String(value || ''))
    if (!m) return null
    return Number(m[1]) * 60 + Number(m[2])
  }
  function matchGroupRide(activity, ride) {
    if (!activity || !ride || blockedSport(activity.sport)) return false
    if (String(activity.localDate || '') !== String(ride.date || '')) return false
    var startMin = minutesOf(activity.localTime)
    var rideMin = minutesOf(ride.time)
    if (startMin == null || rideMin == null || Math.abs(startMin - rideMin) > 240) return false
    var track = ride.track || []
    var points = activity.points || []
    if (!track.length || !points.length) return false
    var near = track.filter(function (tp) {
      var spot = { lat: Number(tp.lat), lng: Number(tp.lng != null ? tp.lng : tp.lon) }
      return points.some(function (p) { return haversineM(p, spot) <= 400 })
    }).length
    return near / track.length >= 0.3
  }
  function historyOffers(found) {
    return (found || []).filter(function (b) {
      var spec = BADGES[b.key]
      return !!(spec && spec.kind !== 'team')
    })
  }
  function mergeBadges(owned, incoming) {
    var map = {}
    function put(b) {
      if (!b || !BADGES[b.key]) return
      var prev = map[b.key]
      var row = { key: b.key, tier: b.tier || '', earned_on: b.earned_on || '' }
      if (!prev) { map[b.key] = row; return }
      if (b.key === 'west_wuling' && higherTier(prev.tier, row.tier) === row.tier && row.tier !== prev.tier) map[b.key] = row
    }
    ;(owned || []).forEach(put)
    ;(incoming || []).forEach(put)
    return Object.keys(map).map(function (key) { return map[key] })
  }
  function applyBadgeDecision(owned, prompt, accept) {
    var list = (owned || []).map(function (b) { return { key: b.key, tier: b.tier || '', earned_on: b.earned_on || '' } })
    if (!accept || !prompt) return list
    if (prompt.historical && !historyOffers([prompt]).length) return list
    if (prompt.kind === 'team') return list
    return mergeBadges(list, [prompt])
  }
  function applyFtpDecision(current, proposed, accept) {
    if (!accept) return current
    var n = Number(proposed)
    if (!(n > 0) || n > 2000) return current
    return Math.round(n)
  }
  function applyCheckinDecision(rows, prompt, accept) {
    var list = (rows || []).slice()
    if (!accept || !prompt || !prompt.ride_id || !prompt.line_user_id) return list
    if (list.some(function (r) { return r.ride_id === prompt.ride_id && r.line_user_id === prompt.line_user_id })) return list
    list.push({ ride_id: prompt.ride_id, line_user_id: prompt.line_user_id, name: prompt.name || '' })
    return list
  }
  function keepBest(badges) {
    var map = {}
    ;(badges || []).forEach(function (b) {
      if (!map[b.key]) map[b.key] = b.tier || ''
      else if (b.key === 'west_wuling') map[b.key] = higherTier(map[b.key], b.tier)
    })
    return Object.keys(map).map(function (key) { return { key: key, tier: map[key] } })
  }
  function stravaCacheExpired(iso, now, days) {
    var limit = (days == null ? 7 : days) * 86400000
    var then = Date.parse(iso)
    var clock = Date.parse(now)
    if (!Number.isFinite(then) || !Number.isFinite(clock)) return false
    return clock - then > limit
  }
  function purgeStravaCache(rows, now) {
    return (rows || []).filter(function (row) { return !stravaCacheExpired(row.created_at || row.cached_at, now) })
  }
  root.PaceChallenges = {
    PLACES: PLACES,
    BADGES: BADGES,
    haversineM: haversineM,
    westTier: westTier,
    higherTier: higherTier,
    detect: detect,
    roundIsland: roundIsland,
    matchGroupRide: matchGroupRide,
    historyOffers: historyOffers,
    mergeBadges: mergeBadges,
    applyBadgeDecision: applyBadgeDecision,
    applyFtpDecision: applyFtpDecision,
    applyCheckinDecision: applyCheckinDecision,
    keepBest: keepBest,
    stravaCacheExpired: stravaCacheExpired,
    purgeStravaCache: purgeStravaCache
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
