/* PACE participation rules. Classic script: sets globalThis.PaceCore. No network, no DOM. */
;(function (root) {
  var PODIUM_WINDOW_DAYS = 56
  var PODIUM_MIN_RIDES = 2
  var PODIUM_RULE = '頒獎台：近 56 天（含今天，台北時間）已結束且未取消的團騎，實際出席滿 2 次，再依 W/kg 取前三。同一場只算一次。報名、累計出席次數、最後上線都不算。不足 3 人就留空，不遞補。W/kg 相同時依姓名排列。'
  var MONTHLY_RULE = '本月出席：台北時間這個月、已結束且未取消的團騎，同一人同一場只算一次。次數相同並列，下一名次跳過。已取消與尚未騎完的不算。'

  function cleanText(value, max) {
    var text = String(value == null ? '' : value).replace(/[\u0000-\u001F\u007F]/g, '').trim()
    if (max && text.length > max) text = text.slice(0, max)
    return text
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
    })
  }

  function finiteOrNull(value) {
    if (value == null || value === '') return null
    var n = Number(value)
    return Number.isFinite(n) ? n : null
  }

  function positiveInt(value) {
    var n = parseInt(value, 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  function parseISODate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim())
    if (!m) return null
    var y = Number(m[1])
    var mo = Number(m[2])
    var d = Number(m[3])
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    var dt = new Date(Date.UTC(y, mo - 1, d))
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
    return { y: y, m: mo, d: d }
  }

  function formatISODate(parts) {
    var mo = String(parts.m).padStart(2, '0')
    var d = String(parts.d).padStart(2, '0')
    return parts.y + '-' + mo + '-' + d
  }

  function shiftISODate(iso, days) {
    var p = parseISODate(iso)
    if (!p) return ''
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d))
    dt.setUTCDate(dt.getUTCDate() + days)
    return dt.toISOString().slice(0, 10)
  }

  function daysBetween(later, earlier) {
    var a = parseISODate(later)
    var b = parseISODate(earlier)
    if (!a || !b) return null
    var ms = Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)
    return Math.round(ms / 86400000)
  }

  function taipeiDate(date) {
    var d = date instanceof Date ? date : new Date(date)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Taipei',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d)
  }

  function weekdayZh(iso) {
    var p = parseISODate(iso)
    if (!p) return ''
    var dt = new Date(Date.UTC(p.y, p.m - 1, p.d))
    return '日一二三四五六'[dt.getUTCDay()]
  }

  function formatZhDate(iso) {
    var p = parseISODate(iso)
    if (!p) return ''
    return p.y + '年' + p.m + '月' + p.d + '日（' + weekdayZh(iso) + '）'
  }

  function cleanTime(value) {
    var text = String(value || '').trim()
    var m = /^(\d{2}):(\d{2})/.exec(text)
    if (!m) return ''
    var h = Number(m[1])
    var min = Number(m[2])
    if (h > 23 || min > 59) return ''
    return m[1] + ':' + m[2]
  }

  function isCompletedRide(ride, today) {
    if (!ride || ride.cancelled === true) return false
    if (ride.is_finished !== true) return false
    var delta = daysBetween(today, ride.date)
    return delta != null && delta >= 0
  }

  function inRecentWindow(date, today, windowDays) {
    var delta = daysBetween(today, date)
    return delta != null && delta >= 0 && delta <= windowDays
  }

  function resolveRider(att, riders) {
    var list = riders || []
    for (var i = 0; i < list.length; i++) {
      var r = list[i]
      if (att.rider_id && r.id === att.rider_id) return r
      if (att.line_user_id && r.line_user_id && r.line_user_id === att.line_user_id) return r
    }
    return null
  }

  function dedupedAttendance(input) {
    var today = input.today
    var rides = input.rides || []
    var rideById = new Map()
    rides.forEach(function (ride) { rideById.set(ride.id, ride) })
    var seen = new Set()
    var rows = []
    ;(input.attendances || []).forEach(function (att) {
      var ride = rideById.get(att.ride_id)
      if (!isCompletedRide(ride, today)) return
      var rider = resolveRider(att, input.riders)
      if (!rider || rider.status !== 'approved') return
      var key = rider.id + '|' + att.ride_id
      if (seen.has(key)) return
      seen.add(key)
      rows.push({
        riderId: rider.id,
        name: rider.name || '',
        rideId: att.ride_id,
        date: String(ride.date),
        ftp: Number(rider.ftp),
        weight: Number(rider.weight)
      })
    })
    return rows
  }

  function wkgOf(rider) {
    return Number(rider.ftp) / Number(rider.weight)
  }

  function countByRider(rows, pred) {
    var map = new Map()
    rows.forEach(function (row) {
      if (pred && !pred(row)) return
      var cur = map.get(row.riderId) || { riderId: row.riderId, name: row.name, count: 0, ftp: row.ftp, weight: row.weight }
      cur.count += 1
      cur.name = row.name || cur.name
      map.set(row.riderId, cur)
    })
    return map
  }

  function podium(input) {
    var today = input.today
    var windowDays = input.windowDays == null ? PODIUM_WINDOW_DAYS : input.windowDays
    var minRides = input.minRides == null ? PODIUM_MIN_RIDES : input.minRides
    var rows = dedupedAttendance(input).filter(function (row) {
      return inRecentWindow(row.date, today, windowDays) && row.ftp > 0 && row.weight > 0
    })
    var counts = countByRider(rows)
    var riders = (input.riders || []).filter(function (r) {
      return r.status === 'approved' && Number(r.ftp) > 0 && Number(r.weight) > 0 && (counts.get(r.id) || { count: 0 }).count >= minRides
    })
    riders.sort(function (a, b) {
      var diff = wkgOf(b) - wkgOf(a)
      if (diff) return diff
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant')
    })
    var countMap = {}
    counts.forEach(function (v, k) { countMap[k] = v.count })
    return {
      today: today,
      windowDays: windowDays,
      minRides: minRides,
      windowStart: shiftISODate(today, -windowDays),
      rule: PODIUM_RULE,
      counts: countMap,
      eligible: riders,
      top: riders.slice(0, 3),
      emptySlots: Math.max(0, 3 - Math.min(3, riders.length))
    }
  }

  function monthlyBoard(input) {
    var today = input.today
    var month = String(today || '').slice(0, 7)
    var rows = dedupedAttendance(input).filter(function (row) { return row.date.slice(0, 7) === month })
    var counts = countByRider(rows)
    var list = Array.from(counts.values()).filter(function (row) { return row.count > 0 })
    list.sort(function (a, b) {
      if (b.count !== a.count) return b.count - a.count
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant')
    })
    var ranked = []
    list.forEach(function (row, i) {
      var rank = i + 1
      if (i > 0 && row.count === list[i - 1].count) rank = ranked[i - 1].rank
      ranked.push({ riderId: row.riderId, name: row.name, count: row.count, rank: rank })
    })
    return { today: today, month: month, rule: MONTHLY_RULE, rows: ranked }
  }

  function safeHttpUrl(value) {
    var raw = cleanText(value, 2000)
    if (!raw) return ''
    if (raw.indexOf('@') !== -1) return ''
    var u
    try { u = new URL(raw) } catch (e) { return '' }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return ''
    if (u.username || u.password) return ''
    if (u.href.indexOf('@') !== -1) return ''
    return u.origin + u.pathname + u.search
  }

  function normalizeGarminUrl(input) {
    var original = safeHttpUrl(input)
    if (!original) {
      var raw = cleanText(input, 2000)
      if (!raw) return { ok: false, reason: 'empty' }
      if (String(input || '').indexOf('@') !== -1) return { ok: false, reason: 'credentials' }
      try {
        var probe = new URL(raw)
        if (probe.protocol !== 'http:' && probe.protocol !== 'https:') return { ok: false, reason: 'protocol' }
      } catch (e) { return { ok: false, reason: 'invalid' } }
      return { ok: false, reason: 'rejected' }
    }
    var url = new URL(original)
    var host = url.hostname.toLowerCase()
    var recognized = host === 'connect.garmin.com'
    var courseId = null
    if (recognized) {
      var parts = url.pathname.split('/').filter(Boolean)
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].toLowerCase() !== 'course') continue
        var next = parts[i + 1] || ''
        if (/^\d{3,20}$/.test(next)) courseId = next
        if (next.toLowerCase() === 'embed' && /^\d{3,20}$/.test(parts[i + 2] || '')) courseId = parts[i + 2]
      }
    }
    return {
      ok: true,
      recognized: !!(recognized && courseId),
      courseId: courseId,
      canonical: courseId ? 'https://connect.garmin.com/modern/course/' + courseId : '',
      original: original
    }
  }

  function findRouteByCourseId(routes, courseId) {
    if (!courseId) return null
    var list = routes || []
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].garmin_course_id || '') === String(courseId)) return list[i]
    }
    return null
  }

  function uuidOrNull(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || '')) ? String(value) : null
  }

  function copyGroups(groups) {
    return (groups || []).map(function (g, i) {
      return {
        name: cleanText(g.name, 40),
        pace_note: cleanText(g.pace_note, 200),
        sort_order: Number.isFinite(Number(g.sort_order)) ? Number(g.sort_order) : i
      }
    }).filter(function (g) { return g.name })
  }

  function rideDraftFromSource(source, groups) {
    var src = source || {}
    return {
      title: cleanText(src.title, 120),
      time: cleanTime(src.time),
      time2: cleanTime(src.time2),
      location: cleanText(src.location, 200),
      location2: cleanText(src.location2, 200),
      note: cleanText(src.note, 500),
      strava_url: safeHttpUrl(src.strava_url),
      garmin_url: safeHttpUrl(src.garmin_url),
      pace_note: cleanText(src.pace_note, 300),
      distance_km: finiteOrNull(src.distance_km),
      ascent_m: finiteOrNull(src.ascent_m),
      distance_estimated: src.distance_estimated === true,
      ascent_estimated: src.ascent_estimated === true,
      route_id: uuidOrNull(src.route_id),
      max_participants: positiveInt(src.max_participants),
      weather_lat: finiteOrNull(src.weather_lat),
      weather_lng: finiteOrNull(src.weather_lng),
      weather_location_name: cleanText(src.weather_location_name, 80),
      groups: copyGroups(groups)
    }
  }

  function draftFromTemplate(template, groups) {
    return rideDraftFromSource(template, groups)
  }

  function applyTemplate(template, groups) {
    return { published: false, persisted: false, draft: draftFromTemplate(template, groups) }
  }

  function sourceKey(kind, id, date) {
    if (kind !== 'ride' && kind !== 'template') return null
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(id || ''))) return null
    if (!parseISODate(date)) return null
    return kind + ':' + id + ':' + date
  }

  function buildRideInsert(draft, opts) {
    var options = opts || {}
    var code = cleanText(options.garminCode, 40)
    var payload = {
      title: draft.title || '',
      date: options.date || '',
      time: draft.time || '',
      time2: draft.time2 || '',
      location: draft.location || '',
      location2: draft.location2 || '',
      note: draft.note || '',
      strava_url: draft.strava_url || '',
      garmin_url: draft.garmin_url || '',
      garmin_code: code,
      pace_note: draft.pace_note || '',
      distance_km: draft.distance_km,
      ascent_m: draft.ascent_m,
      distance_estimated: draft.distance_estimated === true,
      ascent_estimated: draft.ascent_estimated === true,
      route_id: draft.route_id || null,
      max_participants: draft.max_participants,
      weather_lat: draft.weather_lat,
      weather_lng: draft.weather_lng,
      weather_location_name: draft.weather_location_name || '',
      is_finished: false,
      cancelled: false,
      source_key: options.sourceKey || null
    }
    return payload
  }

  function previewCopies(items) {
    var seen = new Set()
    var out = (items || []).map(function (item, index) {
      var blockers = []
      var date = String(item.date || '').trim()
      if (!date) blockers.push('缺少新日期')
      else if (!parseISODate(date)) blockers.push('日期格式不正確')
      var draft = item.draft || rideDraftFromSource(item.source, item.groups)
      if (!draft.title) blockers.push('缺少標題')
      if (!draft.location) blockers.push('缺少集合點')
      if (!draft.time) blockers.push('缺少集合時間')
      var key = sourceKey(item.sourceKind, item.sourceId, date)
      if (key && seen.has(key)) blockers.push('這批裡有相同來源與日期')
      if (key) seen.add(key)
      var payload = blockers.length ? null : buildRideInsert(draft, {
        date: date,
        garminCode: item.garminCode,
        sourceKey: key
      })
      if (payload && Object.prototype.hasOwnProperty.call(payload, 'id')) blockers.push('不可沿用舊編號')
      return {
        index: index,
        key: item.key || String(index),
        blockers: blockers,
        payload: blockers.length ? null : payload,
        groups: draft.groups || [],
        sourceKey: key,
        registrationCount: 0,
        attendanceCount: 0
      }
    })
    return { items: out }
  }

  async function publishCopies(items, insertRide, options) {
    var opts = options || {}
    if (opts.locked) {
      return {
        ok: false,
        reason: 'busy',
        results: (items || []).map(function (item, i) { return { key: item.key || String(i), status: 'skipped' } })
      }
    }
    var preview = previewCopies(items)
    var results = []
    for (var i = 0; i < preview.items.length; i++) {
      var view = preview.items[i]
      if (view.blockers.length) {
        results.push({ key: view.key, status: 'blocked', blockers: view.blockers })
        continue
      }
      var res
      try {
        res = await insertRide({ payload: view.payload, groups: view.groups, sourceKey: view.sourceKey })
      } catch (e) {
        results.push({ key: view.key, status: 'failed' })
        continue
      }
      if (!res || res.error) {
        results.push({ key: view.key, status: res && (res.duplicate || res.code === '23505') ? 'duplicate' : 'failed' })
        continue
      }
      results.push({ key: view.key, status: 'published', id: res.id })
    }
    var published = results.filter(function (r) { return r.status === 'published' }).length
    return {
      ok: published > 0,
      partial: published > 0 && published < results.length,
      results: results
    }
  }

  function buildRegistration(input) {
    var row = { ride_id: input.rideId }
    if (!input.groupId) return { ok: true, row: row, grouped: false }
    if (!input.allowGroup) return { ok: false, reason: 'schema' }
    var match = null
    ;(input.groups || []).some(function (g) {
      if (g.id === input.groupId && g.ride_id === input.rideId) { match = g; return true }
      return false
    })
    if (!match) return { ok: false, reason: 'bad-group' }
    row.group_id = input.groupId
    return { ok: true, row: row, grouped: true }
  }

  function attrNum(attrs, name) {
    var re = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*["\']([+-]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][+-]?\\d+)?)["\']', 'i')
    var m = String(attrs || '').match(re)
    if (!m) return null
    var n = Number(m[1])
    return Number.isFinite(n) ? n : null
  }

  function haversineKm(points) {
    var R = 6371.0088
    var sum = 0
    for (var i = 1; i < points.length; i++) {
      var a = points[i - 1]
      var b = points[i]
      var dLat = (b.lat - a.lat) * Math.PI / 180
      var dLon = (b.lon - a.lon) * Math.PI / 180
      var la1 = a.lat * Math.PI / 180
      var la2 = b.lat * Math.PI / 180
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
      sum += 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
    }
    return Math.round(sum * 10) / 10
  }

  function estimateAscent(points) {
    var gain = 0
    var pairs = 0
    var prev = null
    points.forEach(function (p) {
      if (p.ele == null) { prev = null; return }
      if (prev != null) {
        var d = p.ele - prev
        if (d > 0) gain += d
        pairs += 1
      }
      prev = p.ele
    })
    if (!pairs) return { value: null, estimated: false, reason: 'no-elevation' }
    return { value: Math.round(gain), estimated: true, reason: 'sampled' }
  }

  function sampleTrack(points, max) {
    var limit = max || 400
    var chosen = points
    if (points.length > limit) {
      chosen = []
      var last = points.length - 1
      for (var i = 0; i < limit; i++) {
        chosen.push(points[Math.round(i * last / (limit - 1))])
      }
    }
    return chosen.map(function (p) {
      return {
        lat: Math.round(p.lat * 1e6) / 1e6,
        lon: Math.round(p.lon * 1e6) / 1e6,
        ele: p.ele == null ? null : Math.round(p.ele)
      }
    })
  }

  function parseGpx(text, opts) {
    var options = opts || {}
    var maxBytes = options.maxBytes || 1500000
    var raw = String(text == null ? '' : text)
    if (!raw.trim()) return { ok: false, reason: 'empty', message: 'GPX 是空的' }
    if (raw.length > maxBytes) return { ok: false, reason: 'oversized', message: 'GPX 超過大小上限，沒有讀取' }
    if (/<!DOCTYPE|<!ENTITY|<!ELEMENT|<!ATTLIST/i.test(raw) || /<\?xml-stylesheet/i.test(raw) || /xlink:href/i.test(raw) || /<\s*(?:[\w.-]+:)?include\b/i.test(raw)) {
      return { ok: false, reason: 'untrusted', message: '不接受含有文件型別、外部實體或外部參照的 GPX' }
    }
    var points = []
    var re = /<(?:[\w.-]+:)?(trkpt|rtept)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w.-]+:)?\1\s*>)/gi
    var m
    while ((m = re.exec(raw))) {
      var lat = attrNum(m[2], 'lat')
      var lon = attrNum(m[2], 'lon')
      if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180) continue
      var body = m[3] || ''
      var eleMatch = body.match(/<(?:[\w.-]+:)?ele>\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*<\/(?:[\w.-]+:)?ele>/i)
      var ele = eleMatch ? Number(eleMatch[1]) : null
      points.push({ lat: lat, lon: lon, ele: Number.isFinite(ele) ? ele : null })
      if (points.length > 20000) return { ok: false, reason: 'oversized', message: '軌跡點過多，沒有讀取' }
    }
    if (!points.length) return { ok: false, reason: 'no-points', message: '這份 GPX 沒有可讀的軌跡點' }
    var ascent = estimateAscent(points)
    return {
      ok: true,
      pointCount: points.length,
      points: sampleTrack(points, options.maxPoints || 400),
      distanceKm: haversineKm(points),
      distanceEstimated: true,
      ascentM: ascent.value,
      ascentEstimated: ascent.estimated,
      ascentReason: ascent.reason,
      message: ascent.reason === 'no-elevation' ? '這份 GPX 沒有高度，無法估算爬升' : '距離與爬升是依 GPX 座標估算，管理員可以改正'
    }
  }

  function trackSvg(points) {
    if (!points || points.length < 2) return ''
    var mid = points.reduce(function (s, p) { return s + p.lat }, 0) / points.length
    var cos = Math.cos(mid * Math.PI / 180) || 1
    var xs = points.map(function (p) { return p.lon * cos })
    var ys = points.map(function (p) { return p.lat })
    var minX = Math.min.apply(null, xs)
    var maxX = Math.max.apply(null, xs)
    var minY = Math.min.apply(null, ys)
    var maxY = Math.max.apply(null, ys)
    var spanX = Math.max(maxX - minX, 1e-9)
    var spanY = Math.max(maxY - minY, 1e-9)
    var W = 320
    var H = 180
    var pad = 14
    var coords = points.map(function (p, i) {
      var x = pad + ((xs[i] - minX) / spanX) * (W - pad * 2)
      var y = pad + (1 - (ys[i] - minY) / spanY) * (H - pad * 2)
      return x.toFixed(1) + ',' + y.toFixed(1)
    }).join(' ')
    return '<svg class="route-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="路線預覽"><polyline points="' + coords + '"></polyline></svg>'
  }

  function splitLocation(raw) {
    var text = cleanText(raw, 200)
    var parts = text.split('｜')
    if (parts.length > 1) return { name: parts[0], addr: parts.slice(1).join('｜') }
    return { name: text, addr: '' }
  }

  function safeToken(value) {
    return /^[A-Za-z0-9_-]{1,80}$/.test(String(value || ''))
  }

  function measureText(value) {
    var text = cleanText(value, 500)
    return text
  }

  function buildAnnouncement(ride, opts) {
    var options = opts || {}
    var title = cleanText(ride && ride.title, 120)
    if (!title) return { ok: false, reason: 'no-title' }
    var lines = ['【PACE 沛速車隊】' + title]
    if (ride.cancelled === true) lines.push('狀態：本場已取消')
    var dateText = formatZhDate(ride.date)
    if (dateText) lines.push('日期：' + dateText)
    var time = cleanTime(ride.time)
    var loc = splitLocation(ride.location)
    if (time || loc.name) {
      var meet = '集合：'
      if (time) meet += time
      if (loc.name) meet += (time ? ' ' : '') + loc.name
      lines.push(meet)
    }
    var time2 = cleanTime(ride.time2)
    var loc2 = splitLocation(ride.location2)
    if (loc2.name) lines.push('第二集合：' + (time2 ? time2 + ' ' : '') + loc2.name)
    if (ride.distance_km != null && ride.distance_km !== '' && Number.isFinite(Number(ride.distance_km))) {
      lines.push('距離：' + trimNum(ride.distance_km) + ' km' + (ride.distance_estimated ? '（估算）' : ''))
    }
    if (ride.ascent_m != null && ride.ascent_m !== '' && Number.isFinite(Number(ride.ascent_m))) {
      lines.push('爬升：' + trimNum(ride.ascent_m) + ' m' + (ride.ascent_estimated ? '（估算）' : ''))
    }
    var pace = measureText(ride.pace_note)
    if (pace) lines.push('配速說明：' + pace)
    ;(ride.groups || []).forEach(function (g) {
      var name = cleanText(g.name, 40)
      if (!name) return
      var note = cleanText(g.pace_note, 200)
      lines.push('組別：' + name + (note ? '（' + note + '）' : ''))
    })
    var note = measureText(ride.note)
    if (note) lines.push('備註：' + note)
    var course = safeHttpUrl(ride.garmin_url)
    if (course) lines.push('路線：' + course)
    var strava = safeHttpUrl(ride.strava_url)
    if (strava) lines.push('Strava：' + strava)
    var code = cleanText(ride.garmin_code, 40)
    if (code) lines.push('GroupRide 代碼：' + code + '（只屬於這一場，請在車錶自行加入）')
    var deep = ''
    var liffId = String(options.liffId || '')
    if (safeToken(liffId) && safeToken(ride.id)) {
      deep = 'https://liff.line.me/' + liffId + '?ride=' + encodeURIComponent(ride.id)
      lines.push('打開這一場：' + deep)
    }
    var text = lines.join('\n')
    var altText = text.length > 390 ? text.slice(0, 387) + '…' : text
    var body = [{ type: 'text', text: title, weight: 'bold', wrap: true }]
    lines.slice(1, 14).forEach(function (line) {
      body.push({ type: 'text', text: line, size: 'sm', wrap: true })
    })
    var buttons = []
    if (deep) buttons.push({ type: 'button', style: 'primary', action: { type: 'uri', label: '打開這一場', uri: deep } })
    if (course) buttons.push({ type: 'button', style: 'link', action: { type: 'uri', label: 'Garmin 路線', uri: course } })
    var flex = {
      type: 'flex',
      altText: altText,
      contents: {
        type: 'bubble',
        body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: body }
      }
    }
    if (buttons.length) {
      flex.contents.footer = { type: 'box', layout: 'vertical', spacing: 'sm', contents: buttons }
    }
    return { ok: true, text: text, altText: altText, flex: flex, deepLink: deep }
  }

  function trimNum(value) {
    var n = Number(value)
    if (!Number.isFinite(n)) return ''
    return String(Math.round(n * 10) / 10)
  }

  function shareAvailability(liff) {
    if (!liff || typeof liff.isApiAvailable !== 'function' || typeof liff.shareTargetPicker !== 'function') return 'unavailable'
    try {
      if (!liff.isApiAvailable('shareTargetPicker')) return 'unavailable'
    } catch (e) {
      return 'unavailable'
    }
    return 'ready'
  }

  async function runShare(liff, message) {
    if (shareAvailability(liff) !== 'ready') return { status: 'unavailable', sent: false }
    try {
      var result = await liff.shareTargetPicker([message], { isMultiple: true })
      if (!result || result.status !== 'success') return { status: 'cancelled', sent: false }
      return { status: 'sent', sent: true }
    } catch (e) {
      return { status: 'error', sent: false }
    }
  }

  function copyResult() {
    return { status: 'copied', sent: false }
  }

  function interpretRiderLookup(result) {
    var error = result && result.error
    if (error) {
      if (error.code === 'PGRST116') return { kind: 'new' }
      return { kind: 'error' }
    }
    if (!result || result.data == null) return { kind: 'new' }
    if (result.data.status === 'pending') return { kind: 'pending' }
    return { kind: 'member' }
  }

  function isMissingSchemaError(error) {
    if (!error) return false
    var code = String(error.code || '')
    var msg = String(error.message || '') + String(error.details || '') + String(error.hint || '')
    return code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST205' || /does not exist|schema cache|Could not find the/i.test(msg)
  }

  function nextUpcoming(rides, now) {
    var list = (rides || []).filter(function (ride) {
      return ride && ride.cancelled !== true && ride.is_finished !== true && ride.date
    })
    var future = list.filter(function (ride) {
      var t = rideStart(ride)
      return Number.isFinite(t) && t >= now
    }).sort(function (a, b) { return rideStart(a) - rideStart(b) })
    if (future.length) return future[0]
    var today = taipeiDate(new Date(now))
    var rest = list.filter(function (ride) { return String(ride.date) >= today }).sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date)) || String(a.time || '').localeCompare(String(b.time || ''))
    })
    return rest[0] || null
  }

  function rideStart(ride) {
    var date = String(ride.date || '')
    if (!parseISODate(date)) return NaN
    var time = cleanTime(ride.time) || '00:00'
    return new Date(date + 'T' + time + ':00+08:00').getTime()
  }

  root.PaceCore = {
    PODIUM_WINDOW_DAYS: PODIUM_WINDOW_DAYS,
    PODIUM_MIN_RIDES: PODIUM_MIN_RIDES,
    PODIUM_RULE: PODIUM_RULE,
    MONTHLY_RULE: MONTHLY_RULE,
    taipeiDate: taipeiDate,
    shiftISODate: shiftISODate,
    daysBetween: daysBetween,
    formatZhDate: formatZhDate,
    isCompletedRide: isCompletedRide,
    dedupedAttendance: dedupedAttendance,
    podium: podium,
    monthlyBoard: monthlyBoard,
    safeHttpUrl: safeHttpUrl,
    normalizeGarminUrl: normalizeGarminUrl,
    findRouteByCourseId: findRouteByCourseId,
    rideDraftFromSource: rideDraftFromSource,
    draftFromTemplate: draftFromTemplate,
    applyTemplate: applyTemplate,
    buildRideInsert: buildRideInsert,
    previewCopies: previewCopies,
    publishCopies: publishCopies,
    sourceKey: sourceKey,
    buildRegistration: buildRegistration,
    parseGpx: parseGpx,
    trackSvg: trackSvg,
    buildAnnouncement: buildAnnouncement,
    escapeHtml: escapeHtml,
    shareAvailability: shareAvailability,
    runShare: runShare,
    copyResult: copyResult,
    interpretRiderLookup: interpretRiderLookup,
    isMissingSchemaError: isMissingSchemaError,
    nextUpcoming: nextUpcoming,
    cleanText: cleanText,
    cleanTime: cleanTime,
    splitLocation: splitLocation
  }
})(typeof globalThis !== 'undefined' ? globalThis : this)
