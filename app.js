const SUPABASE_URL = 'https://yvgjaljdxmsmtljcmemp.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Z2phbGpkeG1zbXRsamNtZW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTExMDYsImV4cCI6MjA5NzY4NzEwNn0.Bpfwwf_MfG_foTVk1oc3tKf6oBP7_ShRM1Nu0hR-Pz0'
const LIFF_ID = '2010470481-aY3CdaJS'
const AQICN_TOKEN = 'f15e708e4ce8001151a24716eebf17567d06256c'
const CACHE_TTL = 30 * 60 * 1000
const WKG_SCALE = 5.5
const TAB_ORDER = ['leaderboard', 'match', 'pace', 'ride', 'profile']
const PAGES = {
  leaderboard: ['沛速車隊', '下一場團騎 · 戰力排行'],
  match: ['配對對手', '沛速車隊 · MATCH'],
  pace: ['PACE', '沛速車隊 · RHYTHM'],
  ride: ['團騎公告', '沛速車隊 · GROUP RIDES'],
  profile: ['我的資料', '沛速車隊 · RIDER PROFILE'],
  admin: ['成員管理', '沛速車隊 · ADMIN']
}
const MILESTONES = [
  { at: 10, label: 'ID 選色' },
  { at: 20, label: '文字發光' },
  { at: 30, label: '精英成員' },
  { at: 48, label: 'PACE 傳奇' }
]
const BADGES = [
  { min: 1, name: '初次出騎', icon: 'sprout' },
  { min: 10, name: 'ID 選色', icon: 'palette' },
  { min: 20, name: '文字發光', icon: 'sparkles' },
  { min: 30, name: '精英成員', icon: 'flame' },
  { min: 48, name: 'PACE 傳奇', icon: 'crown' }
]
const ZONE_META = [
  { key: 'z1', label: 'Z1 恢復', color: '#8AA0B8' },
  { key: 'z2', label: 'Z2 耐力', color: '#33C8E8' },
  { key: 'z3', label: 'Z3 節奏', color: '#9B7BFF' },
  { key: 'z4', label: 'Z4 閾值', color: '#E62B8A' },
  { key: 'z5', label: 'Z5 VO2', color: '#FF8A3D' }
]

const params = new URLSearchParams(location.search)
const DEMO = params.get('demo') === '1'
const DEMO_ADMIN = DEMO && params.get('admin') === '1'

let db = null
let myProfile = null
let myData = null
let allRiders = []
let allLocations = []
let allWeatherLocations = []
let currentFilter = 'all'
let currentTab = 'leaderboard'
let isAdmin = false
let guidelineCache = []
let adminCache = []
let lbPainted = false
let ridesReady = false
let savingProfile = false
let gesture = null
let confettiFrame = 0
let lineSession = null
let lineSessionPromise = null
let lineRefreshTimer = 0
let myRegByRide = new Map()
let schemaCaps = { groups: false, templates: false, routes: false, rideExtras: false, regGroup: false }
let rideState = { rides: [], regs: [], groups: [], atts: [], routes: [], templates: [], templateGroups: [] }
let rankingCtx = { rides: [], attendances: [], error: null }
let publishLock = false
let announceFlex = null
let announceRideId = ''
let appliedTemplateId = ''
let studioDraft = null
let studioSource = null
let routeParse = null
const countState = new Map()
const memCache = new Map()

const TIRE_COEFFICIENTS = {
  25: { front: 1.085, rear: 1.145 },
  26: { front: 1.048, rear: 1.110 },
  28: { front: 1.000, rear: 1.065 },
  29: { front: 0.956, rear: 1.025 },
  30: { front: 0.911, rear: 0.984 },
  32: { front: 0.845, rear: 0.910 }
}
const RIDE_INTENSITY_MAP = {
  1.0: 92, 1.5: 86, 2.0: 81, 2.5: 78,
  3.0: 75, 3.5: 72, 4.0: 69, 5.0: 66, 6.0: 63
}

function prefersReducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]))
}
function safeUrl(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const u = new URL(raw, location.origin)
    if (u.protocol === 'http:' || u.protocol === 'https:') return esc(u.href)
  } catch (e) { /* ignore bad urls */ }
  return ''
}
function safeHex(color) {
  const c = String(color || '').trim()
  return /^#[0-9a-fA-F]{6}$/.test(c) ? c : ''
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('script'))
    document.head.appendChild(s)
  })
}
function readCache(key) {
  const hit = memCache.get(key)
  if (hit && Date.now() - hit.t < CACHE_TTL) return hit.v
  try {
    const raw = sessionStorage.getItem('pace-cache:' + key)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || Date.now() - obj.t > CACHE_TTL) return null
    memCache.set(key, obj)
    return obj.v
  } catch (e) { return null }
}
function writeCache(key, v) {
  const obj = { t: Date.now(), v }
  memCache.set(key, obj)
  try { sessionStorage.setItem('pace-cache:' + key, JSON.stringify(obj)) } catch (e) { /* quota */ }
}
function cacheKey(kind, date, lat, lng) {
  const la = Number(lat).toFixed(3)
  const ln = Number(lng).toFixed(3)
  return kind + ':' + (date || 'na') + ':' + la + ':' + ln
}

function calcTirePressure(weight, tireWidth) {
  const coef = TIRE_COEFFICIENTS[tireWidth]
  if (!coef || !weight) return null
  const tubFront = Math.round(weight * coef.front)
  const tubRear = Math.round(weight * coef.rear)
  return {
    tubeless: {
      front: { low: tubFront - 2, high: tubFront + 2 },
      rear: { low: tubRear - 2, high: tubRear + 2 }
    },
    open: {
      front: { low: tubFront + 8, high: tubFront + 12 },
      rear: { low: tubRear + 8, high: tubRear + 12 }
    }
  }
}
function calcGroupSpeed(avgWkg) {
  if (!avgWkg) return null
  const baseSpeed = 15 + (avgWkg * 5.2)
  const groupBonus = baseSpeed * 0.18
  const total = baseSpeed + groupBonus
  return { solo: Math.round(baseSpeed), group: Math.round(total) }
}
function weatherView(code) {
  const c = Number(code)
  const rows = [
    [[0], '晴天', '適合出騎', 'sun', 'wx-clear'],
    [[1], '大致晴朗', '適合出騎', 'sun', 'wx-clear'],
    [[2], '部分多雲', '可以出騎', 'cloud-sun', 'wx-cloud'],
    [[3], '陰天', '注意保暖', 'cloud', 'wx-cloud'],
    [[45, 48], '有霧', '能見度較低', 'cloud-fog', 'wx-fog'],
    [[51, 53, 55], '毛毛雨', '建議帶雨衣', 'cloud-rain', 'wx-rain'],
    [[61], '小雨', '建議帶雨衣', 'cloud-rain', 'wx-rain'],
    [[63], '中雨', '留意路況', 'cloud-rain', 'wx-rain'],
    [[65], '大雨', '不建議出騎', 'cloud-rain', 'wx-rain'],
    [[71, 73, 75], '降雪', '注意保暖', 'snowflake', 'wx-snow'],
    [[80, 81], '陣雨', '可能有雨', 'cloud-rain', 'wx-rain'],
    [[82], '強陣雨', '不建議出騎', 'cloud-lightning', 'wx-storm'],
    [[95, 96, 99], '雷雨', '不建議出騎', 'cloud-lightning', 'wx-storm']
  ]
  for (const row of rows) {
    if (row[0].includes(c)) return { name: row[1], tip: row[2], icon: row[3], tone: row[4] }
  }
  return { name: '天氣', tip: '', icon: 'cloud', tone: 'wx-cloud' }
}
function getAqiDescription(aqi) {
  if (aqi <= 50) return { label: '優良', color: '#3DDC97' }
  if (aqi <= 100) return { label: '普通', color: '#F5C16C' }
  if (aqi <= 150) return { label: '對敏感族群不健康', color: '#FF9A4A' }
  if (aqi <= 200) return { label: '不健康', color: '#FF6B78' }
  return { label: '非常不健康', color: '#C084FC' }
}
function compass(deg) {
  if (deg == null || Number.isNaN(Number(deg))) return ''
  const dirs = ['北', '北北東', '東北', '東北東', '東', '東南東', '東南', '南南東', '南', '南南西', '西南', '西南西', '西', '西北西', '西北', '北北西']
  const i = Math.round((Number(deg) % 360) / 22.5) % 16
  return dirs[i] + '風'
}
async function fetchWeather(lat, lng, date) {
  const key = cacheKey('w', date, lat, lng)
  const cached = readCache(key)
  if (cached) return cached
  let value = null
  if (DEMO) {
    value = { code: 1, maxTemp: 29, minTemp: 23, rainProb: 10, windSpeed: 14, windDir: 45 }
  } else {
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant' +
        '&timezone=Asia/Taipei&start_date=' + date + '&end_date=' + date
      const res = await fetch(url)
      const data = await res.json()
      const d = data.daily
      if (!d) return null
      const code = (d.weather_code || d.weathercode || [null])[0]
      const wind = (d.wind_speed_10m_max || d.windspeed_10m_max || [null])[0]
      const dir = (d.wind_direction_10m_dominant || [null])[0]
      value = {
        code, maxTemp: d.temperature_2m_max[0], minTemp: d.temperature_2m_min[0],
        rainProb: d.precipitation_probability_max[0], windSpeed: wind, windDir: dir
      }
    } catch (e) { return null }
  }
  if (value) writeCache(key, value)
  return value
}
async function fetchAqi(lat, lng, date) {
  const key = cacheKey('a', date, lat, lng)
  const cached = readCache(key)
  if (cached != null) return cached
  let value = null
  if (DEMO) value = 42
  else {
    try {
      const res = await fetch('https://api.waqi.info/feed/geo:' + lat + ';' + lng + '/?token=' + AQICN_TOKEN)
      const data = await res.json()
      if (data.status !== 'ok') return null
      value = data.data.aqi
    } catch (e) { return null }
  }
  if (value != null) writeCache(key, value)
  return value
}

function wkg(r) { return Number(r.ftp) / Number(r.weight) }
function wkgStr(r) { return wkg(r).toFixed(2) }
function cat(v) {
  if (v >= 4) return { label: 'A貓', cls: 'cat-A', fill: 'fill-a' }
  if (v >= 3.2) return { label: 'B貓', cls: 'cat-B', fill: 'fill-b' }
  if (v >= 2.5) return { label: 'C貓', cls: 'cat-C', fill: 'fill-c' }
  return { label: 'D貓', cls: 'cat-D', fill: 'fill-d' }
}
function similarity(a, b) {
  const wDiff = Math.abs(wkg(a) - wkg(b))
  const fDiff = Math.abs(a.ftp - b.ftp) / Math.max(a.ftp, b.ftp)
  return Math.max(0, Math.round(100 - (wDiff * 25 + fDiff * 50)))
}
function hue(name) {
  const palette = ['#E62B8A', '#9B7BFF', '#33C8E8', '#FF8A3D', '#5B8CFF', '#3DDC97', '#F0C14A', '#FF5D73']
  const s = String(name || '?')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % palette.length
  return palette[h]
}
function avatarHtml(url, name, size, bg) {
  const safe = safeUrl(url)
  const inner = safe ? '<img src="' + safe + '" alt="">' : esc(String(name || '?').trim().slice(0, 2) || '?')
  return '<span class="av" style="--s:' + (Number(size) || 40) + 'px;--bg:' + (bg || hue(name)) + '">' + inner + '</span>'
}
function nameHtml(rider) {
  const count = rider.attendance_count || 0
  const hex = safeHex(rider.name_color)
  let cls = ''
  let style = ''
  if (count >= 48) cls = 'rainbow-text'
  else if (count >= 10 && hex) {
    style = 'color:' + hex
    if (count >= 20) style += ';text-shadow:0 0 8px ' + hex
  }
  return '<span class="' + cls + '" style="' + style + '">' + esc(rider.name) + '</span>'
}
function titleBadge(count) {
  if (count >= 48) return 'PACE 傳奇'
  if (count >= 30) return '精英成員'
  if (count >= 20) return '資深騎手'
  if (count >= 10) return '新銳騎士'
  return ''
}
function timeAgo(ts) {
  if (!ts) return '從未'
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (diff < 60) return '剛剛'
  if (diff < 3600) return Math.floor(diff / 60) + ' 分鐘前'
  if (diff < 86400) return Math.floor(diff / 3600) + ' 小時前'
  if (diff < 2592000) return Math.floor(diff / 86400) + ' 天前'
  return Math.floor(diff / 2592000) + ' 個月前'
}
function activityStatus(ts) {
  if (!ts) return { cls: 'status-inactive', label: '從未上線' }
  const days = Math.floor((Date.now() - new Date(ts)) / 86400000)
  if (days <= 7) return { cls: 'status-active', label: '活躍' }
  if (days <= 30) return { cls: 'status-idle', label: '沉默中' }
  return { cls: 'status-inactive', label: '已消失' }
}
function showToast(msg) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  clearTimeout(showToast._t)
  showToast._t = setTimeout(() => t.classList.remove('show'), 2500)
}
function askConfirm(opts) {
  const root = document.getElementById('confirm')
  document.getElementById('confirm-title').textContent = opts.title || '確認'
  document.getElementById('confirm-body').textContent = opts.body || ''
  const okBtn = document.getElementById('confirm-ok')
  const cancelBtn = document.getElementById('confirm-cancel')
  okBtn.textContent = opts.ok || '確定'
  okBtn.classList.toggle('danger', !!opts.danger)
  return new Promise(resolve => {
    function finish(v) {
      root.hidden = true
      okBtn.onclick = null
      cancelBtn.onclick = null
      document.removeEventListener('keydown', onKey)
      resolve(v)
    }
    function onKey(e) { if (e.key === 'Escape') finish(false) }
    okBtn.onclick = () => finish(true)
    cancelBtn.onclick = () => finish(false)
    document.addEventListener('keydown', onKey)
    root.hidden = false
    cancelBtn.focus()
  })
}
function celebrate() {
  const reduce = prefersReducedMotion()
  try { if (navigator.vibrate) navigator.vibrate([18, 24, 18]) } catch (e) { /* unsupported */ }
  if (reduce) return
  const canvas = document.getElementById('confetti')
  const ctx = canvas.getContext('2d')
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = Math.floor(innerWidth * dpr)
  canvas.height = Math.floor(innerHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const colors = ['#E62B8A', '#FF4FA3', '#ffffff', '#FFD166', '#9B7BFF', '#33C8E8']
  const bits = Array.from({ length: 80 }, () => ({
    x: innerWidth * 0.5 + (Math.random() - 0.5) * 80,
    y: innerHeight * 0.72,
    vx: -3 + Math.random() * 6,
    vy: -7 - Math.random() * 4,
    a: Math.random() * Math.PI,
    va: -0.2 + Math.random() * 0.4,
    c: colors[Math.floor(Math.random() * colors.length)],
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 5
  }))
  cancelAnimationFrame(confettiFrame)
  const start = performance.now()
  const draw = (now) => {
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    bits.forEach(p => {
      p.vy += 0.12
      p.x += p.vx
      p.y += p.vy
      p.a += p.va
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.a)
      ctx.fillStyle = p.c
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
      ctx.restore()
    })
    if (now - start < 1500) confettiFrame = requestAnimationFrame(draw)
    else ctx.clearRect(0, 0, innerWidth, innerHeight)
  }
  confettiFrame = requestAnimationFrame(draw)
}
function tweenNumber(el, to, digits) {
  if (!el) return
  const target = Number(to)
  if (!Number.isFinite(target)) { el.textContent = '—'; return }
  const key = el.id || el.dataset.key || 'n'
  const from = countState.has(key) ? countState.get(key) : 0
  countState.set(key, target)
  const paint = (v) => { el.textContent = digits ? Number(v).toFixed(digits) : String(Math.round(v)) }
  const reduce = prefersReducedMotion()
  if (reduce || Math.abs(target - from) < 0.001) { paint(target); return }
  const t0 = performance.now()
  const step = (now) => {
    const p = Math.min(1, (now - t0) / 520)
    const e = 1 - Math.pow(1 - p, 3)
    paint(from + (target - from) * e)
    if (p < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}
function captureFlip() {
  const map = new Map()
  document.querySelectorAll('[data-flip]').forEach(el => map.set(el.dataset.flip, el.getBoundingClientRect()))
  return map
}
function playFlip(prev) {
  if (!prev) return
  document.querySelectorAll('[data-flip]').forEach(el => {
    const a = prev.get(el.dataset.flip)
    if (!a) return
    const b = el.getBoundingClientRect()
    const dx = a.left - b.left
    const dy = a.top - b.top
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return
    el.animate(
      [{ transform: 'translate(' + dx + 'px,' + dy + 'px)' }, { transform: 'translate(0,0)' }],
      { duration: 480, easing: 'cubic-bezier(.2,.7,.2,1)' }
    )
  })
}
function regIsMine(reg) {
  if (!reg || !myProfile) return false
  if (reg.line_user_id && reg.line_user_id === myProfile.line_user_id) return true
  return !!(myData && reg.rider_id && reg.rider_id === myData.id)
}
function insertedId(res) {
  if (!res || res.error) return ''
  if (Array.isArray(res.data)) return (res.data[0] && res.data[0].id) || ''
  return (res.data && res.data.id) || ''
}
function parseGroupLines(text) {
  return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map((line, i) => {
    const parts = line.split('｜')
    return { name: parts[0].trim(), pace_note: parts.slice(1).join('｜').trim(), sort_order: i }
  }).filter(g => g.name)
}
async function probeSchema() {
  schemaCaps = { groups: false, templates: false, routes: false, rideExtras: false, regGroup: false, category: false }
  if (DEMO) {
    schemaCaps = { groups: true, templates: true, routes: true, rideExtras: true, regGroup: true, category: true }
    return
  }
  const checks = [
    ['groups', 'ride_groups', 'id'],
    ['templates', 'ride_templates', 'id'],
    ['routes', 'routes', 'id'],
    ['rideExtras', 'rides', 'cancelled'],
    ['regGroup', 'registrations_directory', 'group_id'],
    ['category', 'rides', 'category']
  ]
  await Promise.all(checks.map(async ([key, table, col]) => {
    const res = await db.from(table).select(col).limit(1)
    schemaCaps[key] = !res.error
  }))
}
async function loadRideState() {
  const ridesRes = await db.from('rides').select('*').order('date', { ascending: false })
  rideState.rides = ridesRes.data || []
  rideState.ridesError = ridesRes.error || null
  const atts = await readFrom('attendances').select('*')
  rideState.atts = atts.data || []
  rideState.attsError = atts.error || null
  const regs = await readFrom('registrations').select('*')
  rideState.regs = regs.error ? [] : (regs.data || [])
  myRegByRide = new Map(rideState.regs.filter(regIsMine).filter(reg => reg.ride_id).map(reg => [reg.ride_id, reg]))
  rideState.groups = []
  if (schemaCaps.groups) {
    const groups = await db.from('ride_groups').select('*').order('sort_order')
    if (groups.error && globalThis.PaceCore && PaceCore.isMissingSchemaError(groups.error)) schemaCaps.groups = false
    else if (!groups.error) rideState.groups = groups.data || []
  }
  rideState.routes = []
  if (schemaCaps.routes) {
    const routes = await db.from('routes').select('*').order('title')
    if (routes.error && globalThis.PaceCore && PaceCore.isMissingSchemaError(routes.error)) schemaCaps.routes = false
    else if (!routes.error) rideState.routes = routes.data || []
  }
  rideState.templates = []
  rideState.templateGroups = []
  if (schemaCaps.templates && isAdmin) {
    const templates = await db.from('ride_templates').select('*').order('title')
    if (templates.error && globalThis.PaceCore && PaceCore.isMissingSchemaError(templates.error)) schemaCaps.templates = false
    else if (!templates.error) {
      rideState.templates = templates.data || []
      const groups = await db.from('ride_template_groups').select('*').order('sort_order')
      rideState.templateGroups = groups.data || []
    }
  }
  const extra = document.getElementById('ride-extra')
  if (extra) extra.hidden = !schemaCaps.rideExtras
  fillRouteSelect()
  syncChallengeFields()
}
async function loadRankingContext() {
  rankingCtx = {
    rides: (rideState.rides || []).map(r => ({
      id: r.id,
      date: r.date,
      is_finished: r.is_finished === true,
      cancelled: r.cancelled === true
    })),
    attendances: rideState.atts || [],
    error: rideState.ridesError || rideState.attsError || null
  }
}
function fillRouteSelect() {
  const sel = document.getElementById('ride-route')
  if (!sel) return
  const current = sel.value
  sel.innerHTML = '<option value="">不套用路線</option>' + (rideState.routes || []).map(route => `<option value="${esc(route.id)}">${esc(route.title)}</option>`).join('')
  if (current) sel.value = current
}
function syncChallengeFields() {
  const row = document.getElementById('ride-category-row')
  const fields = document.getElementById('challenge-fields')
  const cat = document.getElementById('ride-category')
  if (row) row.hidden = !schemaCaps.category
  if (fields) fields.hidden = !schemaCaps.category || !cat || cat.value !== 'challenge'
}
function statCell(val, unit, label) {
  if (val == null || val === '') return ''
  return `<div class="cell"><div class="val">${esc(String(val))}<small>${esc(unit)}</small></div><div class="lbl">${esc(label)}</div></div>`
}
function countdownHtml(ride) {
  const start = rideStartMs(ride.date, ride.time)
  if (Number.isFinite(start) && start <= Date.now()) return '<div class="cd-past">已出發</div>'
  if (!Number.isFinite(start)) return ''
  return `<div class="cd-grid" data-countdown="${start}">
    <div class="cd-cell"><b data-part="d">00</b><span>天</span></div>
    <div class="cd-cell"><b data-part="h">00</b><span>時</span></div>
    <div class="cd-cell"><b data-part="m">00</b><span>分</span></div>
    <div class="cd-cell"><b data-part="s">00</b><span>秒</span></div>
  </div>`
}
function heroCardHtml(ride, layout) {
  const kind = layout.heroKind === 'challenge' ? '年度挑戰' : '週日固定團騎'
  const distLabel = '距離' + (ride.distance_estimated ? '（估算）' : '')
  const ascentLabel = '爬升' + (ride.ascent_estimated ? '（估算）' : '')
  const stats = statCell(ride.distance_km, 'km', distLabel) + statCell(ride.ascent_m, 'm', ascentLabel)
  return `<article class="ride-card hero-card" data-act="open-ride" data-id="${esc(ride.id)}" tabindex="0">
    <div class="wx-card wx-none"><div class="waves"></div><div class="wx-body">
      <div class="wx-kicker">${icon('flag', 16)}${kind}</div>
      <div class="wx-title">${esc(ride.title)}</div>
      <div class="wx-when"><span>${icon('calendar', 14)}${formatRideDate(ride.date)}</span></div>
    </div></div>
    <div class="cd-block"><div class="cd-label"><span>距離出發</span></div>${countdownHtml(ride)}</div>
    ${stats ? `<div class="stat-strip">${stats}</div>` : ''}
    ${layout.preparation && layout.preparation.label ? `<p class="prep-hint">${esc(layout.preparation.label)}</p>` : ''}
  </article>`
}
function compactSundayHtml(ride) {
  const regs = (rideState.regs || []).filter(reg => reg.ride_id === ride.id)
  const mine = myRegByRide.get(ride.id)
  const loc = splitLoc(ride.location)
  const squads = (rideState.groups || []).filter(g => g.ride_id === ride.id)
  const joined = squads.find(g => mine && g.id === mine.group_id)
  const status = mine ? `<div class="reg-status">已報名${joined ? ' · ' + esc(joined.name) : ''}</div>` : ''
  const action = mine
    ? `<button class="reg-btn registered" type="button" data-act="reg" data-id="${esc(ride.id)}" data-on="1">${icon('check', 16)}取消報名</button>`
    : `<button class="reg-btn" type="button" data-act="reg" data-id="${esc(ride.id)}" data-on="0">${icon('plus', 16)}我要報名</button>`
  return `<article class="card compact-ride">
    <button class="compact-open" type="button" data-act="open-ride" data-id="${esc(ride.id)}">
      <span class="compact-kicker">週日固定團騎</span>
      <strong>${esc(ride.title)}</strong>
      <span>${formatRideDate(ride.date)} · ${esc(String(ride.time || '').slice(0, 5))}</span>
      <span>${esc(loc.name || '')}</span>
    </button>
    <div class="compact-foot">
      <div class="compact-meta">已報名 ${regs.length}${ride.max_participants ? ' / ' + esc(ride.max_participants) : ''} 人</div>
      ${status}
      <div class="home-actions">
        ${action}
        <button class="edit-btn share-ride-btn" type="button" data-act="announce" data-id="${esc(ride.id)}">${icon('send', 14)}公告</button>
      </div>
    </div>
  </article>`
}
function renderMonthlyHint(layout) {
  const hint = document.getElementById('monthly-test-hint')
  if (!hint) return
  if (!layout || !layout.monthly) { hint.hidden = true; hint.textContent = ''; return }
  hint.hidden = false
  hint.textContent = '下次每月檢定：' + formatRideDate(layout.monthly.date) + ' ' + (layout.monthly.title || '')
}
function renderNextRide() {
  const host = document.getElementById('next-ride')
  if (!host || !globalThis.PaceCore) return
  const layout = PaceCore.homeLayout(rideState.rides || [], Date.now())
  const parts = []
  if (layout.hero) parts.push(heroCardHtml(layout.hero, layout))
  else parts.push('<div class="card empty-state">目前沒有尚未出發的年度挑戰，也沒有即將出發的週日團騎</div>')
  if (layout.compactSunday) parts.push(compactSundayHtml(layout.compactSunday))
  host.innerHTML = parts.join('')
  renderMonthlyHint(layout)
}
function openRide(id) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(id || ''))) return
  switchTab('ride')
  const node = document.getElementById('ride-' + id)
  if (node && node.scrollIntoView) node.scrollIntoView({ block: 'start' })
}
function renderMonthly(today) {
  const host = document.getElementById('monthly-board')
  if (!host || !globalThis.PaceCore) return
  if (rankingCtx.error) {
    host.innerHTML = '<h2>本月出席</h2><div class="empty-state">出席紀錄暫時讀不到，不列入名次。</div>'
    return
  }
  const board = PaceCore.monthlyBoard({
    today: today || PaceCore.taipeiDate(new Date()),
    riders: allRiders,
    rides: rankingCtx.rides,
    attendances: rankingCtx.attendances
  })
  const rows = board.rows.length ? board.rows.map(row => `<div class="monthly-row"><span>#${row.rank}</span><b>${esc(row.name)}</b><span>${row.count} 次</span></div>`).join('') : '<div class="empty-state">這個月還沒有已結束的出席</div>'
  host.innerHTML = `<h2>本月出席</h2><p>${esc(board.rule)}</p>${rows}`
}
function pastRides() {
  const today = PaceCore.taipeiDate(new Date())
  return (rideState.rides || []).filter(r => r.date && r.date <= today)
}
function renderStudio() {
  const host = document.getElementById('admin-studio')
  if (!host || !isAdmin) return
  if (!schemaCaps.templates && !schemaCaps.rideExtras && !DEMO) {
    host.innerHTML = '<div class="empty-state">資料庫還沒有範本與複製欄位。請先執行 migration，現有團騎仍可使用。</div>'
    return
  }
  const options = pastRides().map(r => `<option value="${esc(r.id)}">${esc(r.date)} ${esc(r.title)}</option>`).join('')
  const bulk = pastRides().map(r => `<div class="bulk-row"><label><input type="checkbox" data-bulk="${esc(r.id)}"><span>${esc(r.date)} ${esc(r.title)}</span></label><input type="date" data-bulk-date="${esc(r.id)}" aria-label="新日期"></div>`).join('')
  host.innerHTML = `<section class="card studio-card">
      <h2>從過去的團騎建立新的一場</h2>
      <p class="studio-note">會帶入標題、集合點、時間、Garmin 路線連結和備註。不會帶入報名、出席、舊的 GroupRide 代碼、舊日期或已結束／已取消狀態。選取範本或舊團騎都還不會發布。</p>
      <div class="form-row"><label for="copy-source">過去的團騎</label><select id="copy-source"><option value="">請選擇</option>${options}</select></div>
      <div class="form-row"><label for="copy-category">團騎類型</label>
        <select id="copy-category"><option value="sunday">週日固定團騎</option><option value="challenge">年度挑戰</option><option value="monthly">每月檢定</option></select>
      </div>
      <div class="form-row"><label for="copy-date">新的日期</label><input type="date" id="copy-date"></div>
      <div class="form-row"><label for="copy-code">這一場的 GroupRide 代碼（選填）</label>
        <p class="field-help">必須是這一場新建立的代碼，可以晚點再補。舊代碼不會帶過來。</p>
        <input type="text" id="copy-code" placeholder="留白代表這場還沒有代碼">
      </div>
      <pre id="copy-draft" class="announce-text">尚未帶入。</pre>
      <div class="btn-row">
        <button class="cancel-btn" type="button" data-act="copy-preview">預覽，先不發布</button>
        <button class="save-btn" type="button" data-act="copy-publish">發布這一場</button>
        <button class="cancel-btn" type="button" data-act="save-template">存成範本，不發布</button>
      </div>
      <pre id="copy-preview" class="announce-text"></pre>
    </section>
    <section class="card studio-card">
      <h2>範本</h2>
      <div class="form-row"><label for="template-search">搜尋</label><input type="search" id="template-search" placeholder="標題或集合點"></div>
      <div id="template-list"></div>
    </section>
    <section class="card studio-card">
      <h2>一次選好幾場</h2>
      <p class="studio-note">每一場各自填新日期。先看預覽，再按確認發布。缺日期的不會建立，已建立的不會因為其他筆失敗而被悄悄多複製一次。</p>
      ${bulk || '<div class="empty-state">還沒有過去的團騎</div>'}
      <div class="btn-row">
        <button class="cancel-btn" type="button" data-act="bulk-preview">預覽整批，先不發布</button>
        <button class="save-btn" type="button" data-act="bulk-publish">確認發布</button>
      </div>
      <div id="bulk-results"></div>
    </section>
    <div id="publish-results"></div>`
  const search = document.getElementById('template-search')
  if (search) search.addEventListener('input', () => renderTemplateList(search.value))
  renderTemplateList('')
  const source = document.getElementById('copy-source')
  if (source) source.addEventListener('change', () => { if (source.value) stagePastRide(source.value) })
}
function renderTemplateList(query) {
  const host = document.getElementById('template-list')
  if (!host) return
  const q = String(query || '').trim().toLowerCase()
  const rows = (rideState.templates || []).filter(t => !q || (t.title + ' ' + (t.location || '')).toLowerCase().includes(q))
  host.innerHTML = rows.length ? rows.map(t => `<div class="template-row"><div><b>${esc(t.title)}</b><div class="field-help">${esc(t.time || '')} ${esc(t.location || '')}</div></div><button class="edit-btn" type="button" data-act="use-template" data-id="${esc(t.id)}">帶入，不發布</button></div>`).join('') : '<div class="empty-state">沒有符合的範本</div>'
}
function stagePastRide(id) {
  const ride = (rideState.rides || []).find(r => r.id === id)
  if (!ride) return
  studioDraft = PaceCore.rideDraftFromSource(ride, (rideState.groups || []).filter(g => g.ride_id === id))
  studioSource = { kind: 'ride', id }
  appliedTemplateId = ''
  const draft = document.getElementById('copy-draft')
  if (draft) draft.textContent = '已帶入「' + ride.title + '」。舊的 GroupRide 代碼、報名和出席都不會帶過去。尚未發布。'
  const code = document.getElementById('copy-code')
  if (code) code.value = ''
  const date = document.getElementById('copy-date')
  if (date) date.value = ''
  const cat = document.getElementById('copy-category')
  if (cat) cat.value = PaceCore.normalizeCategory(studioDraft.category)
}
function stageTemplate(id) {
  const template = (rideState.templates || []).find(t => t.id === id)
  if (!template) return
  const applied = PaceCore.applyTemplate(template, (rideState.templateGroups || []).filter(g => g.template_id === id))
  if (applied.published || applied.persisted) return
  studioDraft = applied.draft
  studioSource = { kind: 'template', id }
  appliedTemplateId = id
  const source = document.getElementById('copy-source')
  if (source) source.value = ''
  const code = document.getElementById('copy-code')
  if (code) code.value = ''
  const date = document.getElementById('copy-date')
  if (date) date.value = ''
  const cat = document.getElementById('copy-category')
  if (cat) cat.value = PaceCore.normalizeCategory(studioDraft.category)
  const draft = document.getElementById('copy-draft')
  if (draft) draft.textContent = '已帶入範本「' + template.title + '」，尚未發布。請填新日期後才按發布。'
}
function studioItem() {
  if (!studioDraft || !studioSource) return null
  const draft = Object.assign({}, studioDraft)
  const cat = document.getElementById('copy-category')
  if (cat && cat.value) draft.category = PaceCore.normalizeCategory(cat.value)
  return {
    key: studioSource.id,
    sourceKind: studioSource.kind,
    sourceId: studioSource.id,
    date: (document.getElementById('copy-date') || {}).value || '',
    garminCode: (document.getElementById('copy-code') || {}).value || '',
    draft: draft
  }
}
function previewStudio() {
  const item = studioItem()
  const host = document.getElementById('copy-preview')
  if (!item) { if (host) host.textContent = '請先選擇過去的團騎或範本。尚未發布。'; return }
  const view = PaceCore.previewCopies([item]).items[0]
  if (!host) return
  if (view.blockers.length) {
    host.textContent = '尚未發布。' + view.blockers.join('、')
    return
  }
  host.textContent = [
    '預覽，尚未發布',
    '標題：' + view.payload.title,
    '新日期：' + view.payload.date,
    '集合：' + view.payload.time + ' ' + view.payload.location,
    '路線：' + (view.payload.garmin_url || '（沒有）'),
    '備註：' + (view.payload.note || '（沒有）'),
    '類型：' + PaceCore.categoryLabel(view.payload.category),
    'GroupRide 代碼：' + (view.payload.garmin_code || '（這場還沒有，不會沿用舊代碼）'),
    '報名 0 人，出席 0 人',
    '新編號會由資料庫產生；狀態是未結束、未取消'
  ].join('\n')
}
async function insertCopiedRide(item) {
  const payload = Object.assign({}, item.payload)
  if (!schemaCaps.rideExtras) ['pace_note', 'distance_km', 'ascent_m', 'distance_estimated', 'ascent_estimated', 'route_id', 'cancelled', 'source_key'].forEach(key => { delete payload[key] })
  if (!schemaCaps.category) ['category', 'pacing_guide', 'supply_points', 'cutoff_times', 'gear_list'].forEach(key => { delete payload[key] })
  const res = await db.from('rides').insert(payload).select('id')
  if (res.error) {
    const duplicate = res.error.code === '23505' || /duplicate|source_key/i.test(res.error.message || '')
    return { error: true, duplicate, code: res.error.code }
  }
  const id = insertedId(res)
  if (schemaCaps.groups && id && item.groups && item.groups.length) {
    const rows = item.groups.map(g => ({ ride_id: id, name: g.name, pace_note: g.pace_note || '', sort_order: g.sort_order || 0 }))
    const saved = await db.from('ride_groups').insert(rows)
    if (saved.error) return { id, error: true }
  }
  return { id }
}
function publishStatusText(result) {
  const label = { published: '已建立', blocked: '未建立', duplicate: '已存在，沒有再建立一筆', failed: '失敗', skipped: '未送出' }
  return (result.results || []).map(row => {
    const why = row.blockers && row.blockers.length ? '：' + row.blockers.join('、') : ''
    return (label[row.status] || row.status) + why
  }).join('\n')
}
async function publishStudio() {
  const item = studioItem()
  const host = document.getElementById('publish-results')
  if (!item) { if (host) host.textContent = '沒有可發布的內容'; return }
  if (publishLock) { showToast('正在發布，請不要連按'); return }
  publishLock = true
  try {
    const result = await PaceCore.publishCopies([item], insertCopiedRide)
    await loadRideState()
    await loadRankingContext()
    renderLeaderboard()
    await renderRides()
    renderStudio()
    const refreshed = document.getElementById('copy-preview')
    if (refreshed) refreshed.textContent = publishStatusText(result)
    const published = (result.results || []).find(row => row.status === 'published')
    if (published && published.id) openAnnouncement(published.id)
  } finally {
    publishLock = false
  }
}
function collectBulk() {
  return Array.from(document.querySelectorAll('[data-bulk]:checked')).map(box => {
    const ride = (rideState.rides || []).find(r => r.id === box.value)
    return {
      key: (ride && ride.title) || box.value,
      sourceKind: 'ride',
      sourceId: box.value,
      date: (document.querySelector('[data-bulk-date="' + box.value + '"]') || {}).value || '',
      garminCode: '',
      draft: PaceCore.rideDraftFromSource(ride, (rideState.groups || []).filter(g => g.ride_id === box.value))
    }
  })
}
async function previewBulk() {
  const items = collectBulk()
  const host = document.getElementById('bulk-results')
  if (!items.length) { if (host) host.textContent = '請先勾選團騎。尚未發布。'; return }
  const preview = PaceCore.previewCopies(items)
  if (host) host.textContent = '預覽，尚未發布\n' + preview.items.map(item => {
    if (item.blockers.length) return item.key + '：未建立（' + item.blockers.join('、') + '）'
    return item.key + ' → ' + item.payload.date + '，代碼「' + (item.payload.garmin_code || '無') + '」，人數 0'
  }).join('\n')
}
async function publishBulk() {
  const items = collectBulk()
  const host = document.getElementById('bulk-results')
  if (!items.length) { if (host) host.textContent = '請先勾選團騎'; return }
  if (publishLock) { showToast('正在發布，請不要連按'); return }
  publishLock = true
  try {
    const result = await PaceCore.publishCopies(items, insertCopiedRide)
    if (host) host.textContent = publishStatusText(result)
    await loadRideState()
    await loadRankingContext()
    renderLeaderboard()
    await renderRides()
  } finally {
    publishLock = false
  }
}
async function saveTemplateFromStudio() {
  if (!studioDraft || !studioDraft.title) { showToast('先帶入內容。這不會發布團騎'); return }
  if (!schemaCaps.templates) { showToast('資料庫還沒有範本表'); return }
  const row = {
    title: studioDraft.title,
    time: studioDraft.time || '',
    time2: studioDraft.time2 || '',
    location: studioDraft.location || '',
    location2: studioDraft.location2 || '',
    note: studioDraft.note || '',
    strava_url: studioDraft.strava_url || '',
    garmin_url: studioDraft.garmin_url || '',
    pace_note: studioDraft.pace_note || '',
    category: schemaCaps.category ? PaceCore.normalizeCategory(studioDraft.category) : undefined,
    pacing_guide: schemaCaps.category ? (studioDraft.pacing_guide || '') : undefined,
    supply_points: schemaCaps.category ? (studioDraft.supply_points || '') : undefined,
    cutoff_times: schemaCaps.category ? (studioDraft.cutoff_times || '') : undefined,
    gear_list: schemaCaps.category ? (studioDraft.gear_list || '') : undefined,
    distance_km: studioDraft.distance_km,
    ascent_m: studioDraft.ascent_m,
    distance_estimated: studioDraft.distance_estimated === true,
    ascent_estimated: studioDraft.ascent_estimated === true,
    route_id: studioDraft.route_id || null,
    max_participants: studioDraft.max_participants,
    weather_lat: studioDraft.weather_lat,
    weather_lng: studioDraft.weather_lng,
    weather_location_name: studioDraft.weather_location_name || ''
  }
  const res = await db.from('ride_templates').insert(row).select('id')
  if (res.error) { showToast('範本沒有存起來'); return }
  const id = insertedId(res)
  if (id && studioDraft.groups && studioDraft.groups.length) {
    await db.from('ride_template_groups').insert(studioDraft.groups.map(g => ({
      template_id: id, name: g.name, pace_note: g.pace_note || '', sort_order: g.sort_order || 0
    })))
  }
  showToast('已存成範本，沒有發布團騎')
  await loadRideState()
  renderStudio()
}
function routeResultHtml(parsed) {
  if (!parsed || !parsed.ok) return `<p class="status-bad">${esc((parsed && parsed.message) || '無法讀取這份 GPX')}</p>`
  const ascent = parsed.ascentM == null ? '無法估算爬升（沒有高度）' : parsed.ascentM + ' m（估算）'
  return `${PaceCore.trackSvg(parsed.points)}<p>距離 ${esc(String(parsed.distanceKm))} km（估算） · 爬升 ${esc(ascent)}</p><p class="field-help">${esc(parsed.message)} 預覽只用 GPX 座標畫線，沒有街道底圖，也不會連到 Garmin 或付費地圖。</p>`
}
function renderRouteAdmin() {
  const host = document.getElementById('admin-routes')
  if (!host || !isAdmin) return
  if (!schemaCaps.routes && !DEMO) {
    host.innerHTML = '<div class="empty-state">資料庫還沒有路線庫。請先執行 migration。</div>'
    return
  }
  const sample = DEMO && globalThis.PaceCore ? routeResultHtml(PaceCore.parseGpx(DEMO_GPX)) : ''
  const list = (rideState.routes || []).map(route => `<article class="card route-card"><h2>${esc(route.title)}</h2><p class="field-help">${route.garmin_course_id ? 'Garmin 路線編號 ' + esc(route.garmin_course_id) : '沒有 Garmin 路線編號'}</p>${route.original_url ? `<p class="field-help">${esc(route.original_url)}</p>` : ''}${PaceCore.trackSvg(route.track || [])}<p>距離 ${route.distance_km == null ? '未填' : esc(String(route.distance_km)) + (route.distance_estimated ? ' km（估算）' : ' km')} · 爬升 ${route.ascent_m == null ? '未填' : esc(String(route.ascent_m)) + (route.ascent_estimated ? ' m（估算）' : ' m')}</p><p>${esc(route.notes || '')}</p></article>`).join('')
  host.innerHTML = `<section class="card route-card">
      <h2>路線庫</h2>
      <p class="studio-note">路線跟某一場團騎分開存。日期和 GroupRide 代碼不會寫進路線。相同的 Garmin 路線編號會更新同一筆。</p>
      <div class="form-row"><label for="route-title">路線名稱</label><input id="route-title" type="text"></div>
      <div class="form-row"><label for="route-url">公開的 Garmin 路線連結</label><input id="route-url" type="url" placeholder="https://connect.garmin.com/modern/course/..."></div>
      <p id="route-url-note" class="field-help"></p>
      <div class="form-row"><label for="route-notes">備註</label><textarea id="route-notes" rows="3"></textarea></div>
      <div class="form-grid">
        <div class="form-row"><label for="route-distance">距離 km</label><input id="route-distance" type="number" min="0" step="0.1"></div>
        <div class="form-row"><label for="route-ascent">爬升 m</label><input id="route-ascent" type="number" min="0" step="1"></div>
      </div>
      <div class="form-row"><label for="route-gpx">本機 GPX</label><input id="route-gpx" type="file" accept=".gpx,application/gpx+xml,text/xml"></div>
      <div id="gpx-result">${sample}</div>
      <button class="save-btn" type="button" data-act="save-route">儲存路線</button>
    </section>${list}`
  const file = document.getElementById('route-gpx')
  if (file) file.addEventListener('change', () => readGpxFile(file.files && file.files[0]))
  const url = document.getElementById('route-url')
  if (url) url.addEventListener('change', () => noteGarminUrl(url.value))
  ;['route-distance', 'route-ascent'].forEach(id => {
    const input = document.getElementById(id)
    if (input) input.addEventListener('input', () => { input.dataset.edited = '1' })
  })
}
function noteGarminUrl(value) {
  const note = document.getElementById('route-url-note')
  if (!note || !globalThis.PaceCore) return
  const norm = PaceCore.normalizeGarminUrl(value)
  if (!value.trim()) { note.textContent = ''; return }
  if (!norm.ok) { note.textContent = '這個連結不能用。只接受沒有帳號密碼的 http 或 https。'; return }
  const known = norm.courseId ? PaceCore.findRouteByCourseId(rideState.routes || [], norm.courseId) : null
  note.textContent = known
    ? '路線庫已有同一條 Garmin 路線「' + known.title + '」。儲存時會更新那一筆，不會另建。'
    : (norm.courseId ? '辨識到路線編號 ' + norm.courseId + '。' : '這是可用的連結，但不是支援的 Garmin 路線網址，不會當成同一條路線。')
}
async function readGpxFile(file) {
  const host = document.getElementById('gpx-result')
  if (!file) return
  if (file.size > 1500000) {
    routeParse = { ok: false, message: 'GPX 超過大小上限，沒有讀取' }
    if (host) host.innerHTML = routeResultHtml(routeParse)
    return
  }
  const text = await file.text()
  routeParse = PaceCore.parseGpx(text)
  if (host) host.innerHTML = routeResultHtml(routeParse)
  if (routeParse.ok) {
    const distance = document.getElementById('route-distance')
    const ascent = document.getElementById('route-ascent')
    if (distance && distance.dataset.edited !== '1') distance.value = String(routeParse.distanceKm)
    if (ascent && ascent.dataset.edited !== '1' && routeParse.ascentM != null) ascent.value = String(routeParse.ascentM)
  }
}
async function saveRoute() {
  const title = (document.getElementById('route-title').value || '').trim()
  if (!title) { showToast('請填路線名稱'); return }
  const norm = PaceCore.normalizeGarminUrl(document.getElementById('route-url').value)
  if (document.getElementById('route-url').value.trim() && !norm.ok) { showToast('路線連結不能用'); return }
  const distanceInput = document.getElementById('route-distance')
  const ascentInput = document.getElementById('route-ascent')
  const distance = distanceInput.value === '' ? null : Number(distanceInput.value)
  const ascent = ascentInput.value === '' ? null : Number(ascentInput.value)
  const parsed = routeParse && routeParse.ok ? routeParse : null
  const row = {
    title,
    garmin_course_id: norm.courseId || null,
    garmin_url: norm.canonical || norm.original || '',
    original_url: norm.original || '',
    distance_km: distance,
    ascent_m: ascent,
    distance_estimated: distance != null && distanceInput.dataset.edited !== '1' && !!parsed,
    ascent_estimated: ascent != null && ascentInput.dataset.edited !== '1' && !!(parsed && parsed.ascentM != null),
    notes: document.getElementById('route-notes').value.trim(),
    track: parsed ? parsed.points : [],
    point_count: parsed ? parsed.pointCount : 0,
    updated_at: new Date().toISOString()
  }
  const existing = norm.courseId ? PaceCore.findRouteByCourseId(rideState.routes || [], norm.courseId) : null
  const res = existing
    ? await db.from('routes').update(row).eq('id', existing.id)
    : await db.from('routes').insert(row)
  if (res.error) { showToast('路線沒有存起來'); return }
  showToast(existing ? '已更新同一條路線' : '已存進路線庫')
  routeParse = null
  await loadRideState()
  renderRouteAdmin()
}
function currentAnnouncement() {
  const ride = (rideState.rides || []).find(r => r.id === announceRideId)
  if (!ride) return null
  return PaceCore.buildAnnouncement(Object.assign({}, ride, {
    groups: (rideState.groups || []).filter(g => g.ride_id === ride.id)
  }), { liffId: LIFF_ID })
}
function openAnnouncement(rideId) {
  announceRideId = rideId
  const built = currentAnnouncement()
  const dialog = document.getElementById('announce')
  const text = document.getElementById('announce-text')
  if (!built || !built.ok || !dialog || !text) { showToast('這一場的資料還不足以產生公告'); return }
  announceFlex = built.flex
  text.textContent = built.text
  dialog.hidden = false
}
async function copyPlain(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch (e) { return false }
}
async function shareCurrentAnnouncement() {
  const built = currentAnnouncement()
  if (!built || !built.ok) return
  if (DEMO) { showToast('示範資料不會送出 LINE 訊息'); return }
  const result = await PaceCore.runShare(typeof liff === 'undefined' ? null : liff, built.flex)
  if (result.status === 'sent') { showToast('已送出'); return }
  if (result.status === 'cancelled') { showToast('已取消，沒有送出'); return }
  if (result.status === 'unavailable') {
    const copied = await copyPlain(built.text)
    showToast(copied ? '這個環境不能開啟 LINE 分享選單。公告已複製，尚未送出' : '無法開啟分享選單，也沒有送出')
    return
  }
  showToast('沒有送出，請再試一次')
}
async function copyAnnouncementOnly() {
  const built = currentAnnouncement()
  if (!built || !built.ok) return
  const copied = await copyPlain(built.text)
  const status = PaceCore.copyResult()
  showToast(copied && status.sent === false ? '已複製公告，尚未送出' : '複製失敗，沒有送出')
}
async function setRideCancelled(rideId, cancelled) {
  if (!schemaCaps.rideExtras) { showToast('資料庫還沒有取消欄位'); return }
  const res = await db.from('rides').update({ cancelled: cancelled }).eq('id', rideId)
  if (res.error) { showToast('沒有改成取消'); return }
  showToast(cancelled ? '已標記取消' : '已恢復這場')
  await loadRideState()
  await loadRankingContext()
  renderLeaderboard()
  await renderRides()
}
function openRequestedPanel() {
  const open = params.get('open')
  const rideParam = params.get('ride')
  const safeRide = rideParam && /^[A-Za-z0-9_-]{1,80}$/.test(rideParam) ? rideParam : ''
  if (safeRide && open !== 'announce' && open !== 'studio' && open !== 'route') {
    switchTab('ride')
    const node = document.getElementById('ride-' + safeRide)
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'start' })
  }
  if (open === 'podium') {
    const node = document.getElementById('podium-block')
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'start' })
  }
  if (open === 'studio' && isAdmin) {
    switchTab('admin')
    switchAdminTab('studio')
    renderStudio()
  }
  if (open === 'route' && isAdmin) {
    switchTab('admin')
    switchAdminTab('routes')
    renderRouteAdmin()
  }
  if (open === 'form' && isAdmin) {
    switchTab('ride')
    showRideForm()
  }
  if (open === 'announce') {
    const fallback = (PaceCore.nextUpcoming(rideState.rides || [], Date.now()) || {}).id || ''
    const id = safeRide && (rideState.rides || []).some(r => r.id === safeRide) ? safeRide : fallback
    if (id) openAnnouncement(id)
  }
}
function bootChrome() {
  document.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size || 20))
  })
}
function syncChrome() {
  const page = PAGES[currentTab] || PAGES.leaderboard
  document.getElementById('page-title').textContent = page[0]
  document.getElementById('page-sub').textContent = page[1]
  document.title = 'PACE｜' + page[0]
  document.body.dataset.tab = currentTab
  document.getElementById('add-ride-btn').hidden = !(isAdmin && currentTab === 'ride')
  document.getElementById('share-btn').hidden = currentTab !== 'profile'
  document.getElementById('tone-btn').hidden = currentTab !== 'leaderboard'
  document.getElementById('bell-btn').hidden = currentTab !== 'leaderboard'
  document.querySelectorAll('.nav-btn').forEach(b => {
    const on = b.dataset.nav === currentTab || (currentTab === 'admin' && b.dataset.nav === 'profile')
    b.classList.toggle('active', on)
    if (on) b.setAttribute('aria-current', 'page')
    else b.removeAttribute('aria-current')
  })
}
function updateBell(n) {
  const b = document.getElementById('bell-count')
  if (!b) return
  b.hidden = !(isAdmin && n > 0)
  b.textContent = String(n || '')
}
function isSameRider(a, b) {
  if (!a || !b) return false
  if (a.id && b.id && a.id === b.id) return true
  return !!(a.line_user_id && b.line_user_id && a.line_user_id === b.line_user_id)
}
function isMe(r) {
  if (!r || !myProfile) return false
  if (myData && isSameRider(r, myData)) return true
  return !!(r.line_user_id && r.line_user_id === myProfile.line_user_id)
}
function currentRider() {
  if (!myProfile) return myData
  return allRiders.find(r => isMe(r)) || myData
}
function readFrom(table) {
  if (DEMO) return db.from(table)
  if (table === 'riders') return db.from('riders_directory')
  if (table === 'registrations') return db.from('registrations_directory')
  if (table === 'attendances') return db.from('attendances_directory')
  return db.from(table)
}
function riderForAttendance(att) {
  return allRiders.find(rr =>
    (att.rider_id && rr.id === att.rider_id) ||
    (att.line_user_id && rr.line_user_id === att.line_user_id)
  )
}
function regMatchesRider(reg, rider) {
  if (reg.rider_id && rider.id && reg.rider_id === rider.id) return true
  return !!(reg.line_user_id && rider.line_user_id && reg.line_user_id === rider.line_user_id)
}
function authFunctionUrl() {
  return SUPABASE_URL.replace(/\/$/, '') + '/functions/v1/line-auth'
}
function scheduleLineRefresh() {
  if (lineRefreshTimer) clearTimeout(lineRefreshTimer)
  if (!lineSession) return
  const delay = Math.max(5000, lineSession.expiresAt * 1000 - Date.now() - 60000)
  lineRefreshTimer = setTimeout(() => {
    refreshLineSession(true).catch(() => {})
  }, delay)
}
async function refreshLineSession(force) {
  if (!force && lineSession && lineSession.expiresAt * 1000 - Date.now() > 60000) return lineSession.token
  if (!force && lineSessionPromise) return lineSessionPromise
  const job = requestLineSession().finally(() => {
    if (lineSessionPromise === job) lineSessionPromise = null
  })
  lineSessionPromise = job
  return job
}
async function requestLineSession() {
  const idToken = typeof liff !== 'undefined' && liff.getIDToken ? liff.getIDToken() : ''
  if (!idToken) {
    liff.login({ redirectUri: location.href })
    return null
  }
  const res = await fetch(authFunctionUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
    body: JSON.stringify({ id_token: idToken })
  })
  if (res.status === 401) {
    try { liff.logout() } catch (e) { /* 重新登入仍要進行 */ }
    liff.login({ redirectUri: location.href })
    return null
  }
  if (!res.ok) throw new Error('line-auth')
  const body = await res.json()
  if (!body.access_token || !Number.isFinite(Number(body.expires_at))) throw new Error('line-auth')
  lineSession = { token: body.access_token, expiresAt: Number(body.expires_at) }
  scheduleLineRefresh()
  return lineSession.token
}
function sortedRiders() {
  return [...allRiders].sort((a, b) => wkg(b) - wkg(a))
}

function taipeiToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}
function nextSunday() {
  const today = taipeiToday()
  const [y, m, d] = today.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const delta = (7 - dt.getUTCDay()) % 7
  return shiftDate(today, delta === 0 ? 7 : delta)
}
const DEMO_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="pace-demo">
  <trk><name>示範壽山</name><trkseg>
    <trkpt lat="22.6300" lon="120.2800"><ele>10</ele></trkpt>
    <trkpt lat="22.6400" lon="120.2800"><ele>40</ele></trkpt>
    <trkpt lat="22.6500" lon="120.2800"><ele>35</ele></trkpt>
    <trkpt lat="22.6600" lon="120.2850"><ele>80</ele></trkpt>
  </trkseg></trk>
</gpx>`
function createDemoDb() {
  const sunday = nextSunday()
  const today = taipeiToday()
  const day = (n) => shiftDate(today, n)
  const now = new Date().toISOString()
  const rider = (partial) => Object.assign({
    status: 'approved', z1: 0, z2: 0, z3: 0, z4: 0, z5: 0, mood: '', tire_width: null,
    name_color: '', is_admin: false, attendance_count: 0, avatar_url: '', last_seen: now, updated_at: now
  }, partial)
  const store = {
    riders: [
      rider({ id: 'r1', line_user_id: 'u-lin', name: '小林', ftp: 330, weight: 72.05, attendance_count: 34, mood: '週末爬壽山' }),
      rider({ id: 'r2', line_user_id: 'demo-me', name: '阿揚', ftp: 305, weight: 67.93, attendance_count: 52, mood: '今天腿很酸', tire_width: 28, name_color: '#E62B8A', z1: 168, z2: 229, z3: 275, z4: 320, z5: 366, is_admin: DEMO_ADMIN }),
      rider({ id: 'r3', line_user_id: 'u-kevin', name: 'Kevin', ftp: 290, weight: 66.06, attendance_count: 22 }),
      rider({ id: 'r4', line_user_id: 'u-momo', name: 'Momo', ftp: 210, weight: 51.98, attendance_count: 8, mood: '補給吃好吃滿' }),
      rider({ id: 'r5', line_user_id: 'u-zhe', name: '阿哲', ftp: 270, weight: 69.95, attendance_count: 14, mood: 'FTP 測試準備中' }),
      rider({ id: 'r6', line_user_id: 'u-bear', name: '大熊', ftp: 300, weight: 84.99, attendance_count: 3 }),
      rider({ id: 'r7', line_user_id: 'u-mei', name: '小美', ftp: 185, weight: 55.06, attendance_count: 11 }),
      rider({ id: 'r8', line_user_id: 'u-jerry', name: 'Jerry', ftp: 240, weight: 74.07, attendance_count: 1, mood: '新手報到' }),
      rider({ id: 'r9', line_user_id: 'u-an', name: '小安', ftp: 180, weight: 64, attendance_count: 4 }),
      rider({ id: 'r10', line_user_id: 'u-hai', name: '阿海', ftp: 150, weight: 72, attendance_count: 2 }),
      rider({ id: 'r11', line_user_id: 'u-new', name: '新人小陳', ftp: 250, weight: 68, status: 'pending', attendance_count: 0 })
    ],
    locations: [
      { id: 'loc1', name: '愛河之心', address: '高雄市苓雅區四維三路2號', sort_order: 1 },
      { id: 'loc2', name: '民族路全國電子', address: '高雄市三民區明誠一路836號', sort_order: 2 }
    ],
    weather_locations: [
      { id: 'w1', name: '高雄市區', lat: 22.6273, lng: 120.3014, sort_order: 1 },
      { id: 'w2', name: '壽山', lat: 22.626, lng: 120.266, sort_order: 2 }
    ],
    guidelines: [
      { id: 'g1', category: '集團安全', sort_order: 1, content: '保持兩指寬的橫向間距，不重疊車輪。\n剎車前提早舉手，下坡不突然減速。\n身體不適或跟不上時，提早出聲。' },
      { id: 'g2', category: '爬坡技巧', sort_order: 2, content: '上坡維持自己的節奏，不要在坡底硬跟。\n坐姿為主，站起來時先跟旁邊的人說一聲。' },
      { id: 'g3', category: '補給', sort_order: 3, content: '出發前吃完簡單碳水，騎乘中每小時補水。\n集合點不要臨時找早餐。' }
    ],
    routes: [
      {
        id: 'route-demo', title: '示範：壽山短線', garmin_course_id: '123456789',
        garmin_url: 'https://connect.garmin.com/modern/course/123456789',
        original_url: 'https://connect.garmin.com/modern/course/123456789',
        distance_km: 3.3, ascent_m: 70, distance_estimated: true, ascent_estimated: true,
        notes: '示範資料。距離與爬升由本機 GPX 估算，不是從 Garmin 網頁抓取。',
        track: [
          { lat: 22.63, lon: 120.28, ele: 10 },
          { lat: 22.64, lon: 120.28, ele: 40 },
          { lat: 22.65, lon: 120.28, ele: 35 },
          { lat: 22.66, lon: 120.285, ele: 80 }
        ],
        point_count: 4
      }
    ],
    ride_templates: [
      {
        id: 'tpl-sunday', title: '週日晨騎', time: '06:00', time2: '',
        location: '愛河之心｜高雄市苓雅區四維三路2號', location2: '',
        note: '示範範本，選取後不會立刻發布', strava_url: '',
        garmin_url: 'https://connect.garmin.com/modern/course/123456789',
        pace_note: '分組自己騎，不依 FTP 自動分', distance_km: 42, ascent_m: 380,
        distance_estimated: true, ascent_estimated: true, route_id: null,
        max_participants: 20, weather_lat: 22.6273, weather_lng: 120.3014, weather_location_name: '高雄市區'
      }
    ],
    ride_template_groups: [
      { id: 'tg1', template_id: 'tpl-sunday', name: 'A 組', pace_note: '有人輪帶', sort_order: 0 },
      { id: 'tg2', template_id: 'tpl-sunday', name: 'B 組', pace_note: '輕鬆聊天', sort_order: 1 }
    ],
    rides: [
      {
        id: 'ride-next', title: '週日晨騎 壽山環線', category: 'sunday', date: sunday, time: '06:00', time2: '',
        location: '愛河之心｜高雄市苓雅區四維三路2號', location2: '',
        garmin_code: '', note: '分組後各組自己騎', strava_url: '',
        garmin_url: 'https://connect.garmin.com/modern/course/123456789',
        pace_note: '不依 FTP 自動分組', distance_km: 42, ascent_m: 380,
        distance_estimated: true, ascent_estimated: true, route_id: 'route-demo',
        deadline: null, max_participants: 20, weather_lat: 22.6273, weather_lng: 120.3014,
        weather_location_name: '高雄市區', is_finished: false, cancelled: false, created_at: now
      },
      {
        id: 'ride-old', title: '旗津海岸往返', date: day(-7), time: '06:10', time2: '06:40',
        location: '民族路全國電子｜高雄市三民區明誠一路836號',
        location2: '愛河之心｜高雄市苓雅區四維三路2號',
        garmin_code: 'OLD-DEMO', note: '收隊後一起吃早餐', strava_url: '', garmin_url: 'https://connect.garmin.com/modern/course/123456789',
        pace_note: '', distance_km: null, ascent_m: null, distance_estimated: false, ascent_estimated: false,
        deadline: null, max_participants: null, weather_lat: null, weather_lng: null,
        weather_location_name: '', is_finished: true, cancelled: false, created_at: now
      },
      { id: 'ride-a', title: '平日短騎 A', date: day(-5), time: '06:00', location: '愛河之心', garmin_code: 'KEEP-ON-OLD', note: '', is_finished: true, cancelled: false, created_at: now },
      { id: 'ride-b', title: '平日短騎 B', date: day(-4), time: '06:00', location: '愛河之心', garmin_code: '', note: '', is_finished: true, cancelled: false, created_at: now },
      { id: 'ride-c', title: '平日短騎 C', date: day(-2), time: '06:30', location: '愛河之心', garmin_code: '', note: '', is_finished: true, cancelled: false, created_at: now },
      { id: 'ride-oct', title: '十月晨騎', date: day(-20), time: '06:00', location: '壽山', garmin_code: '', note: '', is_finished: true, cancelled: false, created_at: now },
      { id: 'ride-win', title: '窗內舊騎', date: day(-40), time: '06:00', location: '旗津', garmin_code: '', note: '', is_finished: true, cancelled: false, created_at: now },
      { id: 'ride-out', title: '超過八週', date: day(-57), time: '06:00', location: '旗津', garmin_code: '', note: '', is_finished: true, cancelled: false, created_at: now },
      { id: 'ride-cancel', title: '改期取消', date: day(-1), time: '06:00', location: '愛河之心', garmin_code: '', note: '', is_finished: true, cancelled: true, created_at: now },
      { id: 'ride-future', title: '還沒騎', category: 'sunday', date: shiftDate(sunday, 14), time: '06:00', location: '愛河之心', garmin_code: '', note: '', is_finished: false, cancelled: false, created_at: now },
      {
        id: 'ride-wuling', title: '武嶺', category: 'challenge', date: day(180), time: '05:00',
        location: '埔里｜南投縣埔里鎮', garmin_code: '', note: '示範年度挑戰',
        garmin_url: 'https://connect.garmin.com/modern/course/123456789',
        distance_km: 105, ascent_m: 3275, distance_estimated: false, ascent_estimated: false,
        pacing_guide: '前段自己的節奏，坡底不要硬追。',
        supply_points: '20 公里便利商店、山頂補水。',
        cutoff_times: '09:30 過不了中繼就原路下。',
        gear_list: '頭燈、雨衣、備用電。',
        is_finished: false, cancelled: false, created_at: now
      },
      {
        id: 'ride-alishan', title: '阿里山', category: 'challenge', date: day(240), time: '05:30',
        location: '嘉義｜嘉義市', distance_km: 90, ascent_m: 2100,
        garmin_code: '', note: '', is_finished: false, cancelled: false, created_at: now
      },
      {
        id: 'ride-far', title: '合歡山', category: 'challenge', date: day(300), time: '05:00',
        location: '清境｜南投縣仁愛鄉', distance_km: 80, ascent_m: 1800,
        garmin_code: '', note: '示範：比武嶺更晚，不會搶主卡', is_finished: false, cancelled: false, created_at: now
      },
      {
        id: 'ride-monthly', title: '11月檢定', category: 'monthly', date: shiftDate(sunday, 7), time: '06:30',
        location: '愛河之心｜高雄市苓雅區四維三路2號', distance_km: 40, ascent_m: 200,
        garmin_code: '', note: '示範每月檢定', is_finished: false, cancelled: false, created_at: now
      }
    ],
    ride_groups: [
      { id: 'gA', ride_id: 'ride-next', name: 'A 組', pace_note: '有人輪帶，自己的節奏', sort_order: 0 },
      { id: 'gB', ride_id: 'ride-next', name: 'B 組', pace_note: '輕鬆聊天，不追風', sort_order: 1 }
    ],
    registrations: [
      { id: 'reg1', ride_id: 'ride-next', line_user_id: 'u-lin', name: '小林', avatar_url: '', group_id: 'gA' },
      { id: 'reg2', ride_id: 'ride-next', line_user_id: 'u-kevin', name: 'Kevin', avatar_url: '', group_id: 'gA' },
      { id: 'reg3', ride_id: 'ride-next', line_user_id: 'u-momo', name: 'Momo', avatar_url: '', group_id: 'gB' },
      { id: 'reg4', ride_id: 'ride-next', line_user_id: 'u-zhe', name: '阿哲', avatar_url: '', group_id: null },
      { id: 'reg5', ride_id: 'ride-next', line_user_id: 'u-bear', name: '大熊', avatar_url: '', group_id: 'gB' },
      { id: 'reg-me', ride_id: 'ride-next', line_user_id: 'demo-me', name: '阿揚', avatar_url: '', group_id: 'gA' },
      { id: 'reg6', ride_id: 'ride-old', line_user_id: 'u-lin', name: '小林', avatar_url: '', group_id: null },
      { id: 'reg7', ride_id: 'ride-old', line_user_id: 'demo-me', name: '阿揚', avatar_url: '', group_id: null },
      { id: 'reg8', ride_id: 'ride-old', line_user_id: 'u-kevin', name: 'Kevin', avatar_url: '', group_id: null }
    ],
    attendances: [
      { id: 'a-dup', ride_id: 'ride-a', line_user_id: 'demo-me', name: '阿揚', avatar_url: '' },
      { id: 'a-me1', ride_id: 'ride-a', line_user_id: 'demo-me', name: '阿揚', avatar_url: '' },
      { id: 'a-me2', ride_id: 'ride-c', line_user_id: 'demo-me', name: '阿揚', avatar_url: '' },
      { id: 'a-k1', ride_id: 'ride-oct', line_user_id: 'u-kevin', name: 'Kevin', avatar_url: '' },
      { id: 'a-k2', ride_id: 'ride-b', line_user_id: 'u-kevin', name: 'Kevin', avatar_url: '' },
      { id: 'a-z1', ride_id: 'ride-win', line_user_id: 'u-zhe', name: '阿哲', avatar_url: '' },
      { id: 'a-z2', ride_id: 'ride-oct', line_user_id: 'u-zhe', name: '阿哲', avatar_url: '' },
      { id: 'a-z3', ride_id: 'ride-a', line_user_id: 'u-zhe', name: '阿哲', avatar_url: '' },
      { id: 'a-b1', ride_id: 'ride-a', line_user_id: 'u-bear', name: '大熊', avatar_url: '' },
      { id: 'a-b2', ride_id: 'ride-b', line_user_id: 'u-bear', name: '大熊', avatar_url: '' },
      { id: 'a-b3', ride_id: 'ride-c', line_user_id: 'u-bear', name: '大熊', avatar_url: '' },
      { id: 'a-m1', ride_id: 'ride-b', line_user_id: 'u-momo', name: 'Momo', avatar_url: '' },
      { id: 'a-hi1', ride_id: 'ride-cancel', line_user_id: 'u-lin', name: '小林', avatar_url: '' },
      { id: 'a-hi2', ride_id: 'ride-future', line_user_id: 'u-lin', name: '小林', avatar_url: '' },
      { id: 'a-hi3', ride_id: 'ride-out', line_user_id: 'u-lin', name: '小林', avatar_url: '' },
      { id: 'a-p1', ride_id: 'ride-a', line_user_id: 'u-new', name: '新人小陳', avatar_url: '' },
      { id: 'a-old1', ride_id: 'ride-old', line_user_id: 'u-lin', name: '小林', avatar_url: '' },
      { id: 'a-old2', ride_id: 'ride-old', line_user_id: 'demo-me', name: '阿揚', avatar_url: '' },
      { id: 'a-old3', ride_id: 'ride-old', line_user_id: 'u-kevin', name: 'Kevin', avatar_url: '' }
    ]
  }
  if (params.get('scenario') === 'fallback') store.rides = store.rides.filter(r => r.category !== 'challenge')
  let seq = 1
  function Query(table) {
    this.table = table
    this.filters = []
    this.orders = []
    this.op = 'select'
    this.payload = null
    this.one = false
  }
  Query.prototype.eq = function (k, v) { this.filters.push(['eq', k, v]); return this }
  Query.prototype.gt = function (k, v) { this.filters.push(['gt', k, v]); return this }
  Query.prototype.order = function (k, opt) { this.orders.push([k, opt && opt.ascending === false ? -1 : 1]); return this }
  Query.prototype.limit = function () { return this }
  Query.prototype.select = function () { return this }
  Query.prototype.single = function () { this.one = true; return this }
  Query.prototype.insert = function (row) { this.op = 'insert'; this.payload = row; return this }
  Query.prototype.update = function (row) { this.op = 'update'; this.payload = row; return this }
  Query.prototype.delete = function () { this.op = 'delete'; return this }
  Query.prototype.upsert = function (row) { this.op = 'upsert'; this.payload = row; return this }
  Query.prototype.matchRow = function (row) {
    return this.filters.every(([op, k, v]) => op === 'eq' ? row[k] === v : Number(row[k]) > Number(v))
  }
  Query.prototype.run = function () {
    const rows = store[this.table] || []
    if (this.op === 'select') {
      let out = rows.filter(r => this.matchRow(r)).map(r => Object.assign({}, r))
      this.orders.forEach(([k, dir]) => {
        out.sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * dir)
      })
      if (this.one) return { data: out[0] || null, error: null }
      return { data: out, error: null }
    }
    if (this.op === 'insert') {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload]
      if (list.some(item => item && item.source_key && rows.some(r => r.source_key === item.source_key))) {
        return { data: null, error: { code: '23505', message: 'duplicate source_key' } }
      }
      const created = list.map(item => {
        const row = Object.assign({ id: item.id || ('new-' + (seq++)) }, item)
        rows.push(row)
        return row
      })
      store[this.table] = rows
      return { data: Array.isArray(this.payload) ? created : created[0], error: null }
    }
    if (this.op === 'update') {
      rows.forEach(r => { if (this.matchRow(r)) Object.assign(r, this.payload) })
      return { data: null, error: null }
    }
    if (this.op === 'delete') {
      store[this.table] = rows.filter(r => !this.matchRow(r))
      return { data: null, error: null }
    }
    if (this.op === 'upsert') {
      const p = this.payload
      const idx = rows.findIndex(r => p.ride_id && p.line_user_id ? r.ride_id === p.ride_id && r.line_user_id === p.line_user_id : r.id === p.id)
      if (idx >= 0) Object.assign(rows[idx], p)
      else rows.push(Object.assign({ id: 'new-' + (seq++) }, p))
      return { data: null, error: null }
    }
    return { data: null, error: null }
  }
  Query.prototype.then = function (resolve, reject) {
    try { resolve(this.run()) } catch (e) { if (reject) reject(e) }
  }
  return { from(table) { return new Query(table) } }
}

async function init() {
  try {
    if (DEMO) {
      db = createDemoDb()
      myProfile = { line_user_id: 'demo-me', name: '阿揚', avatar_url: '' }
    } else {
      await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0')
      await loadScript('https://static.line-scdn.net/liff/edge/2/sdk.js')
      await liff.init({ liffId: LIFF_ID })
      if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return }
      const profile = await liff.getProfile()
      myProfile = { line_user_id: profile.userId, name: profile.displayName, avatar_url: profile.pictureUrl || '' }
      const token = await refreshLineSession(true)
      if (!token) return
      db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        accessToken: async () => {
          const next = await refreshLineSession(false)
          if (!next) throw new Error('line-auth')
          return next
        }
      })
    }
    const lookup = await readFrom('riders').select('*').eq('line_user_id', myProfile.line_user_id).single()
    const membership = (globalThis.PaceCore && PaceCore.interpretRiderLookup(lookup)) || { kind: lookup && lookup.error ? 'error' : (lookup && lookup.data ? 'member' : 'new') }
    if (membership.kind === 'error') {
      const el = document.querySelector('.loading-text')
      if (el) el.textContent = '載入失敗，請重新整理'
      return
    }
    const me = lookup.data
    myData = me
    if (membership.kind === 'new') { revealPending(false); return }
    if (membership.kind === 'pending') { revealPending(true, me); return }
    await updateLastSeen()
    isAdmin = me.is_admin === true
    document.getElementById('loading').hidden = true
    document.getElementById('app').hidden = false
    const banner = document.getElementById('demo-banner')
    if (banner) banner.hidden = !DEMO
    await probeSchema()
    await loadLocations()
    await loadWeatherLocations()
    await loadRiders()
    await loadRideState()
    await loadRankingContext()
    renderLeaderboard()
    renderNextRide()
    renderMatch()
    renderProfile()
    renderPace()
    if (isAdmin) renderAdmin()
    await renderRides()
    syncChrome()
    const tab = params.get('tab')
    if (tab && document.getElementById('tab-' + tab)) switchTab(tab)
    openRequestedPanel()
  } catch (e) {
    console.error(e)
    const el = document.querySelector('.loading-text')
    if (el) el.textContent = '載入失敗，請重新整理'
  }
}
function revealPending(existing, me) {
  document.getElementById('loading').hidden = true
  const screen = document.getElementById('pending-screen')
  screen.hidden = false
  showPendingForm(existing, me)
}

function showPendingForm(existing, me) {
  const screen = document.getElementById('pending-screen')
  const ftp = me?.ftp || ''
  const weight = me?.weight || ''
  const mood = me?.mood || ''
  const tireWidth = me?.tire_width || ''
  screen.innerHTML = `
    <div class="pending-wrap">
      <div class="pending-mark"><picture class="logo-slot"><source srcset="assets/pace-lockup.webp" type="image/webp"><img class="logo-lockup" src="assets/pace-lockup.png" width="774" height="357" alt="PACE 沛速車隊"></picture></div>
      <h2>${existing ? '審核中' : '申請加入 PACE'}</h2>
      <p class="pending-lead">${existing ? '你的申請正在等待管理員審核，先填好資料，審核通過後立即出現在排行榜。' : '請填寫你的資料，送出後等待管理員審核。'}</p>
      <div class="form-row"><label for="p-ftp">FTP（瓦特）</label><input type="number" id="p-ftp" placeholder="例如 280" value="${esc(ftp)}" oninput="updatePendingPreview()"></div>
      <div class="form-row"><label for="p-weight">體重（kg）</label><input type="number" id="p-weight" placeholder="例如 70" value="${esc(weight)}" oninput="updatePendingPreview()"></div>
      <div class="wkg-preview" id="p-wkg-preview" ${ftp && weight ? '' : 'hidden'}>
        <span id="p-preview-val" class="num">${ftp && weight ? (ftp / weight).toFixed(2) : '—'}</span> W/kg
        <span class="cat-badge" id="p-preview-cat"></span>
      </div>
      <div class="form-row"><label for="p-tire">胎寬</label>
        <select id="p-tire">
          <option value="">請選擇胎寬</option>
          ${[25, 26, 28, 29, 30, 32].map(w => `<option value="${w}" ${String(tireWidth) === String(w) ? 'selected' : ''}>${w}c</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label for="p-mood">心情小語（選填）</label><input type="text" id="p-mood" maxlength="30" value="${esc(mood)}" placeholder="例如：新手上路"></div>
      <button class="save-btn" type="button" onclick="savePendingProfile()">${existing ? '更新資料' : '送出申請'}</button>
      ${existing ? '<p class="pending-sub">審核通過後重新開啟 App 即可使用。</p>' : ''}
    </div>`
  if (ftp && weight) updatePendingPreview()
}
function updatePendingPreview() {
  const ftp = parseInt(document.getElementById('p-ftp').value, 10)
  const weight = parseFloat(document.getElementById('p-weight').value)
  const preview = document.getElementById('p-wkg-preview')
  if (ftp && weight) {
    const v = ftp / weight
    const ct = cat(v)
    document.getElementById('p-preview-val').textContent = v.toFixed(2)
    const badge = document.getElementById('p-preview-cat')
    badge.textContent = ct.label
    badge.className = 'cat-badge ' + ct.cls
    preview.hidden = false
  } else preview.hidden = true
}
async function savePendingProfile() {
  const ftp = parseInt(document.getElementById('p-ftp').value, 10)
  const weight = parseFloat(document.getElementById('p-weight').value)
  if (!ftp || !weight) { showToast('請填寫 FTP 和體重'); return }
  const payload = {
    line_user_id: myProfile.line_user_id,
    name: myProfile.name,
    avatar_url: myProfile.avatar_url,
    ftp, weight,
    tire_width: parseInt(document.getElementById('p-tire').value, 10) || null,
    mood: document.getElementById('p-mood').value.trim(),
    status: 'pending',
    updated_at: new Date().toISOString()
  }
  const { data: existing } = await readFrom('riders').select('id').eq('line_user_id', myProfile.line_user_id).single()
  const res = existing
    ? await db.from('riders').update(payload).eq('id', existing.id)
    : await db.from('riders').insert(Object.assign({}, payload, { last_seen: new Date().toISOString() }))
  if (res.error) { showToast('送出失敗，請再試一次'); return }
  showToast('資料已儲存，等待管理員審核')
}
async function updateLastSeen() {
  await db.from('riders').update({ last_seen: new Date().toISOString() }).eq('id', myData.id)
}
async function loadRiders() {
  const { data } = await readFrom('riders').select('*').eq('status', 'approved').gt('ftp', 0).gt('weight', 0).order('ftp', { ascending: false })
  allRiders = data || []
}
async function loadLocations() {
  const { data } = await db.from('locations').select('*').order('sort_order')
  allLocations = data || []
  renderLocationSelects()
}
async function loadWeatherLocations() {
  const { data } = await db.from('weather_locations').select('*').order('sort_order')
  allWeatherLocations = data || []
  renderWeatherLocationSelect()
}
function renderWeatherLocationSelect() {
  const sel = document.getElementById('ride-weather-location')
  if (!sel) return
  const opts = allWeatherLocations.map(l => `<option value="${esc(l.id)}" data-lat="${esc(l.lat)}" data-lng="${esc(l.lng)}" data-name="${esc(l.name)}">${esc(l.name)}</option>`).join('')
  sel.innerHTML = `<option value="">使用第一集合點天氣</option>${opts}<option value="__custom__">＋ 自訂座標</option>`
}
function handleWeatherLocationChange() {
  const sel = document.getElementById('ride-weather-location')
  const custom = document.getElementById('ride-weather-custom')
  if (sel && custom) custom.hidden = sel.value !== '__custom__'
}
function renderLocationSelects() {
  const opts = allLocations.map(l => `<option value="${esc(l.address)}" data-name="${esc(l.name)}">${esc(l.name)}</option>`).join('')
  const customOpt = '<option value="__custom__">＋ 自訂地點</option>'
  const sel1 = document.getElementById('ride-location1')
  const sel2 = document.getElementById('ride-location2')
  if (sel1) sel1.innerHTML = `<option value="">請選擇集合點</option>${opts}${customOpt}`
  if (sel2) sel2.innerHTML = `<option value="">不設第二集合點</option>${opts}${customOpt}`
}
function handleLocationChange(num) {
  const sel = document.getElementById('ride-location' + num)
  const custom = document.getElementById('ride-location' + num + '-custom')
  if (!sel || !custom) return
  custom.hidden = sel.value !== '__custom__'
  if (!custom.hidden) custom.focus()
}
function getLocationValue(num) {
  const sel = document.getElementById('ride-location' + num)
  if (!sel || !sel.value) return ''
  if (sel.value === '__custom__') return document.getElementById('ride-location' + num + '-custom').value.trim()
  const name = sel.options[sel.selectedIndex].getAttribute('data-name')
  return name + '｜' + sel.value
}

function riderBlock(r, place) {
  const ct = cat(wkg(r))
  const count = r.attendance_count || 0
  const legend = count >= 48 ? ' is-legend' : ''
  const champ = place === 1 ? ' is-champ' : ''
  const mine = isMe(r)
  const placeBg = place === 1 ? '#C026D3' : place === 2 ? '#E62B8A' : '#33C8E8'
  return `<div class="p-person" data-flip="${esc(r.id)}">
    ${place === 1 ? `<div class="crown">${icon('crown', 22)}</div>` : ''}
    <div class="av-ring${legend}${champ}">${avatarHtml(r.avatar_url, r.name, place === 1 ? 84 : 64, r.avatar_url ? '' : placeBg)}</div>
    <div class="p-name">${nameHtml(r)}${mine ? '<span class="me-tag">我</span>' : ''}</div>
    <div class="p-wkg"><span data-tween="${wkg(r).toFixed(2)}" data-digits="2" data-key="pod-${esc(r.id)}">0</span><small>W/kg</small></div>
    <div class="p-meta"><span>${esc(r.ftp)} W</span><span class="cat-badge ${ct.cls}">${ct.label}</span></div>
  </div>`
}
function renderLeaderboard() {
  const prev = lbPainted && currentTab === 'leaderboard' ? captureFlip() : null
  const sorted = sortedRiders()
  const filtered = currentFilter === 'all' ? sorted : sorted.filter(r => cat(wkg(r)).label.startsWith(currentFilter))
  const valid = allRiders.filter(r => r.ftp > 0 && r.weight > 0)
  const avgFtp = valid.length ? Math.round(valid.reduce((s, r) => s + Number(r.ftp), 0) / valid.length) : null
  const avgW = valid.length ? (valid.reduce((s, r) => s + wkg(r), 0) / valid.length) : null
  tweenNumber(document.getElementById('avg-ftp'), avgFtp == null ? NaN : avgFtp, 0)
  tweenNumber(document.getElementById('avg-wkg'), avgW == null ? NaN : avgW, 2)
  tweenNumber(document.getElementById('member-count'), valid.length, 0)
  const today = globalThis.PaceCore ? PaceCore.taipeiDate(new Date()) : taipeiToday()
  const podiumResult = globalThis.PaceCore ? PaceCore.podium({
    today,
    riders: filtered,
    rides: rankingCtx.rides,
    attendances: rankingCtx.attendances
  }) : { top: [], counts: {}, rule: '', emptySlots: 3 }
  const rule = document.getElementById('podium-rule')
  if (rule) rule.textContent = rankingCtx.error ? '出席紀錄暫時讀不到，頒獎台先留空。下面的戰力排名仍依 W/kg，沒有遞補人選。' : (podiumResult.rule || '')
  const slots = rankingCtx.error ? [null, null, null] : [podiumResult.top[1], podiumResult.top[0], podiumResult.top[2]]
  document.getElementById('podium').innerHTML = filtered.length ? slots.map((r, i) => {
    const place = [2, 1, 3][i]
    const base = place === 1 ? 'gold' : place === 2 ? 'silver' : 'bronze'
    if (!r) {
      return `<div class="podium-col place-${place}"><div class="p-person is-empty"><div class="p-name">尚無達標</div><div class="p-meta">沒有第 ${place} 名</div></div><div class="p-base ${base}"><span class="place-num num">${place}</span></div></div>`
    }
    const recent = podiumResult.counts[r.id] || 0
    return `<div class="podium-col place-${place}">${riderBlock(r, place)}<div class="p-recent">近 8 週 ${recent} 次</div><div class="p-base ${base}"><span class="place-num num">${place}</span></div></div>`
  }).join('') : '<div class="empty-state">這個分組還沒有成員</div>'
  renderMonthly(today)
  const rest = filtered
  const ticks = [2.5, 3.2, 4.0].map(v => {
    const left = (v / WKG_SCALE) * 100
    return `<i class="wkg-tick" style="left:${left}%"><span>${v}</span></i>`
  }).join('')
  const list = document.getElementById('rider-list')
  list.classList.toggle('rise', !lbPainted)
  list.innerHTML = rest.length ? rest.map((r, idx) => {
    const rank = idx + 1
    const mine = isMe(r)
    const ct = cat(wkg(r))
    const count = r.attendance_count || 0
    const title = titleBadge(count)
    const pct = Math.max(0, Math.min(100, (wkg(r) / WKG_SCALE) * 100))
    return `<article class="rider-row${mine ? ' is-me' : ''}" data-flip="${esc(r.id)}">
      <div class="rider-top">
        <div class="rank">${rank}</div>
        ${avatarHtml(r.avatar_url, r.name, 40)}
        <div class="rider-info">
          <div class="rider-name">${nameHtml(r)}${mine ? '<span class="me-tag">我</span>' : ''}<span class="cat-badge ${ct.cls}">${ct.label}</span>${title ? `<span class="title-pill">${esc(title)}</span>` : ''}</div>
          <div class="rider-mood">${r.mood ? '「' + esc(r.mood) + '」' : ''}${count > 0 ? `<span class="att-count">${count}次出席</span>` : ''}</div>
        </div>
        <div class="rider-stats">
          <div class="rider-wkg">${wkgStr(r)}<small>W/kg</small></div>
          <div class="rider-ftp">${esc(r.ftp)} W</div>
        </div>
      </div>
      <div class="wkg-track">${ticks}<div class="wkg-fill ${ct.fill}" data-w="${pct.toFixed(1)}"></div></div>
    </article>`
  }).join('') : ''
  const dock = document.getElementById('me-dock')
  const me = myProfile && filtered.find(r => isMe(r))
  const meAll = currentRider()
  if (!meAll || !(meAll.ftp > 0 && meAll.weight > 0)) {
    dock.hidden = true
  } else if (!me) {
    dock.hidden = false
    dock.className = 'me-dock is-out'
    dock.innerHTML = '你不在這個分組'
  } else {
    const rank = filtered.indexOf(me) + 1
    const leader = filtered[0]
    const gap = Math.max(0, Math.round((wkg(leader) - wkg(me)) * Number(me.weight)))
    const ct = cat(wkg(me))
    const gapHtml = rank === 1
      ? '你是第 1 名'
      : gap > 0
        ? '距第 1 名差 <span data-tween="' + gap + '" data-digits="0" data-key="gap">0</span> W'
        : '與第 1 名功率相當'
    dock.hidden = false
    dock.className = 'me-dock'
    dock.innerHTML = `
      <div class="me-rank">#${rank}</div>
      ${avatarHtml(me.avatar_url, me.name, 40)}
      <div class="me-copy">
        <div class="who">你 · ${esc(me.name)} <span class="cat-badge ${ct.cls}">${ct.label}</span></div>
        <div class="gap">${icon('arrow-up', 14)}<span>${gapHtml}</span></div>
      </div>
      <div class="me-wkg">${wkgStr(me)}<small>W/kg</small></div>`
  }
  lbPainted = true
  requestAnimationFrame(() => {
    document.querySelectorAll('.wkg-fill').forEach(el => { el.style.width = (el.dataset.w || '0') + '%' })
    document.querySelectorAll('[data-tween]').forEach(el => tweenNumber(el, el.dataset.tween, Number(el.dataset.digits || 0)))
    playFlip(prev)
  })
}

function renderMatch() {
  const card = document.getElementById('match-me-card')
  const list = document.getElementById('match-list')
  if (!myProfile) return
  const me = allRiders.find(r => isMe(r))
  if (!me) {
    card.innerHTML = '<div>請先到「我的資料」填寫 FTP 和體重</div>'
    list.innerHTML = ''
    return
  }
  card.innerHTML = `${avatarHtml(me.avatar_url, me.name, 52)}<div class="match-me-info"><div class="name">${esc(me.name)}</div><div class="stats">FTP ${esc(me.ftp)}W · ${wkgStr(me)} W/kg · ${cat(wkg(me)).label}</div></div>`
  const ranked = allRiders.filter(r => !isMe(r)).map(r => Object.assign({}, r, { sim: similarity(me, r) })).sort((a, b) => b.sim - a.sim)
  list.innerHTML = ranked.map(r => {
    const simCls = r.sim >= 80 ? 'sim-high' : r.sim >= 60 ? 'sim-mid' : 'sim-low'
    const fDiff = me.ftp - r.ftp
    const wDiff = (wkg(me) - wkg(r)).toFixed(2)
    const adv = fDiff > 0 ? '你 FTP 高出 ' + fDiff + 'W' : fDiff < 0 ? '對方 FTP 高出 ' + Math.abs(fDiff) + 'W' : '勢均力敵'
    return `<article class="match-card">
      <div class="match-header">
        <div class="match-name">${avatarHtml(r.avatar_url, r.name, 32)} ${esc(r.name)}</div>
        <span class="sim-badge ${simCls}">${r.sim}% 相似</span>
      </div>
      <div class="match-stats">
        <div class="match-stat"><div class="val">${esc(r.ftp)}W</div><div class="lbl">FTP</div></div>
        <div class="match-stat"><div class="val">${wkgStr(r)}</div><div class="lbl">W/kg</div></div>
      </div>
      <div class="match-diff">${adv} · W/kg 差距 ${Math.abs(wDiff)}</div>
    </article>`
  }).join('') || '<div class="empty-state">還沒有其他成員可以配對</div>'
}

function zoneModel(values) {
  const vals = ZONE_META.map(z => Number(values[z.key]) || 0)
  if (!vals.some(v => v > 0)) return []
  const increasing = vals.every((v, i) => v > 0 && (i === 0 || v > vals[i - 1]))
  if (increasing) {
    return vals.map((v, i) => {
      const low = i === 0 ? 0 : vals[i - 1]
      return { label: ZONE_META[i].label, color: ZONE_META[i].color, width: Math.max(1, v - low), text: low + '–' + v + 'W' }
    })
  }
  return vals.map((v, i) => v > 0 ? { label: ZONE_META[i].label, color: ZONE_META[i].color, width: 1, text: v + 'W' } : null).filter(Boolean)
}
function paintZones() {
  const host = document.getElementById('zone-visual')
  if (!host) return
  const values = {}
  ZONE_META.forEach(z => {
    const input = document.getElementById(z.key)
    values[z.key] = input ? input.value : (currentRider() || {})[z.key]
  })
  const segments = zoneModel(values)
  const ftpInput = document.getElementById('inp-ftp')
  const ftp = (ftpInput && ftpInput.value) || (currentRider() && currentRider().ftp) || '—'
  if (!segments.length) {
    host.className = 'mini-card'
    host.innerHTML = `<h3>功率區間</h3><div class="empty-state">填寫下方 Z1–Z5 後顯示分布</div>`
    return
  }
  const r = 46
  const circ = 2 * Math.PI * r
  const total = segments.reduce((s, seg) => s + seg.width, 0)
  let cursor = 0
  const circles = segments.map(seg => {
    const len = circ * (seg.width / total)
    const gap = segments.length > 1 ? 3 : 0
    const dash = Math.max(1, len - gap)
    const node = `<circle cx="60" cy="60" r="46" fill="none" stroke="${seg.color}" stroke-width="12" stroke-dasharray="${dash} ${circ - dash}" stroke-dashoffset="${-cursor}" transform="rotate(-90 60 60)"></circle>`
    cursor += len
    return node
  }).join('')
  host.className = 'mini-card'
  host.innerHTML = `<h3>功率區間</h3>
    <div class="donut-wrap">
      <svg class="donut-svg" viewBox="0 0 120 120">${circles}</svg>
      <div class="donut-center"><div><b>${esc(ftp)}</b><small>FTP 瓦</small></div></div>
    </div>
    <div class="zone-legend">${segments.map(seg => `<div><span><i class="swatch" style="background:${seg.color}"></i>${esc(seg.label)}</span><span>${esc(seg.text)}</span></div>`).join('')}</div>`
}
function renderProfile() {
  if (!myProfile) return
  const me = currentRider()
  const count = me?.attendance_count || 0
  const title = titleBadge(count)
  const legend = count >= 48
  document.getElementById('profile-hero').innerHTML = `
    <div class="profile-id">
      <div class="av-ring${legend ? ' is-legend' : ''}">${avatarHtml(myProfile.avatar_url, myProfile.name, 72)}</div>
      <div>
        <div class="profile-name">${nameHtml(me || { name: myProfile.name, attendance_count: count, name_color: me?.name_color })}</div>
        <div class="badge-row">
          ${me && me.ftp && me.weight ? `<span class="cat-badge ${cat(wkg(me)).cls}">${cat(wkg(me)).label}</span>` : ''}
          ${title ? `<span class="title-pill">${esc(title)}</span>` : ''}
        </div>
        ${me && me.mood ? `<div class="mood-line">${icon('quote', 14)}<span>${esc(me.mood)}</span></div>` : '<div class="profile-line"></div>'}
      </div>
    </div>`
  const stats = document.getElementById('profile-stats')
  if (me && me.ftp && me.weight) {
    const sorted = sortedRiders()
    const rank = sorted.findIndex(r => isSameRider(r, me)) + 1
    stats.innerHTML = `<div class="stat-3">
      <div class="stat-tile"><div class="stat-lbl">W/KG</div><div class="stat-val">${wkgStr(me)}</div></div>
      <div class="stat-tile"><div class="stat-lbl">隊內排名</div><div class="stat-val">#${rank}<span class="unit">/${sorted.length}</span></div></div>
      <div class="stat-tile"><div class="stat-lbl">總出席</div><div class="stat-val">${count}<span class="unit">次</span></div></div>
    </div>`
  } else stats.innerHTML = ''
  const progress = document.getElementById('attendance-progress')
  progress.className = 'mini-card'
  const next = MILESTONES.find(m => count < m.at)
  const goal = next ? next.at : 48
  const pct = next ? Math.max(0, Math.min(1, count / next.at)) : 1
  const radius = 48
  const circ = 2 * Math.PI * radius
  const offset = circ * (1 - pct)
  progress.innerHTML = `<h3>出席里程碑</h3>
    <div class="ring-wrap">
      <svg class="ring-svg" viewBox="0 0 120 120">
        <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FF4FA3"/><stop offset="100%" stop-color="#9B7BFF"/></linearGradient></defs>
        <circle class="ring-bg" cx="60" cy="60" r="${radius}"></circle>
        <circle class="ring-fg" cx="60" cy="60" r="${radius}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 60 60)"></circle>
      </svg>
      <div class="ring-center"><div><b>${count}</b><small>${next ? '/ ' + goal + ' 次' : '已達成'}</small></div></div>
    </div>
    <div class="mile-note">${next ? '再 ' + (next.at - count) + ' 次達成' + next.label : '已達成 PACE 傳奇'}</div>`
  const unlocked = BADGES.filter(b => count >= b.min).length
  document.getElementById('badge-wall').innerHTML = `<section class="card">
    <div class="badge-head"><h2 class="section-title">徽章牆</h2><span>${unlocked} / ${BADGES.length} 已解鎖</span></div>
    <div class="hex-grid">${BADGES.map((b, i) => {
      const on = count >= b.min
      return `<div class="hex ${on ? 'b' + i : 'locked'}">${icon(on ? b.icon : 'lock', 16)}<span>${esc(b.name)}</span></div>`
    }).join('')}</div>
  </section>`
  document.getElementById('admin-entry').innerHTML = isAdmin
    ? `<button class="admin-entry" type="button" data-act="tab" data-tab="admin"><span class="left">${icon('shield', 18)}成員管理</span><span class="go-next">${icon('chevron-left', 16)}</span></button>`
    : ''
  if (me) {
    document.getElementById('inp-ftp').value = me.ftp || ''
    document.getElementById('inp-weight').value = me.weight || ''
    document.getElementById('inp-mood').value = me.mood || ''
    if (me.tire_width) document.getElementById('inp-tire').value = me.tire_width
    ;['z1', 'z2', 'z3', 'z4', 'z5'].forEach(id => { if (me[id]) document.getElementById(id).value = me[id] })
    updatePreview()
    const colorSection = document.getElementById('color-picker-section')
    colorSection.hidden = count < 10
    if (count >= 10) {
      document.getElementById('inp-name-color').value = safeHex(me.name_color) || '#ffffff'
      updateColorPreview()
    }
  }
  paintZones()
}
function updateColorPreview() {
  const color = safeHex(document.getElementById('inp-name-color').value) || '#ffffff'
  const preview = document.getElementById('color-preview-text')
  const count = currentRider()?.attendance_count || 0
  preview.style.color = color
  preview.style.textShadow = count >= 20 ? '0 0 8px ' + color : 'none'
  preview.textContent = myProfile ? myProfile.name : '預覽文字'
}
function updatePreview() {
  const ftp = parseInt(document.getElementById('inp-ftp').value, 10)
  const weight = parseFloat(document.getElementById('inp-weight').value)
  const preview = document.getElementById('wkg-preview')
  if (ftp && weight) {
    const v = ftp / weight
    const ct = cat(v)
    document.getElementById('preview-val').textContent = v.toFixed(2)
    const badge = document.getElementById('preview-cat')
    badge.textContent = ct.label
    badge.className = 'cat-badge ' + ct.cls
    preview.hidden = false
  } else preview.hidden = true
}
async function saveProfile() {
  if (savingProfile) return
  if (!myProfile) { showToast('請先登入 LINE'); return }
  const ftp = parseInt(document.getElementById('inp-ftp').value, 10)
  const weight = parseFloat(document.getElementById('inp-weight').value)
  if (!ftp || !weight) { showToast('請填寫 FTP 和體重'); return }
  const me = currentRider()
  const count = me?.attendance_count || 0
  const payload = {
    name: myProfile.name,
    avatar_url: myProfile.avatar_url,
    ftp, weight,
    tire_width: parseInt(document.getElementById('inp-tire').value, 10) || null,
    mood: document.getElementById('inp-mood').value.trim(),
    name_color: count >= 10 ? (safeHex(document.getElementById('inp-name-color').value) || '') : (me?.name_color || ''),
    z1: parseInt(document.getElementById('z1').value, 10) || 0,
    z2: parseInt(document.getElementById('z2').value, 10) || 0,
    z3: parseInt(document.getElementById('z3').value, 10) || 0,
    z4: parseInt(document.getElementById('z4').value, 10) || 0,
    z5: parseInt(document.getElementById('z5').value, 10) || 0,
    updated_at: new Date().toISOString()
  }
  const prevRiders = allRiders.map(r => Object.assign({}, r))
  const prevData = myData ? Object.assign({}, myData) : null
  const idx = allRiders.findIndex(r => isMe(r))
  if (idx >= 0) allRiders[idx] = Object.assign({}, allRiders[idx], payload)
  myData = Object.assign({}, myData || {}, payload)
  renderLeaderboard(); renderMatch(); renderProfile(); renderPace()
  showToast('儲存中…')
  savingProfile = true
  const { error } = await db.from('riders').update(payload).eq('id', myData.id)
  savingProfile = false
  if (error) {
    allRiders = prevRiders
    myData = prevData
    renderLeaderboard(); renderMatch(); renderProfile(); renderPace()
    showToast('儲存失敗，已還原')
    return
  }
  showToast('資料更新成功')
  await loadRiders()
  renderLeaderboard(); renderMatch(); renderProfile()
}

function getSuggestedIntensity(hours) {
  const keys = Object.keys(RIDE_INTENSITY_MAP).map(Number).sort((a, b) => a - b)
  let closest = keys[0]
  let minDiff = Math.abs(hours - keys[0])
  for (const k of keys) {
    const diff = Math.abs(hours - k)
    if (diff < minDiff) { minDiff = diff; closest = k }
  }
  return RIDE_INTENSITY_MAP[closest]
}
function tireCard(title, cls, data) {
  return `<div class="tire-card ${cls}"><div class="tire-card-title">${title}</div><div class="tire-wheel-row">
    <div class="tire-wheel"><div class="tire-wheel-label">前輪</div><div class="tire-psi">${data.front.low}</div><div class="tire-psi-range">~${data.front.high} psi</div></div>
    <div class="tire-wheel"><div class="tire-wheel-label">後輪</div><div class="tire-psi">${data.rear.low}</div><div class="tire-psi-range">~${data.rear.high} psi</div></div>
  </div></div>`
}
async function renderPace() {
  const me = currentRider()
  const weight = me?.weight
  const tireWidth = me?.tire_width
  const pressure = calcTirePressure(weight, tireWidth)
  const tireDisplay = document.getElementById('tire-pressure-display')
  if (!pressure) tireDisplay.innerHTML = '<div class="tire-setup-hint">請至「我的資料」填寫體重和胎寬</div>'
  else tireDisplay.innerHTML = `<div class="center"><span class="tire-width-badge">${esc(tireWidth)}c · ${esc(weight)}kg</span></div><div class="tire-grid">${tireCard('TUBELESS', 'tubeless', pressure.tubeless)}${tireCard('OPEN 胎', 'open', pressure.open)}</div>`
  const { data: guidelines } = await db.from('guidelines').select('*').order('sort_order')
  guidelineCache = guidelines || []
  document.getElementById('guidelines-list').innerHTML = guidelineCache.map((g, i) => `
    <div class="guideline-item">
      <button class="guideline-header" type="button" data-act="guideline" data-i="${i}">
        <span class="guideline-title">${esc(g.category)}</span>
        <span class="guideline-arrow" id="arrow-${i}">${icon('chevron-down', 16)}</span>
      </button>
      <div class="guideline-body" id="guideline-body-${i}">${esc(g.content)}</div>
    </div>`).join('') || '<div class="empty-state">尚未建立團規</div>'
  updateNutrition()
}
function toggleGuideline(i) {
  const body = document.getElementById('guideline-body-' + i)
  const arrow = document.getElementById('arrow-' + i)
  if (!body || !arrow) return
  body.classList.toggle('open')
  arrow.classList.toggle('open')
}
function updateNutrition() {
  const box = document.getElementById('nutrition-result')
  if (!box) return
  const me = currentRider()
  const weight = me?.weight
  const ftp = me?.ftp
  if (!weight || !ftp) {
    box.innerHTML = '<div class="tire-setup-hint">請至「我的資料」填寫 FTP 和體重</div>'
    return
  }
  const hours = parseFloat(document.getElementById('ride-hours').value)
  const intensity = parseInt(document.getElementById('ride-intensity').value, 10)
  document.getElementById('ride-hours-display').textContent = hours + 'hr'
  document.getElementById('ride-intensity-display').textContent = intensity + '%'
  const suggested = getSuggestedIntensity(hours)
  const suggEl = document.getElementById('ftp-suggestion')
  if (Math.abs(intensity - suggested) <= 2) suggEl.textContent = '建議配速'
  else if (intensity > suggested) suggEl.textContent = '高於建議，注意後段掉速'
  else suggEl.textContent = '保守配速，適合新手'
  const power = Math.round(ftp * intensity / 100)
  const totalKJ = Math.round(power * hours * 3600 / 1000)
  const totalKcal = totalKJ
  const carbPerHour = weight >= 70 ? 65 : 60
  const totalCarbKcal = Math.round(carbPerHour * 4 * hours)
  const post30Carb = Math.round(weight * 0.8)
  const post30Protein = Math.round(weight * 0.3)
  const post30Kcal = Math.round(post30Carb * 4 + post30Protein * 4)
  const remainingKcal = Math.max(0, totalKcal - totalCarbKcal - post30Kcal)
  const preCarb = Math.round(weight * 1)
  box.innerHTML = `
    <div class="nut-summary">
      <div class="nut-line"><span>功率</span><b>${power}W（FTP ${intensity}%）</b></div>
      <div class="nut-line"><span>預估總消耗</span><b>${totalKcal.toLocaleString()} kcal</b></div>
    </div>
    <section class="nut-block">
      <h3>${icon('flag', 15)}出發前</h3>
      <div class="nut-line"><span>出發前 3-4 小時</span><b>正常含碳水正餐</b></div>
      <div class="nut-line"><span>出發前 1 小時</span><b>${preCarb}g 簡單碳水</b></div>
    </section>
    <section class="nut-block">
      <h3>${icon('bike', 15)}騎乘中（每小時）</h3>
      <div class="nut-line"><span>消耗</span><b>${Math.round(totalKcal / hours)} kcal</b></div>
      <div class="nut-line hi"><span>建議補充碳水</span><b>${carbPerHour}g（少量多次）</b></div>
      <div class="nut-line"><span>補水</span><b>500-750 ml</b></div>
      <div class="nut-line"><span>鈉</span><b>400-600 mg</b></div>
    </section>
    <section class="nut-block">
      <h3>${icon('activity', 15)}騎乘後</h3>
      <div class="nut-line"><span>騎乘中補回</span><b>${totalCarbKcal} kcal</b></div>
      <div class="nut-line hi"><span>結束後 30 分鐘內</span><b>碳水 ${post30Carb}g + 蛋白質 ${post30Protein}g</b></div>
      <div class="nut-line warn"><span>剩餘能量缺口</span><b>${remainingKcal.toLocaleString()} kcal</b></div>
      <div class="nut-note">好好吃一頓正餐把缺口補回來</div>
    </section>`
}

function splitLoc(raw) {
  const text = String(raw || '')
  const parts = text.split('｜')
  if (parts.length > 1) return { name: parts[0], addr: parts.slice(1).join('｜') }
  return { name: text, addr: '' }
}
function formatRideDate(dateStr) {
  const [y, m, d] = String(dateStr || '').split('-').map(Number)
  if (!y || !m || !d) return ''
  const dt = new Date(Date.UTC(y, m - 1, d))
  return m + '/' + d + '（' + '日一二三四五六'[dt.getUTCDay()] + '）'
}
function rideStartMs(date, time) {
  if (!date) return NaN
  const t = time && String(time).length >= 4 ? String(time).slice(0, 5) : '00:00'
  return new Date(date + 'T' + t + ':00+08:00').getTime()
}
function firstNum(row, keys) {
  for (const key of keys) {
    if (row[key] == null || row[key] === '') continue
    const n = Number(row[key])
    if (Number.isFinite(n)) return n
  }
  return null
}
function routeBits(r) {
  const dist = firstNum(r, ['distance_km', 'distance'])
  const ele = firstNum(r, ['elevation_m', 'elevation'])
  const speed = firstNum(r, ['avg_speed'])
  const duration = r.duration || r.estimated_time || ''
  const stats = []
  if (dist != null) stats.push({ icon: 'route', val: String(dist), unit: 'km', label: '距離' })
  if (ele != null) stats.push({ icon: 'mountain', val: String(ele), unit: 'm', label: '爬升' })
  if (speed != null) stats.push({ icon: 'gauge', val: String(speed), unit: 'km/h', label: '均速' })
  if (duration) stats.push({ icon: 'timer', val: String(duration), unit: '', label: '時間' })
  let chart = ''
  if (Array.isArray(r.elevation_profile) && r.elevation_profile.length > 1) {
    const nums = r.elevation_profile.map(Number).filter(n => Number.isFinite(n))
    if (nums.length > 1) {
      const min = Math.min.apply(null, nums)
      const max = Math.max.apply(null, nums)
      const span = max - min || 1
      const w = 320
      const h = 80
      const pts = nums.map((n, i) => {
        const x = (i / (nums.length - 1)) * w
        const y = h - ((n - min) / span) * (h - 8) - 4
        return x.toFixed(1) + ',' + y.toFixed(1)
      }).join(' ')
      chart = `<svg class="elev" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}"></polyline></svg>`
    }
  }
  return { stats, chart }
}
function locRow(label, time, loc) {
  if (!loc || !loc.name) return ''
  const q = loc.addr || loc.name
  const when = time ? ' · ' + esc(String(time).slice(0, 5)) : ''
  return `<div class="loc-row">
    <div>
      <div class="loc-kicker">${icon('flag', 14)}${label}${when}</div>
      <div class="loc-name">${esc(loc.name)}</div>
      ${loc.addr && loc.addr !== loc.name ? `<div class="loc-addr">${esc(loc.addr)}</div>` : ''}
    </div>
    <a class="nav-go" href="${esc('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q))}" target="_blank" rel="noopener noreferrer" aria-label="導航">${icon('navigation', 22)}</a>
  </div>`
}
function rideCardHtml(r, ctx) {
  const loc1 = splitLoc(r.location)
  const loc2 = splitLoc(r.location2)
  const rideRegs = ctx.regs
  const isRegistered = ctx.mine
  const isFull = r.max_participants && rideRegs.length >= r.max_participants
  const isPastDeadline = r.deadline && new Date(r.deadline) < new Date()
  const view = ctx.weather ? weatherView(ctx.weather.code) : weatherView(1)
  const tone = ctx.weather ? view.tone : 'wx-none'
  const temp = ctx.weather ? `<div class="wx-temp">${Math.round(ctx.weather.maxTemp)}°<small>低溫 ${Math.round(ctx.weather.minTemp)}°</small></div>` : ''
  const chips = []
  if (ctx.weather) {
    chips.push(`<span class="chip">${icon('droplets', 14)}降雨 ${esc(ctx.weather.rainProb)}%</span>`)
    if (ctx.weather.windSpeed != null) {
      const dir = compass(ctx.weather.windDir)
      const rot = ctx.weather.windDir == null ? 0 : (Number(ctx.weather.windDir) + 180) % 360
      chips.push(`<span class="chip"><span class="wind-arrow" style="transform:rotate(${rot}deg)">${icon('arrow-up', 14)}</span>${dir ? esc(dir) + ' ' : ''}${Math.round(ctx.weather.windSpeed)} km/h</span>`)
    }
    if (ctx.aqi != null) {
      const aq = getAqiDescription(ctx.aqi)
      chips.push(`<span class="chip"><i class="dot" style="background:${aq.color}"></i>AQI ${esc(ctx.aqi)} ${esc(aq.label)}</span>`)
    }
  }
  const start = rideStartMs(r.date, r.time)
  let countdown = ''
  if (r.is_finished) countdown = '<div class="cd-past">這場團騎已結束</div>'
  else if (Number.isFinite(start) && start <= Date.now()) countdown = '<div class="cd-past">已出發</div>'
  else if (Number.isFinite(start)) {
    countdown = `<div class="cd-grid" data-countdown="${start}">
      <div class="cd-cell"><b data-part="d">00</b><span>天</span></div>
      <div class="cd-cell"><b data-part="h">00</b><span>時</span></div>
      <div class="cd-cell"><b data-part="m">00</b><span>分</span></div>
      <div class="cd-cell"><b data-part="s">00</b><span>秒</span></div>
    </div>`
  }
  const bits = routeBits(r)
  const statHtml = bits.stats.length ? `<div class="stat-strip">${bits.stats.map(s => `<div class="cell"><div class="val">${esc(s.val)}${s.unit ? '<small>' + esc(s.unit) + '</small>' : ''}</div><div class="lbl">${s.label}</div></div>`).join('')}</div>` : ''
  const routes = []
  const strava = safeUrl(r.strava_url)
  const garminUrl = safeUrl(r.garmin_url)
  if (strava) routes.push(`<a class="route-btn strava" href="${strava}" target="_blank" rel="noopener noreferrer">${icon('route', 16)}Strava 路線</a>`)
  if (garminUrl || r.garmin_code) {
    const code = r.garmin_code ? `<code>${esc(r.garmin_code)}</code>` : 'Garmin'
    if (garminUrl) routes.push(`<a class="route-btn garmin" href="${garminUrl}" target="_blank" rel="noopener noreferrer">${icon('link', 16)}${code}</a>`)
    else routes.push(`<button class="route-btn garmin" type="button" data-act="copy" data-code="${esc(r.garmin_code)}">${icon('copy', 16)}${code}</button>`)
  }
  const max = r.max_participants
  const capPct = max ? Math.min(100, Math.round(rideRegs.length / max * 100)) : 0
  const avatars = rideRegs.slice(0, 8).map(reg => avatarHtml(reg.avatar_url, reg.name, 28)).join('')
  const more = rideRegs.length > 8 ? `<span class="reg-more">+${rideRegs.length - 8}</span>` : ''
  const squads = ctx.squads || []
  const myReg = ctx.myReg || null
  let squadHtml = ''
  if (squads.length) {
    const loose = rideRegs.filter(reg => !squads.some(g => g.id === reg.group_id))
    squadHtml = `<div class="group-board">${squads.map(g => {
      const people = rideRegs.filter(reg => reg.group_id === g.id)
      return `<div class="group-block"><div><b>${esc(g.name)}</b><div class="field-help">${esc(g.pace_note || '組別說明未填')}</div><div class="group-people">${people.length ? people.map(p => esc(p.name)).join('、') : '這組還沒有人'}</div></div><span>${people.length} 人</span></div>`
    }).join('')}${loose.length ? `<div class="group-block"><div><b>未分組</b><div class="group-people">${loose.map(p => esc(p.name)).join('、')}</div></div><span>${loose.length} 人</span></div>` : ''}</div>`
  }
  let regAction = ''
  if (r.cancelled) regAction = `<div class="reg-full">這場已取消</div>`
  else if (isFull && !isRegistered) regAction = `<div class="reg-full">報名已滿</div>`
  else if (isPastDeadline && !isRegistered) regAction = `<div class="reg-full">報名已截止</div>`
  else if (isRegistered) {
    const joined = squads.find(g => myReg && g.id === myReg.group_id)
    regAction = `<div class="reg-status">已報名${joined ? ' · ' + esc(joined.name) : ' · 未分組'}</div><button class="reg-btn registered" type="button" data-act="reg" data-id="${esc(r.id)}" data-on="1">${icon('check', 16)}取消報名</button>`
  } else {
    const select = squads.length ? `<label class="field-help" for="reg-group-${esc(r.id)}">組別（選填，不會依 FTP 自動分）</label><select id="reg-group-${esc(r.id)}"><option value="">不指定組別</option>${squads.map(g => `<option value="${esc(g.id)}">${esc(g.name)}${g.pace_note ? ' · ' + esc(g.pace_note) : ''}</option>`).join('')}</select>` : ''
    regAction = `${select}<button class="reg-btn" type="button" data-act="reg" data-id="${esc(r.id)}" data-on="0">${icon('plus', 16)}我要報名</button>`
  }
  const announceBtn = `<button class="edit-btn" type="button" data-act="announce" data-id="${esc(r.id)}">${icon('send', 14)}公告預覽</button>`
  const admin = isAdmin ? `<div class="ride-admin-row">
      <button class="edit-btn" type="button" data-act="edit-ride" data-id="${esc(r.id)}">${icon('pencil', 14)}編輯</button>
      <button class="edit-btn" type="button" data-act="attend-panel" data-id="${esc(r.id)}">${icon('users', 14)}出席審核</button>
      <button class="edit-btn" type="button" data-act="finish" data-id="${esc(r.id)}" data-finished="${r.is_finished ? '0' : '1'}">${r.is_finished ? '重新開啟' : '標記結束'}</button>
      <button class="edit-btn" type="button" data-act="cancel-ride" data-id="${esc(r.id)}" data-cancelled="${r.cancelled ? '0' : '1'}">${r.cancelled ? '恢復這場' : '標記取消'}</button>
      <button class="delete-btn" type="button" data-act="del-ride" data-id="${esc(r.id)}">${icon('trash-2', 14)}刪除</button>
    </div>
    <div id="attendance-panel-${esc(r.id)}" hidden></div>
    <div id="edit-ride-form-${esc(r.id)}"></div>` : ''
  return `<article class="ride-card${r._optimistic ? ' is-pending' : ''}${r.cancelled ? ' is-cancelled' : ''}" id="${esc(ctx.domId || ('ride-' + r.id))}">
    <div class="wx-card ${tone}">
      <div class="waves"></div>
      <div class="wx-body">
        <div class="wx-top">
          <div>
            <div class="wx-kicker">${icon(ctx.weather ? view.icon : 'cloud', 16)}${ctx.weather ? esc(view.name) + (view.tip ? ' · ' + esc(view.tip) : '') : '團騎'}</div>
            <div class="wx-title">${esc(r.title)}</div>
            <div class="wx-when"><span>${icon('calendar', 14)}${formatRideDate(r.date)}</span>${r.time ? `<span>${icon('clock', 14)}${esc(String(r.time).slice(0, 5))} 集合</span>` : ''}</div>
          </div>
          ${temp}
        </div>
        ${chips.length ? `<div class="wx-chips">${chips.join('')}</div>` : ''}
      </div>
    </div>
    <div class="cd-block">
      <div class="cd-label"><span>距離出發</span><span>${esc(loc1.name || '')}</span></div>
      ${countdown}
    </div>
    ${bits.chart}
    ${statHtml}
    ${locRow('第一集合點', r.time, loc1)}
    ${r.location2 ? locRow('第二集合點', r.time2, loc2) : ''}
    ${routes.length ? `<div class="route-row">${routes.join('')}</div>` : ''}
    ${r.note ? `<div class="ride-note">${icon('info', 14)}<span>${esc(r.note)}</span></div>` : ''}
    ${paceLine(r)}
    ${challengeBrief(r)}
    ${squadHtml}
    ${ctx.group || ''}
    <div class="registration-section">
      <div class="cap-top"><span>已報名</span><b>${rideRegs.length}${max ? ' / ' + esc(max) : ''}</b><span>人</span></div>
      ${max ? `<div class="cap-bar"><div style="width:${capPct}%"></div></div>` : ''}
      ${avatars ? `<div class="reg-avatars">${avatars}${more}</div>` : ''}
      ${regAction}
      ${announceBtn}
      ${r.deadline ? `<div class="reg-deadline">截止時間：${esc(new Date(r.deadline).toLocaleString('zh-TW'))}</div>` : ''}
      ${admin}
    </div>
  </article>`
}
function paceLine(r) {
  if (!r || !r.pace_note) return ''
  return `<div class="ride-note">${icon('gauge', 14)}<span>${esc(r.pace_note)}</span></div>`
}
function challengeBrief(r) {
  if (!globalThis.PaceCore || PaceCore.normalizeCategory(r.category) !== 'challenge') return ''
  const rows = [
    ['配速建議', r.pacing_guide],
    ['補給點', r.supply_points],
    ['關門時間', r.cutoff_times],
    ['裝備清單', r.gear_list]
  ].filter(([, value]) => String(value || '').trim())
  if (!rows.length) return ''
  return `<section class="challenge-brief"><h3>年度挑戰</h3>${rows.map(([label, value]) => `<div><b>${label}</b><p>${esc(value)}</p></div>`).join('')}</section>`
}
async function renderRides() {
  const list = document.getElementById('ride-list')
  if (!ridesReady) list.innerHTML = '<div class="skel lg"></div><div class="skel lg"></div><div class="skel md"></div>'
  await loadRideState()
  if (rideState.ridesError && !(rideState.rides || []).length) { list.innerHTML = '<div class="empty-state">無法載入團騎</div>'; return }
  const rides = rideState.rides || []
  const finishedRides = rides.filter(r => r.is_finished && !r.cancelled)
  const totalRides = finishedRides.length
  const totalAttendances = (rideState.atts || []).length
  const myAttendances = currentRider()?.attendance_count || 0
  const statsHtml = `<div class="ride-stats-card"><div class="ride-stats-title">${icon('bike', 16)}PACE 團騎統計</div><div class="ride-stats-grid">
    <div class="ride-stat"><div class="val">${totalRides}</div><div class="lbl">總團騎次數</div></div>
    <div class="ride-stat"><div class="val">${totalAttendances}</div><div class="lbl">總出席人次</div></div>
    <div class="ride-stat"><div class="val">${myAttendances}</div><div class="lbl">我的出席</div></div>
  </div></div>`
  if (!rides.length) {
    ridesReady = true
    list.innerHTML = statsHtml + '<div class="empty-state">目前沒有團騎公告</div>'
    return
  }
  const allRegs = rideState.regs || []
  const allAtts = rideState.atts || []
  const cards = await Promise.all(rides.map(async r => {
    const loc = splitLoc(r.location)
    let lat = r.weather_lat
    let lng = r.weather_lng
    if (!lat || !lng) {
      const wLoc = allWeatherLocations.find(l => l.name === '高雄市區')
      if (wLoc) { lat = wLoc.lat; lng = wLoc.lng }
    }
    let weather = null
    let aqi = null
    if (lat && lng && r.date) {
      const pair = await Promise.all([fetchWeather(lat, lng, r.date), fetchAqi(lat, lng, r.date)])
      weather = pair[0]
      aqi = pair[1]
    }
    const rideRegs = (allRegs || []).filter(reg => reg.ride_id === r.id)
    const rideAtts = (allAtts || []).filter(att => att.ride_id === r.id)
    let group = ''
    if (rideAtts.length) {
      const attRiders = rideAtts.map(riderForAttendance).filter(Boolean)
      if (attRiders.length) {
        const avg = attRiders.reduce((s, rr) => s + wkg(rr), 0) / attRiders.length
        const speeds = calcGroupSpeed(avg)
        if (!speeds) return rideCardHtml(r, { regs: rideRegs, mine: myRegByRide.has(r.id), myReg: myRegByRide.get(r.id), squads: (rideState.groups || []).filter(g => g.ride_id === r.id), weather, aqi, group: '', loc })
        group = `<div class="group-stats-card"><div class="group-stats-title">${icon('activity', 14)}當天出席戰力分析</div><div class="group-stats-grid">
          <div class="group-stat"><div class="val">${attRiders.length}</div><div class="lbl">出席人數</div></div>
          <div class="group-stat"><div class="val">${avg.toFixed(2)}</div><div class="lbl">平均 W/kg</div></div>
          <div class="group-stat"><div class="val">${speeds.group}</div><div class="lbl">集團巡航 km/h</div></div>
        </div></div>`
      }
    }
    return rideCardHtml(r, { regs: rideRegs, mine: myRegByRide.has(r.id), myReg: myRegByRide.get(r.id), squads: (rideState.groups || []).filter(g => g.ride_id === r.id), weather, aqi, group, loc })
  }))
  const activeIdx = rides.map((r, i) => ({ r, i })).filter(x => !x.r.is_finished && !x.r.cancelled)
  activeIdx.sort((a, b) => String(a.r.date).localeCompare(String(b.r.date)) || String(a.r.time || '').localeCompare(String(b.r.time || '')))
  const activeCards = activeIdx.map(x => cards[x.i])
  const finishedCards = cards.filter((_, i) => rides[i].is_finished || rides[i].cancelled)
  const finishedSection = finishedCards.length ? `<div class="finished-section">
    <button class="finished-header" type="button" data-act="toggle-finished"><span>已結束或取消（${finishedCards.length}）</span><span id="finished-arrow">${icon('chevron-down', 16)}</span></button>
    <div id="finished-list" hidden>${finishedCards.join('')}</div>
  </div>` : ''
  const first = !ridesReady
  ridesReady = true
  list.innerHTML = statsHtml + activeCards.join('') + finishedSection
  list.classList.toggle('rise', first)
  renderNextRide()
  tickCountdowns()
}
function tickCountdowns() {
  document.querySelectorAll('[data-countdown]').forEach(el => {
    const target = Number(el.dataset.countdown)
    if (!Number.isFinite(target)) return
    let diff = Math.max(0, target - Date.now())
    const total = Math.floor(diff / 1000)
    const map = {
      d: String(Math.floor(total / 86400)).padStart(2, '0'),
      h: String(Math.floor((total % 86400) / 3600)).padStart(2, '0'),
      m: String(Math.floor((total % 3600) / 60)).padStart(2, '0'),
      s: String(total % 60).padStart(2, '0')
    }
    el.querySelectorAll('[data-part]').forEach(n => { n.textContent = map[n.dataset.part] })
  })
}
function showEditRideForm(rideId) {
  const formEl = document.getElementById('edit-ride-form-' + rideId)
  if (!formEl) return
  if (!formEl.hidden && formEl.innerHTML) { formEl.innerHTML = ''; return }
  db.from('rides').select('*').eq('id', rideId).single().then(({ data: r }) => {
    if (!r) return
    const opts = allWeatherLocations.map(l => `<option value="${esc(l.id)}" data-lat="${esc(l.lat)}" data-lng="${esc(l.lng)}" data-name="${esc(l.name)}" ${r.weather_location_name === l.name ? 'selected' : ''}>${esc(l.name)}</option>`).join('')
    formEl.innerHTML = `<div class="edit-panel"><h3>編輯公告</h3>
      <div class="form-row"><label>活動標題</label><input type="text" id="edit-title-${esc(rideId)}" value="${esc(r.title)}"></div>
      <div class="form-row"><label>日期</label><input type="date" id="edit-date-${esc(rideId)}" value="${esc(r.date)}"></div>
      <div class="form-row"><label>第一集合點時間</label><input type="time" id="edit-time-${esc(rideId)}" value="${esc(r.time || '')}"></div>
      <div class="form-row"><label>第二集合點時間</label><input type="time" id="edit-time2-${esc(rideId)}" value="${esc(r.time2 || '')}"></div>
      <div class="form-row"><label>這一場的 GroupRide 代碼（可稍後再補，不會沿用別場）</label><input type="text" id="edit-garmin-${esc(rideId)}" value="${esc(r.garmin_code || '')}"></div>
      <div class="form-row"><label>配速說明</label><input type="text" id="edit-pace-${esc(rideId)}" value="${esc(r.pace_note || '')}"></div>
      ${schemaCaps.category ? `<div class="form-row"><label>團騎類型</label><select id="edit-category-${esc(rideId)}">
        <option value="sunday" ${(!r.category || r.category === 'sunday') ? 'selected' : ''}>週日固定團騎</option>
        <option value="challenge" ${r.category === 'challenge' ? 'selected' : ''}>年度挑戰</option>
        <option value="monthly" ${r.category === 'monthly' ? 'selected' : ''}>每月檢定</option>
      </select></div>
      <div class="form-row"><label>配速建議</label><textarea id="edit-pacing-${esc(rideId)}" rows="2">${esc(r.pacing_guide || '')}</textarea></div>
      <div class="form-row"><label>補給點</label><textarea id="edit-supply-${esc(rideId)}" rows="2">${esc(r.supply_points || '')}</textarea></div>
      <div class="form-row"><label>關門時間</label><textarea id="edit-cutoff-${esc(rideId)}" rows="2">${esc(r.cutoff_times || '')}</textarea></div>
      <div class="form-row"><label>裝備清單</label><textarea id="edit-gear-${esc(rideId)}" rows="2">${esc(r.gear_list || '')}</textarea></div>` : ''}
      <div class="form-row"><label>距離 km</label><input type="number" id="edit-distance-${esc(rideId)}" value="${esc(r.distance_km ?? '')}"></div>
      <div class="form-row"><label>爬升 m</label><input type="number" id="edit-ascent-${esc(rideId)}" value="${esc(r.ascent_m ?? '')}"></div>
      <div class="form-row"><label>Strava 路線</label><input type="text" id="edit-strava-${esc(rideId)}" value="${esc(r.strava_url || '')}"></div>
      <div class="form-row"><label>Garmin 路線</label><input type="text" id="edit-garmin-url-${esc(rideId)}" value="${esc(r.garmin_url || '')}"></div>
      <div class="form-row"><label>備註</label><input type="text" id="edit-note-${esc(rideId)}" value="${esc(r.note || '')}"></div>
      <div class="form-row"><label>人數上限</label><input type="number" id="edit-max-${esc(rideId)}" value="${esc(r.max_participants || '')}"></div>
      <div class="form-row"><label>天氣預報地點</label>
        <select id="edit-weather-${esc(rideId)}"><option value="">使用第一集合點天氣</option>${opts}<option value="__custom__">＋ 自訂座標</option></select>
      </div>
      <div class="btn-row">
        <button class="save-btn" type="button" data-act="update-ride" data-id="${esc(rideId)}">儲存</button>
        <button class="cancel-btn" type="button" data-act="close-edit" data-id="${esc(rideId)}">取消</button>
      </div></div>`
  })
}
async function updateRide(rideId) {
  const weatherSel = document.getElementById('edit-weather-' + rideId)
  let weatherLat = null, weatherLng = null, weatherName = ''
  if (weatherSel && weatherSel.value && weatherSel.value !== '__custom__') {
    const opt = weatherSel.options[weatherSel.selectedIndex]
    weatherLat = parseFloat(opt.getAttribute('data-lat'))
    weatherLng = parseFloat(opt.getAttribute('data-lng'))
    weatherName = opt.getAttribute('data-name') || ''
  }
  const payload = {
    title: document.getElementById('edit-title-' + rideId).value.trim(),
    date: document.getElementById('edit-date-' + rideId).value,
    time: document.getElementById('edit-time-' + rideId).value,
    time2: document.getElementById('edit-time2-' + rideId).value,
    garmin_code: document.getElementById('edit-garmin-' + rideId).value.trim(),
    strava_url: document.getElementById('edit-strava-' + rideId).value.trim(),
    garmin_url: document.getElementById('edit-garmin-url-' + rideId).value.trim(),
    note: document.getElementById('edit-note-' + rideId).value.trim(),
    pace_note: (document.getElementById('edit-pace-' + rideId) || {}).value ? document.getElementById('edit-pace-' + rideId).value.trim() : undefined,
    category: document.getElementById('edit-category-' + rideId) ? PaceCore.normalizeCategory(document.getElementById('edit-category-' + rideId).value) : undefined,
    pacing_guide: document.getElementById('edit-pacing-' + rideId) ? document.getElementById('edit-pacing-' + rideId).value.trim() : undefined,
    supply_points: document.getElementById('edit-supply-' + rideId) ? document.getElementById('edit-supply-' + rideId).value.trim() : undefined,
    cutoff_times: document.getElementById('edit-cutoff-' + rideId) ? document.getElementById('edit-cutoff-' + rideId).value.trim() : undefined,
    gear_list: document.getElementById('edit-gear-' + rideId) ? document.getElementById('edit-gear-' + rideId).value.trim() : undefined,
    distance_km: document.getElementById('edit-distance-' + rideId) && document.getElementById('edit-distance-' + rideId).value !== '' ? Number(document.getElementById('edit-distance-' + rideId).value) : null,
    ascent_m: document.getElementById('edit-ascent-' + rideId) && document.getElementById('edit-ascent-' + rideId).value !== '' ? Number(document.getElementById('edit-ascent-' + rideId).value) : null,
    max_participants: parseInt(document.getElementById('edit-max-' + rideId).value, 10) || null,
    weather_lat: weatherLat, weather_lng: weatherLng, weather_location_name: weatherName
  }
  if (!schemaCaps.rideExtras) {
    delete payload.pace_note
    delete payload.distance_km
    delete payload.ascent_m
  }
  if (!schemaCaps.category) {
    delete payload.category
    delete payload.pacing_guide
    delete payload.supply_points
    delete payload.cutoff_times
    delete payload.gear_list
  }
  const { error } = await db.from('rides').update(payload).eq('id', rideId)
  if (error) { showToast('儲存失敗'); return }
  showToast('公告已更新')
  renderRides()
}
async function toggleRegistration(rideId, isRegistered) {
  const card = document.getElementById('ride-' + rideId) || document.getElementById('next-ride')
  const btn = card && card.querySelector('[data-act="reg"]')
  if (btn) { btn.disabled = true; btn.textContent = isRegistered ? '取消中…' : '送出中…' }
  const existing = myRegByRide.get(rideId)
  const existingId = existing && existing.id ? existing.id : existing
  if (isRegistered && !existingId) {
    showToast('取消失敗，請再試一次')
    renderRides()
    return
  }
  let insertRow = null
  if (!isRegistered) {
    const chosen = (document.getElementById('reg-group-' + rideId) || document.getElementById('home-reg-group-' + rideId) || {}).value || ''
    const built = globalThis.PaceCore ? PaceCore.buildRegistration({
      rideId,
      groupId: chosen,
      groups: rideState.groups || [],
      allowGroup: schemaCaps.regGroup
    }) : { ok: !chosen, row: { ride_id: rideId } }
    if (!built.ok) {
      showToast(built.reason === 'bad-group' ? '這個組別不屬於這一場' : '現在不能選組別')
      renderRides()
      return
    }
    insertRow = Object.assign({
      line_user_id: myProfile.line_user_id,
      name: myProfile.name,
      avatar_url: myProfile.avatar_url || ''
    }, built.row)
    if (!schemaCaps.regGroup) delete insertRow.group_id
  }
  const res = isRegistered
    ? await db.from('registrations').delete().eq('id', existingId)
    : await db.from('registrations').insert(insertRow)
  if (res.error) {
    showToast(isRegistered ? '取消失敗，請再試一次' : '報名失敗，請再試一次')
    renderRides()
    return
  }
  if (!isRegistered) { celebrate(); showToast('報名成功') }
  else showToast('已取消報名')
  renderRides()
}
async function showAttendancePanel(rideId) {
  const panel = document.getElementById('attendance-panel-' + rideId)
  if (!panel) return
  if (panel.dataset.open === '1') { panel.dataset.open = '0'; panel.hidden = true; return }
  panel.dataset.open = '1'
  panel.hidden = false
  panel.innerHTML = '<div class="empty-state">載入中...</div>'
  const { data: regs } = await readFrom('registrations').select('*').eq('ride_id', rideId)
  const { data: atts } = await readFrom('attendances').select('*').eq('ride_id', rideId)
  const attByUser = new Map()
  ;(atts || []).forEach(a => {
    if (a.line_user_id) attByUser.set(a.line_user_id, a)
    if (a.rider_id) attByUser.set('id:' + a.rider_id, a)
  })
  const extras = allRiders.filter(r => !(regs || []).find(reg => regMatchesRider(reg, r)))
  panel.innerHTML = `<div class="attend-list">${(regs || []).map(m => {
    const att = attByUser.get(m.line_user_id) || attByUser.get('id:' + m.rider_id)
    const rider = allRiders.find(r => regMatchesRider(m, r))
    return `
    <div class="attend-row">${avatarHtml(m.avatar_url, m.name, 28)}<span class="name">${esc(m.name)}</span>
      <button class="attend-check${att ? ' checked' : ''}" type="button" data-act="toggle-att" data-ride="${esc(rideId)}" data-uid="${esc(m.line_user_id || '')}" data-rider="${esc((rider && rider.id) || m.rider_id || '')}" data-att="${esc(att ? att.id : '')}">${att ? icon('check', 16) : ''}</button>
    </div>`
  }).join('') || '<div class="empty-state">還沒有人報名</div>'}</div>
    <div class="zone-title">臨時加入</div>
    <div class="add-attendee-row">
      <select id="extra-member-${esc(rideId)}"><option value="">選擇成員</option>${extras.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select>
      <button type="button" data-act="add-extra" data-id="${esc(rideId)}">加入</button>
    </div>`
}
async function toggleAttendance(rideId, btn) {
  const lineUserId = btn.dataset.uid
  const rider = allRiders.find(r => r.id === btn.dataset.rider) || allRiders.find(r => r.line_user_id === lineUserId)
  const name = rider?.name || ''
  const avatarUrl = rider?.avatar_url || ''
  const isChecked = btn.classList.contains('checked')
  if (!rider) { showToast('找不到這位成員'); return }
  if (isChecked) {
    if (!btn.dataset.att) { showToast('請重新開啟出席名單'); return }
    await db.from('attendances').delete().eq('id', btn.dataset.att)
    const { data } = await readFrom('riders').select('attendance_count').eq('id', rider.id).single()
    const newCount = Math.max(0, (data?.attendance_count || 0) - 1)
    await db.from('riders').update({ attendance_count: newCount }).eq('id', rider.id)
    btn.classList.remove('checked')
    btn.dataset.att = ''
    btn.innerHTML = ''
    showToast('已取消出席')
  } else {
    const inserted = await db.from('attendances').insert({ ride_id: rideId, line_user_id: lineUserId, name, avatar_url: avatarUrl }).select('id')
    if (inserted.error && inserted.error.code !== '23505') {
      showToast('出席記錄失敗')
      return
    }
    const created = Array.isArray(inserted.data) ? inserted.data[0] : inserted.data
    if (created?.id) btn.dataset.att = created.id
    if (!inserted.error) {
      const { data } = await readFrom('riders').select('attendance_count').eq('id', rider.id).single()
      const newCount = (data?.attendance_count || 0) + 1
      await db.from('riders').update({ attendance_count: newCount }).eq('id', rider.id)
    }
    btn.classList.add('checked')
    btn.innerHTML = icon('check', 16)
    showToast('已確認出席')
  }
  await loadRiders()
  await loadRideState()
  await loadRankingContext()
  renderLeaderboard()
  if (isMe(rider)) renderProfile()
}
async function addExtraAttendee(rideId) {
  const sel = document.getElementById('extra-member-' + rideId)
  const riderId = sel.value
  if (!riderId) { showToast('請選擇成員'); return }
  const rider = allRiders.find(r => r.id === riderId)
  if (!rider || !rider.line_user_id) return
  const inserted = await db.from('registrations').insert({ ride_id: rideId, line_user_id: rider.line_user_id, name: rider.name, avatar_url: rider.avatar_url || '' })
  if (inserted.error && inserted.error.code !== '23505') { showToast('加入失敗'); return }
  showToast(rider.name + ' 已加入')
  await showAttendancePanel(rideId)
  await showAttendancePanel(rideId)
}
function copyCode(code) {
  const done = () => showToast('Garmin Code 已複製')
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(code).then(done).catch(fallback)
  else fallback()
  function fallback() {
    const ta = document.createElement('textarea')
    ta.value = code
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); done() } catch (e) { showToast('複製失敗') }
    ta.remove()
  }
}
function showRideForm() {
  const form = document.getElementById('ride-form')
  form.hidden = false
  form.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function hideRideForm() { document.getElementById('ride-form').hidden = true }
async function saveRide() {
  const title = document.getElementById('ride-title').value.trim()
  const date = document.getElementById('ride-date').value
  const time = document.getElementById('ride-time').value
  const location1 = getLocationValue('1')
  if (!title || !date || !time || !location1) { showToast('請填寫標題、日期、時間和第一集合點'); return }
  const weatherSel = document.getElementById('ride-weather-location')
  let weatherLat = null, weatherLng = null, weatherName = ''
  if (weatherSel.value && weatherSel.value !== '__custom__') {
    const opt = weatherSel.options[weatherSel.selectedIndex]
    weatherLat = parseFloat(opt.getAttribute('data-lat'))
    weatherLng = parseFloat(opt.getAttribute('data-lng'))
    weatherName = opt.getAttribute('data-name') || ''
  } else if (weatherSel.value === '__custom__') {
    weatherLat = parseFloat(document.getElementById('ride-weather-lat').value)
    weatherLng = parseFloat(document.getElementById('ride-weather-lng').value)
    weatherName = document.getElementById('ride-weather-name').value.trim()
  }
  const deadlineVal = document.getElementById('ride-deadline').value
  const maxVal = document.getElementById('ride-max').value
  const btn = document.querySelector('#ride-form .save-btn')
  if (btn.disabled) return
  btn.disabled = true
  const placeholder = document.createElement('div')
  placeholder.className = 'skel lg'
  document.getElementById('ride-list').prepend(placeholder)
  showToast('發布中…')
  const payload = {
    title, date, time,
    time2: document.getElementById('ride-time2').value || '',
    location: location1,
    location2: getLocationValue('2'),
    garmin_code: document.getElementById('ride-garmin').value.trim(),
    strava_url: document.getElementById('ride-strava').value.trim(),
    garmin_url: document.getElementById('ride-garmin-url').value.trim(),
    note: document.getElementById('ride-note').value.trim(),
    deadline: deadlineVal ? new Date(deadlineVal).toISOString() : null,
    max_participants: maxVal ? parseInt(maxVal, 10) : null,
    weather_lat: weatherLat, weather_lng: weatherLng, weather_location_name: weatherName
  }
  const groupLines = document.getElementById('ride-groups') ? document.getElementById('ride-groups').value : ''
  if (schemaCaps.rideExtras) {
    const distance = document.getElementById('ride-distance').value
    const ascent = document.getElementById('ride-ascent').value
    const estimated = document.getElementById('ride-estimated').checked
    payload.pace_note = document.getElementById('ride-pace').value.trim()
    payload.distance_km = distance === '' ? null : Number(distance)
    payload.ascent_m = ascent === '' ? null : Number(ascent)
    payload.distance_estimated = estimated && payload.distance_km != null
    payload.ascent_estimated = estimated && payload.ascent_m != null
    payload.cancelled = false
    const routeId = document.getElementById('ride-route').value
    if (routeId) payload.route_id = routeId
  }
  if (schemaCaps.category) {
    const cat = document.getElementById('ride-category')
    payload.category = PaceCore.normalizeCategory(cat && cat.value)
    payload.pacing_guide = payload.category === 'challenge' ? document.getElementById('ride-pacing').value.trim() : ''
    payload.supply_points = payload.category === 'challenge' ? document.getElementById('ride-supply').value.trim() : ''
    payload.cutoff_times = payload.category === 'challenge' ? document.getElementById('ride-cutoff').value.trim() : ''
    payload.gear_list = payload.category === 'challenge' ? document.getElementById('ride-gear').value.trim() : ''
  }
  const inserted = await db.from('rides').insert(payload).select('id')
  btn.disabled = false
  placeholder.remove()
  if (inserted.error) { showToast('發布失敗，請再試一次'); return }
  const newId = insertedId(inserted)
  if (schemaCaps.groups && newId && groupLines.trim()) {
    const groups = parseGroupLines(groupLines).map(g => Object.assign({ ride_id: newId }, g))
    if (groups.length) await db.from('ride_groups').insert(groups)
  }
  ;['ride-title', 'ride-note', 'ride-strava', 'ride-garmin-url', 'ride-garmin', 'ride-max', 'ride-deadline', 'ride-time2', 'ride-pace', 'ride-distance', 'ride-ascent', 'ride-groups'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.value = ''
  })
  showToast('團騎公告發布成功')
  hideRideForm()
  await renderRides()
  if (newId) openAnnouncement(newId)
}
async function deleteRide(id) {
  const ok = await askConfirm({ title: '刪除團騎公告', body: '刪除後無法復原，相關報名也會一併移除。確定要刪除嗎？', ok: '刪除', danger: true })
  if (!ok) return
  const { error } = await db.from('rides').delete().eq('id', id)
  if (error) { showToast('刪除失敗'); return }
  showToast('已刪除')
  renderRides()
}
async function toggleFinished(rideId, finished) {
  await db.from('rides').update({ is_finished: finished }).eq('id', rideId)
  showToast(finished ? '已標記為結束' : '已重新開啟')
  renderRides()
}
function toggleFinishedSection() {
  const list = document.getElementById('finished-list')
  const arrow = document.getElementById('finished-arrow')
  if (!list) return
  list.hidden = !list.hidden
  if (arrow) arrow.style.transform = list.hidden ? '' : 'rotate(180deg)'
}

async function renderAdmin() {
  const { data } = await readFrom('riders').select('*').order('last_seen', { ascending: false })
  adminCache = data || []
  const pending = adminCache.filter(r => r.status === 'pending')
  const approved = adminCache.filter(r => r.status === 'approved')
  const badge = document.getElementById('pending-count')
  if (pending.length) { badge.hidden = false; badge.textContent = String(pending.length) }
  else badge.hidden = true
  updateBell(pending.length)
  document.getElementById('admin-pending').innerHTML = pending.length ? pending.map(r => `
    <article class="admin-card">
      <div class="admin-card-top">${avatarHtml(r.avatar_url, r.name, 40)}
        <div class="admin-info"><div class="admin-name">${esc(r.name)}</div>
        <div class="admin-meta">FTP ${esc(r.ftp || '未填')}W · ${esc(r.weight || '未填')}kg${r.ftp && r.weight ? ' · ' + (r.ftp / r.weight).toFixed(2) + ' W/kg' : ''}</div></div>
      </div>
      ${r.mood ? `<div class="rider-mood">「${esc(r.mood)}」</div>` : ''}
      <div class="admin-actions">
        <button class="approve-btn" type="button" data-act="approve" data-id="${esc(r.id)}">核准</button>
        <button class="kick-btn" type="button" data-act="kick" data-id="${esc(r.id)}">拒絕</button>
      </div>
    </article>`).join('') : '<div class="empty-state">沒有待審核的成員</div>'
  document.getElementById('admin-active').innerHTML = approved.length ? approved.map(r => {
    const status = activityStatus(r.last_seen)
    const title = titleBadge(r.attendance_count || 0)
    return `<article class="admin-card">
      <div class="admin-card-top">${avatarHtml(r.avatar_url, r.name, 40)}
        <div class="admin-info"><div class="admin-name">${esc(r.name)}${r.is_admin ? ' · 管理員' : ''}</div>
        <div class="admin-meta"><span class="status-dot ${status.cls}"></span>${status.label}</div></div>
      </div>
      <div class="admin-stats-row">
        <div class="admin-stat"><div class="val">${esc(r.ftp || '—')}W</div><div class="lbl">FTP</div></div>
        <div class="admin-stat"><div class="val">${esc(timeAgo(r.updated_at))}</div><div class="lbl">上次更新</div></div>
        <div class="admin-stat"><div class="val">${esc(timeAgo(r.last_seen))}</div><div class="lbl">上次上線</div></div>
      </div>
      <div class="admin-stats-row">
        <div class="admin-stat"><div class="val">${r.attendance_count || 0}</div><div class="lbl">出席次數</div></div>
        <div class="admin-stat span-2"><div class="val">${esc(title || '—')}</div><div class="lbl">稱號</div></div>
      </div>
      <div class="admin-actions"><button class="kick-btn" type="button" data-act="kick" data-id="${esc(r.id)}">踢除成員</button></div>
    </article>`
  }).join('') : '<div class="empty-state">沒有已核准的成員</div>'
  renderLocationAdmin()
  renderGuidelineAdmin()
}
async function renderLocationAdmin() {
  const { data } = await db.from('locations').select('*').order('sort_order')
  document.getElementById('location-list').innerHTML = (data || []).map(l => `
    <article class="admin-card loc-admin"><div class="grow"><div class="admin-name">${esc(l.name)}</div><div class="admin-meta">${esc(l.address)}</div></div>
      <button class="delete-btn" type="button" data-act="del-loc" data-id="${esc(l.id)}">刪除</button></article>`).join('')
}
async function saveLocation() {
  const name = document.getElementById('loc-name').value.trim()
  const address = document.getElementById('loc-address').value.trim()
  if (!name || !address) { showToast('請填寫地點名稱和地址'); return }
  const { error } = await db.from('locations').insert({ name, address, sort_order: 99 })
  if (error) { showToast('新增失敗'); return }
  document.getElementById('loc-name').value = ''
  document.getElementById('loc-address').value = ''
  showToast('地點已新增')
  await loadLocations()
  renderLocationAdmin()
}
async function deleteLocation(id) {
  const ok = await askConfirm({ title: '刪除集合地點', body: '刪除後，新的團騎公告就不能再選這個地點。確定要刪除嗎？', ok: '刪除', danger: true })
  if (!ok) return
  const { error } = await db.from('locations').delete().eq('id', id)
  if (error) { showToast('刪除失敗'); return }
  showToast('已刪除')
  await loadLocations()
  renderLocationAdmin()
}
async function renderGuidelineAdmin() {
  const { data } = await db.from('guidelines').select('*').order('sort_order')
  guidelineCache = data || []
  document.getElementById('guideline-admin-list').innerHTML = guidelineCache.map(g => `
    <article class="guideline-edit-card">
      <div class="guideline-edit-title">${esc(g.category)}</div>
      <div class="guideline-edit-preview">${esc(String(g.content || '').slice(0, 60))}</div>
      <div class="guideline-edit-actions">
        <button class="edit-btn" type="button" data-act="edit-gl" data-id="${esc(g.id)}">編輯</button>
        <button class="delete-btn" type="button" data-act="del-gl" data-id="${esc(g.id)}">刪除</button>
      </div>
    </article>`).join('')
}
async function saveGuideline() {
  const category = document.getElementById('gl-category').value.trim()
  const content = document.getElementById('gl-content').value.trim()
  if (!category || !content) { showToast('請填寫分類名稱和內容'); return }
  const { error } = await db.from('guidelines').insert({ category, content, sort_order: 99 })
  if (error) { showToast('新增失敗'); return }
  document.getElementById('gl-category').value = ''
  document.getElementById('gl-content').value = ''
  showToast('已新增')
  renderGuidelineAdmin()
  renderPace()
}
async function deleteGuideline(id) {
  const ok = await askConfirm({ title: '刪除團規', body: '這段內容會從 PACE 頁面移除。確定要刪除嗎？', ok: '刪除', danger: true })
  if (!ok) return
  await db.from('guidelines').delete().eq('id', id)
  showToast('已刪除')
  renderGuidelineAdmin()
  renderPace()
}
function editGuideline(id) {
  const g = guidelineCache.find(x => String(x.id) === String(id))
  if (!g) return
  document.getElementById('gl-category').value = g.category
  document.getElementById('gl-content').value = g.content
  const btn = document.getElementById('gl-save')
  btn.textContent = '更新內容'
  btn.onclick = async () => {
    const newCategory = document.getElementById('gl-category').value.trim()
    const newContent = document.getElementById('gl-content').value.trim()
    if (!newCategory || !newContent) { showToast('請填寫分類名稱和內容'); return }
    await db.from('guidelines').update({ category: newCategory, content: newContent }).eq('id', id)
    showToast('已更新')
    btn.textContent = '新增分類'
    btn.onclick = saveGuideline
    document.getElementById('gl-category').value = ''
    document.getElementById('gl-content').value = ''
    renderGuidelineAdmin()
    renderPace()
  }
  document.getElementById('gl-category').scrollIntoView({ behavior: 'smooth' })
}
async function approveMember(riderId) {
  await db.from('riders').update({ status: 'approved' }).eq('id', riderId)
  showToast('已核准')
  renderAdmin()
  await loadRiders()
  renderLeaderboard()
}
async function kickMember(riderId) {
  const rider = adminCache.find(r => r.id === riderId)
  const ok = await askConfirm({
    title: rider && rider.status === 'pending' ? '拒絕申請' : '移除成員',
    body: '確定要移除「' + (rider?.name || '這位成員') + '」？此動作無法復原。',
    ok: rider && rider.status === 'pending' ? '拒絕' : '移除',
    danger: true
  })
  if (!ok) return
  await db.from('riders').delete().eq('id', riderId)
  showToast('已移除成員')
  renderAdmin()
  await loadRiders()
  renderLeaderboard()
}

function filterCat(v, el) {
  currentFilter = v
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.toggle('active', b === el))
  renderLeaderboard()
}
function switchTab(id) {
  if (!document.getElementById('tab-' + id)) return
  const order = TAB_ORDER.concat('admin')
  const dir = order.indexOf(id) < order.indexOf(currentTab) ? 'back' : 'forward'
  currentTab = id
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active', 'forward', 'back'))
  const panel = document.getElementById('tab-' + id)
  panel.classList.add('active', dir)
  if (id === 'admin' && isAdmin) renderAdmin()
  if (id === 'pace') renderPace()
  syncChrome()
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
}
function switchAdminTab(id) {
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === id))
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'))
  const panel = document.getElementById('admin-' + id)
  if (panel) panel.classList.add('active')
  if (id === 'studio') renderStudio()
  if (id === 'routes') renderRouteAdmin()
}
async function shareProfile() {
  const me = currentRider()
  const text = me && me.ftp && me.weight
    ? 'PACE 沛速車隊｜' + me.name + '｜' + wkgStr(me) + ' W/kg｜' + cat(wkg(me)).label
    : 'PACE 沛速車隊｜' + (myProfile ? myProfile.name : '')
  try {
    if (navigator.share) await navigator.share({ text })
    else if (navigator.clipboard) { await navigator.clipboard.writeText(text); showToast('已複製個人戰力') }
    else showToast(text)
  } catch (e) {
    if (e && e.name === 'AbortError') return
    showToast('無法分享')
  }
}
function toggleTone() {
  const next = document.documentElement.dataset.tone === 'lift' ? '' : 'lift'
  if (next) document.documentElement.dataset.tone = next
  else delete document.documentElement.dataset.tone
  try { localStorage.setItem('pace-tone', next) } catch (e) { /* ignore */ }
}
async function refreshRides() {
  const ptr = document.getElementById('ptr')
  ptr.hidden = false
  ptr.textContent = '更新中…'
  try { await renderRides(); ptr.textContent = '已更新' }
  catch (e) { ptr.textContent = '更新失敗' }
  setTimeout(() => { ptr.hidden = true }, 700)
}

function onGlobalClick(e) {
  const el = e.target.closest('[data-act]')
  if (!el) return
  const act = el.dataset.act
  if (act === 'tab') switchTab(el.dataset.tab)
  else if (act === 'filter') filterCat(el.dataset.cat, el)
  else if (act === 'admin-tab') switchAdminTab(el.dataset.tab)
  else if (act === 'tone') toggleTone()
  else if (act === 'bell') {
    if (isAdmin) switchTab('admin')
    else showToast('目前沒有新通知')
  }
  else if (act === 'share') shareProfile()
  else if (act === 'show-ride-form') showRideForm()
  else if (act === 'guideline') toggleGuideline(el.dataset.i)
  else if (act === 'reg') toggleRegistration(el.dataset.id, el.dataset.on === '1')
  else if (act === 'copy') copyCode(el.dataset.code || '')
  else if (act === 'del-ride') deleteRide(el.dataset.id)
  else if (act === 'edit-ride') showEditRideForm(el.dataset.id)
  else if (act === 'finish') toggleFinished(el.dataset.id, el.dataset.finished === '1')
  else if (act === 'attend-panel') showAttendancePanel(el.dataset.id)
  else if (act === 'toggle-att') toggleAttendance(el.dataset.ride, el)
  else if (act === 'add-extra') addExtraAttendee(el.dataset.id)
  else if (act === 'update-ride') updateRide(el.dataset.id)
  else if (act === 'close-edit') { const box = document.getElementById('edit-ride-form-' + el.dataset.id); if (box) box.innerHTML = '' }
  else if (act === 'toggle-finished') toggleFinishedSection()
  else if (act === 'approve') approveMember(el.dataset.id)
  else if (act === 'kick') kickMember(el.dataset.id)
  else if (act === 'del-loc') deleteLocation(el.dataset.id)
  else if (act === 'del-gl') deleteGuideline(el.dataset.id)
  else if (act === 'edit-gl') editGuideline(el.dataset.id)
  else if (act === 'announce') openAnnouncement(el.dataset.id)
  else if (act === 'open-ride') openRide(el.dataset.id)
  else if (act === 'announce-share') shareCurrentAnnouncement()
  else if (act === 'announce-copy') copyAnnouncementOnly()
  else if (act === 'announce-close') { const box = document.getElementById('announce'); if (box) box.hidden = true }
  else if (act === 'cancel-ride') setRideCancelled(el.dataset.id, el.dataset.cancelled === '1')
  else if (act === 'copy-preview') previewStudio()
  else if (act === 'copy-publish') publishStudio()
  else if (act === 'save-template') saveTemplateFromStudio()
  else if (act === 'use-template') stageTemplate(el.dataset.id)
  else if (act === 'bulk-preview') previewBulk()
  else if (act === 'bulk-publish') publishBulk()
  else if (act === 'save-route') saveRoute()
}
function onTouchStart(e) {
  if (e.touches.length !== 1) return
  if (!document.getElementById('confirm').hidden) return
  if (e.target.closest('input, textarea, select, .cat-filters, .admin-tabs, .bottom-nav, .side-nav, .confirm')) return
  const t = e.touches[0]
  gesture = { x: t.clientX, y: t.clientY, sy: window.scrollY }
}
function onTouchEnd(e) {
  if (!gesture) return
  const t = e.changedTouches[0]
  const dx = t.clientX - gesture.x
  const dy = t.clientY - gesture.y
  const started = gesture
  gesture = null
  if (currentTab === 'ride' && started.sy <= 2 && dy > 78 && Math.abs(dx) < 40) { refreshRides(); return }
  if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35) return
  const i = TAB_ORDER.indexOf(currentTab)
  if (i < 0) return
  if (dx < 0 && i < TAB_ORDER.length - 1) switchTab(TAB_ORDER[i + 1])
  if (dx > 0 && i > 0) switchTab(TAB_ORDER[i - 1])
}

bootChrome()
document.body.addEventListener('click', onGlobalClick)
document.addEventListener('touchstart', onTouchStart, { passive: true })
document.addEventListener('touchend', onTouchEnd, { passive: true })
setInterval(tickCountdowns, 1000)
try {
  const tone = localStorage.getItem('pace-tone')
  if (tone) document.documentElement.dataset.tone = tone
} catch (e) { /* ignore */ }
init()
