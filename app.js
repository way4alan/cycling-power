const SUPABASE_URL = 'https://yvgjaljdxmsmtljcmemp.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Z2phbGpkeG1zbXRsamNtZW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTExMDYsImV4cCI6MjA5NzY4NzEwNn0.Bpfwwf_MfG_foTVk1oc3tKf6oBP7_ShRM1Nu0hR-Pz0'
const LIFF_ID = '2010470481-aY3CdaJS'
const AQICN_TOKEN = 'f15e708e4ce8001151a24716eebf17567d06256c'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

let myProfile = null
let myData = null
let allRiders = []
let allLocations = []
let allWeatherLocations = []
let currentFilter = 'all'
let isAdmin = false

const TIRE_COEFFICIENTS = {
  25: { front: 1.085, rear: 1.145 },
  26: { front: 1.048, rear: 1.110 },
  28: { front: 1.000, rear: 1.065 },
  29: { front: 0.956, rear: 1.025 },
  30: { front: 0.911, rear: 0.984 },
  32: { front: 0.845, rear: 0.910 }
}

function calcTirePressure(weight, tireWidth){
  const coef = TIRE_COEFFICIENTS[tireWidth]
  if(!coef || !weight) return null
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

function calcGroupSpeed(avgWkg){
  if(!avgWkg) return null
  const baseSpeed = 15 + (avgWkg * 5.2)
  const groupBonus = baseSpeed * 0.18
  const total = baseSpeed + groupBonus
  return { solo: Math.round(baseSpeed), group: Math.round(total) }
}

function getWmoDescription(code){
  const map = {
    0:'☀️ 晴天', 1:'🌤️ 大致晴朗', 2:'⛅ 部分多雲', 3:'☁️ 陰天',
    45:'🌫️ 有霧', 48:'🌫️ 有霧',
    51:'🌦️ 毛毛雨', 53:'🌦️ 毛毛雨', 55:'🌦️ 毛毛雨',
    61:'🌧️ 小雨', 63:'🌧️ 中雨', 65:'🌧️ 大雨',
    71:'🌨️ 小雪', 73:'🌨️ 中雪', 75:'🌨️ 大雪',
    80:'🌧️ 陣雨', 81:'🌧️ 陣雨', 82:'⛈️ 強陣雨',
    95:'⛈️ 雷雨', 96:'⛈️ 雷雨', 99:'⛈️ 強雷雨'
  }
  return map[code] || '🌡️ 未知'
}

function getAqiDescription(aqi){
  if(aqi <= 50) return { label:'優良', color:'#22c55e' }
  if(aqi <= 100) return { label:'普通', color:'#f59e0b' }
  if(aqi <= 150) return { label:'對敏感族群不健康', color:'#f97316' }
  if(aqi <= 200) return { label:'不健康', color:'#ef4444' }
  return { label:'非常不健康', color:'#9333ea' }
}

async function fetchWeather(lat, lng, date){
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max,windspeed_10m_max&timezone=Asia/Taipei&start_date=${date}&end_date=${date}`
    const res = await fetch(url)
    const data = await res.json()
    if(!data.daily) return null
    return {
      code: data.daily.weathercode[0],
      maxTemp: data.daily.temperature_2m_max[0],
      minTemp: data.daily.temperature_2m_min[0],
      rainProb: data.daily.precipitation_probability_max[0],
      windSpeed: data.daily.windspeed_10m_max[0]
    }
  } catch(e){ return null }
}

async function fetchAqi(lat, lng){
  try {
    const url = `https://api.waqi.info/feed/geo:${lat};${lng}/?token=${AQICN_TOKEN}`
    const res = await fetch(url)
    const data = await res.json()
    if(data.status !== 'ok') return null
    return data.data.aqi
  } catch(e){ return null }
}

function wkg(r){ return r.ftp / r.weight }
function wkgStr(r){ return wkg(r).toFixed(2) }
function cat(v){
  if(v >= 4.0) return { label:'A貓', cls:'cat-A' }
  if(v >= 3.2) return { label:'B貓', cls:'cat-B' }
  if(v >= 2.5) return { label:'C貓', cls:'cat-C' }
  return { label:'D貓', cls:'cat-D' }
}
function similarity(a, b){
  const wDiff = Math.abs(wkg(a) - wkg(b))
  const fDiff = Math.abs(a.ftp - b.ftp) / Math.max(a.ftp, b.ftp)
  return Math.max(0, Math.round(100 - (wDiff * 25 + fDiff * 50)))
}
function avatarEl(url, name, size=40){
  if(url) return `<img src="${url}" class="avatar" style="width:${size}px;height:${size}px" onerror="this.style.display='none'">`
  const colors = ['#534AB7','#1D9E75','#D85A30','#D4537E','#378ADD','#639922','#BA7517']
  const bg = colors[name.charCodeAt(0) % colors.length]
  return `<div class="avatar-placeholder" style="width:${size}px;height:${size}px;background:${bg};color:#fff">${name.slice(0,2)}</div>`
}
function timeAgo(ts){
  if(!ts) return '從未'
  const diff = Math.floor((Date.now() - new Date(ts)) / 1000)
  if(diff < 60) return '剛剛'
  if(diff < 3600) return Math.floor(diff/60) + ' 分鐘前'
  if(diff < 86400) return Math.floor(diff/3600) + ' 小時前'
  if(diff < 2592000) return Math.floor(diff/86400) + ' 天前'
  return Math.floor(diff/2592000) + ' 個月前'
}
function activityStatus(ts){
  if(!ts) return { cls:'status-inactive', label:'從未上線' }
  const days = Math.floor((Date.now() - new Date(ts)) / 86400000)
  if(days <= 7) return { cls:'status-active', label:'活躍' }
  if(days <= 30) return { cls:'status-idle', label:'沉默中' }
  return { cls:'status-inactive', label:'已消失' }
}
function showToast(msg){
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), 2500)
}

function getNameInlineStyle(rider){
  const count = rider.attendance_count || 0
  if(count >= 48) return ''
  if(count >= 10 && rider.name_color){
    const color = rider.name_color
    if(count >= 20) return `color:${color};text-shadow:0 0 8px ${color},0 0 16px ${color}`
    return `color:${color}`
  }
  return ''
}

function getAttendanceBadge(count){
  if(count >= 48) return '✨ PACE 傳奇'
  if(count >= 30) return '🟠 精英成員'
  if(count >= 20) return '🟣 資深騎手'
  if(count >= 10) return '🔵 新銳騎士'
  return ''
}

async function init(){
  try {
    await liff.init({ liffId: LIFF_ID })
    if(!liff.isLoggedIn()){ liff.login(); return }
    const profile = await liff.getProfile()
    myProfile = {
      line_user_id: profile.userId,
      name: profile.displayName,
      avatar_url: profile.pictureUrl
    }
    const { data: me } = await db.from('riders')
      .select('*').eq('line_user_id', myProfile.line_user_id).single()
    myData = me
    document.getElementById('loading').style.display = 'none'
    if(!me){ showPendingForm(false); return }
    if(me.status === 'pending'){ showPendingForm(true, me); return }
    await updateLastSeen()
    isAdmin = me.is_admin === true
    document.getElementById('app').style.display = 'block'
    if(isAdmin) document.getElementById('admin-nav-btn').style.display = 'flex'
    await loadLocations()
    await loadWeatherLocations()
    await loadRiders()
    renderLeaderboard()
    renderMatch()
    renderProfile()
    renderRides()
    renderPace()
    if(isAdmin) renderAdmin()
  } catch(e){
    document.querySelector('.loading-text').textContent = '載入失敗，請重新整理'
    console.error(e)
  }
}

function showPendingForm(existing, me){
  const screen = document.getElementById('pending-screen')
  screen.style.display = 'flex'
  const ftp = me?.ftp || ''
  const weight = me?.weight || ''
  const mood = me?.mood || ''
  const tireWidth = me?.tire_width || ''
  screen.querySelector('.pending-wrap').innerHTML = `
    <div class="pending-icon">🚴</div>
    <h2>${existing ? '審核中' : '申請加入 PACE'}</h2>
    <p>${existing ? '你的申請正在等待管理員審核，先填好資料，審核通過後立即出現在排行榜！' : '請填寫你的資料，送出後等待管理員審核。'}</p>
    <div class="pending-form">
      <div class="form-row"><label>FTP（瓦特）</label><input type="number" id="p-ftp" placeholder="例如 280" value="${ftp}" oninput="updatePendingPreview()"></div>
      <div class="form-row"><label>體重（kg）</label><input type="number" id="p-weight" placeholder="例如 70" value="${weight}" oninput="updatePendingPreview()"></div>
      <div class="wkg-preview" id="p-wkg-preview" style="display:${ftp&&weight?'flex':'none'}">
        <span id="p-preview-val">${ftp&&weight?(ftp/weight).toFixed(2):'—'}</span> W/kg
        <span class="cat-badge" id="p-preview-cat"></span>
      </div>
      <div class="form-row"><label>胎寬</label>
        <select id="p-tire">
          <option value="">請選擇胎寬</option>
          ${[25,26,28,29,30,32].map(w=>`<option value="${w}" ${tireWidth==w?'selected':''}>${w}c</option>`).join('')}
        </select>
      </div>
      <div class="form-row"><label>心情小語（選填）</label><input type="text" id="p-mood" placeholder="例如：新手上路 🙏" maxlength="30" value="${mood}"></div>
      <button class="save-btn" onclick="savePendingProfile()">${existing ? '💾 更新資料' : '📨 送出申請'}</button>
    </div>
    ${existing ? '<p class="pending-sub" style="margin-top:16px">審核通過後重新開啟 App 即可使用。</p>' : ''}`
  if(ftp && weight) updatePendingPreview()
}

function updatePendingPreview(){
  const ftp = parseInt(document.getElementById('p-ftp').value)
  const weight = parseFloat(document.getElementById('p-weight').value)
  const preview = document.getElementById('p-wkg-preview')
  if(ftp && weight){
    const v = ftp / weight
    const ct = cat(v)
    document.getElementById('p-preview-val').textContent = v.toFixed(2)
    const badge = document.getElementById('p-preview-cat')
    badge.textContent = ct.label
    badge.className = 'cat-badge ' + ct.cls
    preview.style.display = 'flex'
  } else { preview.style.display = 'none' }
}

async function savePendingProfile(){
  const ftp = parseInt(document.getElementById('p-ftp').value)
  const weight = parseFloat(document.getElementById('p-weight').value)
  if(!ftp || !weight){ showToast('請填寫 FTP 和體重'); return }
  const payload = {
    line_user_id: myProfile.line_user_id,
    name: myProfile.name,
    avatar_url: myProfile.avatar_url,
    ftp, weight,
    tire_width: parseInt(document.getElementById('p-tire').value) || null,
    mood: document.getElementById('p-mood').value.trim(),
    status: 'pending',
    updated_at: new Date().toISOString()
  }
  const { data: existing } = await db.from('riders').select('id').eq('line_user_id', myProfile.line_user_id).single()
  if(existing){
    await db.from('riders').update(payload).eq('line_user_id', myProfile.line_user_id)
  } else {
    await db.from('riders').insert({...payload, last_seen: new Date().toISOString()})
  }
  showToast('✅ 資料已儲存，等待管理員審核！')
}

async function updateLastSeen(){
  await db.from('riders').update({ last_seen: new Date().toISOString() }).eq('line_user_id', myProfile.line_user_id)
}

async function loadRiders(){
  const { data } = await db.from('riders').select('*').eq('status', 'approved').gt('ftp', 0).gt('weight', 0).order('ftp', { ascending: false })
  allRiders = data || []
}

async function loadLocations(){
  const { data } = await db.from('locations').select('*').order('sort_order')
  allLocations = data || []
  renderLocationSelects()
}

async function loadWeatherLocations(){
  const { data } = await db.from('weather_locations').select('*').order('sort_order')
  allWeatherLocations = data || []
  renderWeatherLocationSelect()
}

function renderWeatherLocationSelect(){
  const sel = document.getElementById('ride-weather-location')
  if(!sel) return
  const opts = allWeatherLocations.map(l => `<option value="${l.id}" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${l.name}">${l.name}</option>`).join('')
  sel.innerHTML = `<option value="">使用第一集合點天氣</option>${opts}<option value="__custom__">＋ 自訂座標</option>`
}

function handleWeatherLocationChange(){
  const sel = document.getElementById('ride-weather-location')
  const custom = document.getElementById('ride-weather-custom')
  custom.style.display = sel.value === '__custom__' ? 'block' : 'none'
}

function renderLocationSelects(){
  const opts = allLocations.map(l => `<option value="${l.address}" data-name="${l.name}">${l.name}</option>`).join('')
  const customOpt = `<option value="__custom__">＋ 自訂地點</option>`
  const sel1 = document.getElementById('ride-location1')
  const sel2 = document.getElementById('ride-location2')
  if(sel1) sel1.innerHTML = `<option value="">請選擇集合點</option>${opts}${customOpt}`
  if(sel2) sel2.innerHTML = `<option value="">不設第二集合點</option>${opts}${customOpt}`
}

function handleLocationChange(num){
  const sel = document.getElementById(`ride-location${num}`)
  const custom = document.getElementById(`ride-location${num}-custom`)
  if(sel.value === '__custom__'){ custom.style.display = 'block'; custom.focus() }
  else { custom.style.display = 'none' }
}

function getLocationValue(num){
  const sel = document.getElementById(`ride-location${num}`)
  if(!sel || !sel.value || sel.value === '') return ''
  if(sel.value === '__custom__') return document.getElementById(`ride-location${num}-custom`).value.trim()
  const name = sel.options[sel.selectedIndex].getAttribute('data-name')
  return `${name}｜${sel.value}`
}

function renderLeaderboard(){
  const sorted = [...allRiders].sort((a,b) => wkg(b) - wkg(a))
  const filtered = currentFilter === 'all' ? sorted : sorted.filter(r => cat(wkg(r)).label.startsWith(currentFilter))
  const validRiders = allRiders.filter(r => r.ftp > 0 && r.weight > 0)
  const avgFtp = validRiders.length ? Math.round(validRiders.reduce((s,r) => s+r.ftp, 0) / validRiders.length) : '—'
  const avgW = validRiders.length ? (validRiders.reduce((s,r) => s+wkg(r), 0) / validRiders.length).toFixed(2) : '—'
  document.getElementById('avg-ftp').textContent = avgFtp
  document.getElementById('avg-wkg').textContent = avgW
  document.getElementById('member-count').textContent = validRiders.length
  const medals = ['🥇','🥈','🥉']
  document.getElementById('rider-list').innerHTML = filtered.map((r) => {
    const rank = sorted.indexOf(r)
    const isMe = myProfile && r.line_user_id === myProfile.line_user_id
    const w = wkg(r)
    const ct = cat(w)
    const count = r.attendance_count || 0
    const badge = getAttendanceBadge(count)
    const nameStyle = getNameInlineStyle(r)
    const nameClass = count >= 48 ? 'rainbow-text' : ''
    return `<div class="rider-row${isMe ? ' is-me' : ''}">
      <div class="rider-main">
        <div class="rank">${rank < 3 ? medals[rank] : rank+1}</div>
        ${avatarEl(r.avatar_url, r.name)}
        <div class="rider-info">
          <div class="rider-name">
            <span class="${nameClass}" style="${nameStyle}">${r.name}</span>
            ${isMe ? '<span class="me-tag">我</span>' : ''}
          </div>
          <div class="rider-cat">
            <span class="cat-badge ${ct.cls}">${ct.label}</span>
            ${badge ? `<span class="attendance-badge">${badge}</span>` : ''}
            ${count > 0 ? `<span style="font-size:11px;color:#999;margin-left:4px">${count}次</span>` : ''}
          </div>
        </div>
        <div class="rider-stats">
          <div class="rider-ftp">${r.ftp} W</div>
          <div class="rider-wkg">${wkgStr(r)} W/kg</div>
        </div>
      </div>
      ${r.mood ? `<div class="rider-mood">💬 ${r.mood}</div>` : ''}
    </div>`
  }).join('')
}

function renderMatch(){
  if(!myProfile) return
  const me = allRiders.find(r => r.line_user_id === myProfile.line_user_id)
  if(!me){
    document.getElementById('match-me-card').innerHTML = `<div style="color:#fff;padding:8px">請先到「我的資料」填寫 FTP 和體重</div>`
    document.getElementById('match-list').innerHTML = ''
    return
  }
  document.getElementById('match-me-card').innerHTML = `
    ${avatarEl(me.avatar_url, me.name, 48)}
    <div class="match-me-info">
      <div class="name">${me.name}</div>
      <div class="stats">FTP ${me.ftp}W · ${wkgStr(me)} W/kg · ${cat(wkg(me)).label}</div>
    </div>`
  const others = allRiders.filter(r => r.line_user_id !== myProfile.line_user_id)
  const ranked = others.map(r => ({...r, sim: similarity(me, r)})).sort((a,b) => b.sim - a.sim)
  document.getElementById('match-list').innerHTML = ranked.map(r => {
    const simCls = r.sim >= 80 ? 'sim-high' : r.sim >= 60 ? 'sim-mid' : 'sim-low'
    const fDiff = me.ftp - r.ftp
    const wDiff = (wkg(me) - wkg(r)).toFixed(2)
    const adv = fDiff > 0 ? `你 FTP 高出 ${fDiff}W` : fDiff < 0 ? `對方 FTP 高出 ${Math.abs(fDiff)}W` : '勢均力敵'
    return `<div class="match-card">
      <div class="match-header">
        <div class="match-name">${avatarEl(r.avatar_url, r.name, 32)} ${r.name}</div>
        <span class="sim-badge ${simCls}">${r.sim}% 相似</span>
      </div>
      <div class="match-stats">
        <div class="match-stat"><div class="val">${r.ftp}W</div><div class="lbl">FTP</div></div>
        <div class="match-stat"><div class="val">${wkgStr(r)}</div><div class="lbl">W/kg</div></div>
      </div>
      <div class="match-diff">${adv} · W/kg 差距 ${Math.abs(wDiff)}</div>
    </div>`
  }).join('')
}

function renderProfile(){
  if(!myProfile) return
  const me = allRiders.find(r => r.line_user_id === myProfile.line_user_id)
  document.getElementById('profile-avatar-row').innerHTML = `
    ${avatarEl(myProfile.avatar_url, myProfile.name, 56)}
    <div>
      <div class="profile-name">${myProfile.name}</div>
      <div class="profile-line">LINE 帳號已連結</div>
    </div>`
  if(me){
    const count = me.attendance_count || 0
    const next = count < 10 ? 10 : count < 20 ? 20 : count < 30 ? 30 : count < 48 ? 48 : null
    const nextLabel = count < 10 ? '🎨 解鎖 ID 選色' : count < 20 ? '✨ 解鎖文字發光' : count < 30 ? '🟠 精英成員' : count < 48 ? '🌈 PACE 傳奇' : null
    const progressEl = document.getElementById('attendance-progress')
    if(next){
      const pct = Math.round((count / next) * 100)
      progressEl.innerHTML = `
        <div class="attendance-progress">
          <div class="progress-title">🚴 出席紀錄：${count} 次</div>
          <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%"></div></div>
          <div class="progress-text">${count} / ${next} 次</div>
          <div class="progress-next">再 ${next - count} 次即可${nextLabel}！</div>
        </div>`
    } else {
      progressEl.innerHTML = `<div class="attendance-progress"><div class="progress-title">✨ PACE 傳奇！出席 ${count} 次</div></div>`
    }
    document.getElementById('inp-ftp').value = me.ftp || ''
    document.getElementById('inp-weight').value = me.weight || ''
    document.getElementById('inp-mood').value = me.mood || ''
    if(me.tire_width) document.getElementById('inp-tire').value = me.tire_width
    if(me.z1) document.getElementById('z1').value = me.z1
    if(me.z2) document.getElementById('z2').value = me.z2
    if(me.z3) document.getElementById('z3').value = me.z3
    if(me.z4) document.getElementById('z4').value = me.z4
    if(me.z5) document.getElementById('z5').value = me.z5
    updatePreview()
    if(count >= 10){
      const colorSection = document.getElementById('color-picker-section')
      colorSection.style.display = 'block'
      const colorInput = document.getElementById('inp-name-color')
      colorInput.value = me.name_color || '#ffffff'
      updateColorPreview()
      colorInput.addEventListener('input', updateColorPreview)
    }
  }
}

function updateColorPreview(){
  const color = document.getElementById('inp-name-color').value
  const preview = document.getElementById('color-preview-text')
  const me = allRiders.find(r => r.line_user_id === myProfile.line_user_id)
  const count = me?.attendance_count || 0
  preview.style.color = color
  if(count >= 20) preview.style.textShadow = `0 0 8px ${color},0 0 16px ${color}`
}

async function renderPace(){
  const me = allRiders.find(r => r.line_user_id === myProfile?.line_user_id) || myData
  const weight = me?.weight
  const tireWidth = me?.tire_width
  const pressure = calcTirePressure(weight, tireWidth)
  const tireDisplay = document.getElementById('tire-pressure-display')
  if(!pressure){
    tireDisplay.innerHTML = `<div class="tire-setup-hint">請至「我的資料」填寫體重和胎寬</div>`
  } else {
    tireDisplay.innerHTML = `
      <div style="text-align:center;margin-bottom:10px">
        <span class="tire-width-badge">${tireWidth}c · ${weight}kg</span>
      </div>
      <div class="tire-grid">
        <div class="tire-card tubeless">
          <div class="tire-card-title">Tubeless</div>
          <div class="tire-wheel-row">
            <div class="tire-wheel"><div class="tire-wheel-label">前輪</div><div class="tire-psi">${pressure.tubeless.front.low}</div><div class="tire-psi-range">~${pressure.tubeless.front.high} psi</div></div>
            <div class="tire-wheel"><div class="tire-wheel-label">後輪</div><div class="tire-psi">${pressure.tubeless.rear.low}</div><div class="tire-psi-range">~${pressure.tubeless.rear.high} psi</div></div>
          </div>
        </div>
        <div class="tire-card open">
          <div class="tire-card-title">Open 胎</div>
          <div class="tire-wheel-row">
            <div class="tire-wheel"><div class="tire-wheel-label">前輪</div><div class="tire-psi">${pressure.open.front.low}</div><div class="tire-psi-range">~${pressure.open.front.high} psi</div></div>
            <div class="tire-wheel"><div class="tire-wheel-label">後輪</div><div class="tire-psi">${pressure.open.rear.low}</div><div class="tire-psi-range">~${pressure.open.rear.high} psi</div></div>
          </div>
        </div>
      </div>`
  }
  const { data: guidelines } = await db.from('guidelines').select('*').order('sort_order')
  document.getElementById('guidelines-list').innerHTML = (guidelines||[]).map((g,i) => `
    <div class="guideline-item">
      <div class="guideline-header" onclick="toggleGuideline(${i})">
        <span class="guideline-title">${g.category}</span>
        <span class="guideline-arrow" id="arrow-${i}">▼</span>
      </div>
      <div class="guideline-body" id="guideline-body-${i}">${g.content}</div>
    </div>`).join('')
}

function toggleGuideline(i){
  const body = document.getElementById(`guideline-body-${i}`)
  const arrow = document.getElementById(`arrow-${i}`)
  body.classList.toggle('open')
  arrow.classList.toggle('open')
}

async function renderRides(){
  const { data } = await db.from('rides').select('*').order('date', { ascending: true })
  const rides = data || []
  if(isAdmin) document.getElementById('add-ride-btn').style.display = 'block'
  if(rides.length === 0){
    document.getElementById('ride-list').innerHTML = `<div class="empty-state">目前沒有團騎公告</div>`
    return
  }
  const { data: myRegs } = await db.from('registrations').select('ride_id').eq('line_user_id', myProfile.line_user_id)
  const myRegIds = new Set((myRegs||[]).map(r => r.ride_id))
  const { data: allRegs } = await db.from('registrations').select('*')
  const { data: allAtts } = await db.from('attendances').select('*')

  const rideCards = await Promise.all(rides.map(async r => {
    const parts = r.location ? r.location.split('｜') : []
    const locName = parts.length > 1 ? parts[0] : r.location
    const locAddr = parts.length > 1 ? parts[1] : r.location
    const loc2Parts = r.location2 ? r.location2.split('｜') : []
    const loc2Name = loc2Parts.length > 1 ? loc2Parts[0] : r.location2
    const loc2Addr = loc2Parts.length > 1 ? loc2Parts[1] : r.location2
    const rideRegs = (allRegs||[]).filter(reg => reg.ride_id === r.id)
    const rideAtts = (allAtts||[]).filter(att => att.ride_id === r.id)
    const isRegistered = myRegIds.has(r.id)
    const isFull = r.max_participants && rideRegs.length >= r.max_participants
    const isPastDeadline = r.deadline && new Date(r.deadline) < new Date()
    const avatarsHtml = rideRegs.slice(0,8).map(reg =>
      reg.avatar_url
        ? `<img src="${reg.avatar_url}" class="reg-avatar" title="${reg.name}">`
        : `<div class="reg-avatar-placeholder" style="background:#534AB7;color:#fff" title="${reg.name}">${reg.name.slice(0,2)}</div>`
    ).join('')

    let weatherHtml = ''
    let lat = r.weather_lat
    let lng = r.weather_lng
    if(!lat || !lng){
      const loc1Match = allLocations.find(l => locAddr && locAddr.includes(l.address))
      const wLoc = allWeatherLocations.find(l => l.name === '高雄市區')
      if(wLoc){ lat = wLoc.lat; lng = wLoc.lng }
    }
    if(lat && lng && r.date){
      const [weather, aqi] = await Promise.all([
        fetchWeather(lat, lng, r.date),
        fetchAqi(lat, lng)
      ])
      if(weather){
        const desc = getWmoDescription(weather.code)
        const aqiDesc = aqi ? getAqiDescription(aqi) : null
        weatherHtml = `
          <div class="weather-card">
            <div class="weather-location">📍 ${r.weather_location_name || locName} 天氣預報</div>
            <div class="weather-main">
              <div class="weather-desc">${desc}</div>
              <div class="weather-temp">${weather.minTemp}°C ~ ${weather.maxTemp}°C</div>
            </div>
            <div class="weather-details">
              <div class="weather-detail">💧 降雨 ${weather.rainProb}%</div>
              <div class="weather-detail">💨 風速 ${weather.windSpeed} km/h</div>
              ${aqiDesc ? `<div class="weather-detail" style="color:${aqiDesc.color}">🌫️ AQI ${aqi} ${aqiDesc.label}</div>` : ''}
            </div>
          </div>`
      }
    }

    let groupStatsHtml = ''
    if(rideAtts.length > 0){
      const attRiders = rideAtts.map(a => allRiders.find(r => r.line_user_id === a.line_user_id)).filter(Boolean)
      if(attRiders.length > 0){
        const avgWkg = attRiders.reduce((s,r) => s+wkg(r), 0) / attRiders.length
        const speeds = calcGroupSpeed(avgWkg)
        groupStatsHtml = `
          <div class="group-stats-card">
            <div class="group-stats-title">📊 當天出席戰力分析</div>
            <div class="group-stats-grid">
              <div class="group-stat"><div class="val">${attRiders.length}</div><div class="lbl">出席人數</div></div>
              <div class="group-stat"><div class="val">${avgWkg.toFixed(2)}</div><div class="lbl">平均 W/kg</div></div>
              <div class="group-stat"><div class="val">${speeds.group} km/h</div><div class="lbl">集團巡航</div></div>
            </div>
          </div>`
      }
    }

    return `<div class="ride-card" id="ride-${r.id}">
      <div class="ride-header">
        <div class="ride-title">🚴 ${r.title}</div>
        ${isAdmin ? `<button class="edit-ride-btn" onclick="showEditRideForm('${r.id}')">✏️ 編輯</button>` : ''}
      </div>
      <div style="font-size:13px;color:#666;margin-bottom:10px">📅 ${r.date}</div>
      ${weatherHtml}
      <div class="ride-location-row">
        <div>
          <div style="font-size:11px;color:#999;margin-bottom:2px">第一集合點 ${r.time ? '· ⏰ '+r.time : ''}</div>
          <div style="font-size:14px;font-weight:500">${locName}</div>
          ${locAddr && locAddr !== locName ? `<div style="font-size:12px;color:#888">${locAddr}</div>` : ''}
        </div>
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locAddr||locName)}" target="_blank" class="nav-btn-link">🗺️ 導航</a>
      </div>
      ${r.location2 ? `
      <div class="ride-location-row" style="margin-top:6px">
        <div>
          <div style="font-size:11px;color:#999;margin-bottom:2px">第二集合點 ${r.time2 ? '· ⏰ '+r.time2 : ''}</div>
          <div style="font-size:14px;font-weight:500">${loc2Name}</div>
          ${loc2Addr && loc2Addr !== loc2Name ? `<div style="font-size:12px;color:#888">${loc2Addr}</div>` : ''}
        </div>
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc2Addr||loc2Name)}" target="_blank" class="nav-btn-link">🗺️ 導航</a>
      </div>` : ''}
      ${r.strava_url ? `<a href="${r.strava_url}" target="_blank" class="route-card strava-card"><div class="route-icon">🟠</div><div class="route-info"><div class="route-label">Strava 路線</div><div class="route-url">${r.strava_url.replace('https://','').slice(0,40)}...</div></div><div class="route-arrow">→</div></a>` : ''}
      ${r.garmin_url ? `<a href="${r.garmin_url}" target="_blank" class="route-card garmin-card"><div class="route-icon">🔵</div><div class="route-info"><div class="route-label">Garmin Connect 路線</div><div class="route-url">${r.garmin_url.replace('https://','').slice(0,40)}...</div></div><div class="route-arrow">→</div></a>` : ''}
      ${r.garmin_code ? `<div class="garmin-row"><div><div style="font-size:11px;color:#666;margin-bottom:2px">Garmin Code</div><div class="garmin-code">${r.garmin_code}</div></div><button class="copy-btn" onclick="copyCode('${r.garmin_code}')">複製</button></div>` : ''}
      ${r.note ? `<div class="ride-note">📝 ${r.note}</div>` : ''}
      ${groupStatsHtml}
      <div class="registration-section">
        <div class="reg-count">已報名 ${rideRegs.length} 人${r.max_participants ? ' / 上限 '+r.max_participants+' 人' : ''}</div>
        ${avatarsHtml ? `<div class="reg-avatars">${avatarsHtml}</div>` : ''}
        ${isFull && !isRegistered
          ? `<div class="reg-full">⚠️ 報名已滿</div>`
          : isPastDeadline && !isRegistered
          ? `<div class="reg-full">⚠️ 報名已截止</div>`
          : `<button class="reg-btn${isRegistered ? ' registered' : ''}" onclick="toggleRegistration('${r.id}', ${isRegistered})">
              ${isRegistered ? '✅ 已報名（點擊取消）' : '＋ 我要報名'}
            </button>`
        }
        ${r.deadline ? `<div class="reg-deadline">截止時間：${new Date(r.deadline).toLocaleString('zh-TW')}</div>` : ''}
        ${isAdmin ? `
          <div class="ride-admin-row">
            <button class="edit-btn" onclick="showAttendancePanel('${r.id}')">📋 出席審核</button>
            <button class="delete-btn" onclick="deleteRide('${r.id}')">刪除</button>
          </div>
          <div id="attendance-panel-${r.id}" style="display:none;margin-top:10px"></div>` : ''}
      </div>
      <div id="edit-ride-form-${r.id}" style="display:none"></div>
    </div>`
  }))
  document.getElementById('ride-list').innerHTML = rideCards.join('')
}

function showEditRideForm(rideId){
  const formEl = document.getElementById(`edit-ride-form-${rideId}`)
  if(formEl.style.display !== 'none'){ formEl.style.display = 'none'; return }
  const ride = null
  db.from('rides').select('*').eq('id', rideId).single().then(({ data: r }) => {
    if(!r) return
    const opts = allWeatherLocations.map(l => `<option value="${l.id}" data-lat="${l.lat}" data-lng="${l.lng}" data-name="${l.name}" ${r.weather_location_name===l.name?'selected':''}>${l.name}</option>`).join('')
    formEl.style.display = 'block'
    formEl.innerHTML = `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eee">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px">✏️ 編輯公告</div>
        <div class="form-row"><label>活動標題</label><input type="text" id="edit-title-${rideId}" value="${r.title}"></div>
        <div class="form-row"><label>日期</label><input type="date" id="edit-date-${rideId}" value="${r.date}"></div>
        <div class="form-row"><label>第一集合點時間</label><input type="time" id="edit-time-${rideId}" value="${r.time||''}"></div>
        <div class="form-row"><label>第二集合點時間</label><input type="time" id="edit-time2-${rideId}" value="${r.time2||''}"></div>
        <div class="form-row"><label>Garmin Code</label><input type="text" id="edit-garmin-${rideId}" value="${r.garmin_code||''}"></div>
        <div class="form-row"><label>Strava 路線</label><input type="text" id="edit-strava-${rideId}" value="${r.strava_url||''}"></div>
        <div class="form-row"><label>Garmin 路線</label><input type="text" id="edit-garmin-url-${rideId}" value="${r.garmin_url||''}"></div>
        <div class="form-row"><label>備註</label><input type="text" id="edit-note-${rideId}" value="${r.note||''}"></div>
        <div class="form-row"><label>人數上限</label><input type="number" id="edit-max-${rideId}" value="${r.max_participants||''}"></div>
        <div class="form-row"><label>🌤️ 天氣預報地點</label>
          <select id="edit-weather-${rideId}">
            <option value="">使用第一集合點天氣</option>
            ${opts}
            <option value="__custom__">＋ 自訂座標</option>
          </select>
        </div>
        <div style="display:flex;gap:8px;margin-top:4px">
          <button class="save-btn" onclick="updateRide('${rideId}')">💾 儲存</button>
          <button class="cancel-btn" onclick="document.getElementById('edit-ride-form-${rideId}').style.display='none'">取消</button>
        </div>
      </div>`
  })
}

async function updateRide(rideId){
  const weatherSel = document.getElementById(`edit-weather-${rideId}`)
  let weatherLat = null, weatherLng = null, weatherName = ''
  if(weatherSel.value && weatherSel.value !== '__custom__'){
    const opt = weatherSel.options[weatherSel.selectedIndex]
    weatherLat = parseFloat(opt.getAttribute('data-lat'))
    weatherLng = parseFloat(opt.getAttribute('data-lng'))
    weatherName = opt.getAttribute('data-name')
  }
  const payload = {
    title: document.getElementById(`edit-title-${rideId}`).value.trim(),
    date: document.getElementById(`edit-date-${rideId}`).value,
    time: document.getElementById(`edit-time-${rideId}`).value,
    time2: document.getElementById(`edit-time2-${rideId}`).value,
    garmin_code: document.getElementById(`edit-garmin-${rideId}`).value.trim(),
    strava_url: document.getElementById(`edit-strava-${rideId}`).value.trim(),
    garmin_url: document.getElementById(`edit-garmin-url-${rideId}`).value.trim(),
    note: document.getElementById(`edit-note-${rideId}`).value.trim(),
    max_participants: parseInt(document.getElementById(`edit-max-${rideId}`).value) || null,
    weather_lat: weatherLat,
    weather_lng: weatherLng,
    weather_location_name: weatherName
  }
  const { error } = await db.from('rides').update(payload).eq('id', rideId)
  if(error){ showToast('儲存失敗'); console.error(error); return }
  showToast('✅ 公告已更新！')
  renderRides()
}

async function toggleRegistration(rideId, isRegistered){
  if(isRegistered){
    await db.from('registrations').delete().eq('ride_id', rideId).eq('line_user_id', myProfile.line_user_id)
    showToast('已取消報名')
  } else {
    await db.from('registrations').insert({ ride_id: rideId, line_user_id: myProfile.line_user_id, name: myProfile.name, avatar_url: myProfile.avatar_url })
    showToast('✅ 報名成功！')
  }
  renderRides()
}

async function showAttendancePanel(rideId){
  const panel = document.getElementById(`attendance-panel-${rideId}`)
  if(panel.style.display !== 'none'){ panel.style.display = 'none'; return }
  panel.style.display = 'block'
  panel.innerHTML = '<div style="font-size:13px;color:#999">載入中...</div>'
  const { data: regs } = await db.from('registrations').select('*').eq('ride_id', rideId)
  const { data: atts } = await db.from('attendances').select('*').eq('ride_id', rideId)
  const attIds = new Set((atts||[]).map(a => a.line_user_id))
  panel.innerHTML = `
    <div style="font-size:13px;font-weight:600;margin-bottom:8px">📋 出席審核</div>
    <div class="attend-list">
      ${(regs||[]).map(m => `
        <div class="attend-row">
          ${avatarEl(m.avatar_url, m.name, 28)}
          <span class="name">${m.name}</span>
          <button class="attend-check${attIds.has(m.line_user_id) ? ' checked' : ''}"
            onclick="toggleAttendance('${rideId}','${m.line_user_id}','${m.name}','${m.avatar_url||''}',this)">
            ${attIds.has(m.line_user_id) ? '✅' : '○'}
          </button>
        </div>`).join('')}
    </div>
    <div style="font-size:13px;font-weight:600;margin:10px 0 6px">臨時加入</div>
    <div class="add-attendee-row">
      <select id="extra-member-${rideId}">
        <option value="">選擇成員</option>
        ${allRiders.filter(r => !(regs||[]).find(reg => reg.line_user_id === r.line_user_id))
          .map(r => `<option value="${r.line_user_id}" data-name="${r.name}" data-avatar="${r.avatar_url||''}">${r.name}</option>`).join('')}
      </select>
      <button onclick="addExtraAttendee('${rideId}')">加入</button>
    </div>`
}

async function toggleAttendance(rideId, lineUserId, name, avatarUrl, btn){
  const isChecked = btn.classList.contains('checked')
  if(isChecked){
    await db.from('attendances').delete().eq('ride_id', rideId).eq('line_user_id', lineUserId)
    const { data: rider } = await db.from('riders').select('attendance_count').eq('line_user_id', lineUserId).single()
    const newCount = Math.max(0, (rider?.attendance_count || 0) - 1)
    await db.from('riders').update({ attendance_count: newCount }).eq('line_user_id', lineUserId)
    btn.classList.remove('checked'); btn.textContent = '○'
    showToast('已取消出席')
  } else {
    await db.from('attendances').upsert({ ride_id: rideId, line_user_id: lineUserId, name, avatar_url: avatarUrl })
    const { data: rider } = await db.from('riders').select('attendance_count').eq('line_user_id', lineUserId).single()
    const newCount = (rider?.attendance_count || 0) + 1
    await db.from('riders').update({ attendance_count: newCount }).eq('line_user_id', lineUserId)
    btn.classList.add('checked'); btn.textContent = '✅'
    showToast('✅ 已確認出席')
  }
  await loadRiders()
  renderLeaderboard()
}

async function addExtraAttendee(rideId){
  const sel = document.getElementById(`extra-member-${rideId}`)
  const lineUserId = sel.value
  if(!lineUserId){ showToast('請選擇成員'); return }
  const name = sel.options[sel.selectedIndex].getAttribute('data-name')
  const avatarUrl = sel.options[sel.selectedIndex].getAttribute('data-avatar')
  await db.from('registrations').upsert({ ride_id: rideId, line_user_id: lineUserId, name, avatar_url: avatarUrl })
  showToast(`✅ ${name} 已加入`)
  await showAttendancePanel(rideId)
  await showAttendancePanel(rideId)
}

function copyCode(code){
  navigator.clipboard.writeText(code).then(() => showToast('✅ Garmin Code 已複製！'))
}

function showRideForm(){ document.getElementById('ride-form').style.display = 'block' }
function hideRideForm(){ document.getElementById('ride-form').style.display = 'none' }

async function saveRide(){
  const title = document.getElementById('ride-title').value.trim()
  const date = document.getElementById('ride-date').value
  const time = document.getElementById('ride-time').value
  const location1 = getLocationValue('1')
  if(!title || !date || !time || !location1){ showToast('請填寫標題、日期、時間和第一集合點'); return }
  const weatherSel = document.getElementById('ride-weather-location')
  let weatherLat = null, weatherLng = null, weatherName = ''
  if(weatherSel.value && weatherSel.value !== '__custom__'){
    const opt = weatherSel.options[weatherSel.selectedIndex]
    weatherLat = parseFloat(opt.getAttribute('data-lat'))
    weatherLng = parseFloat(opt.getAttribute('data-lng'))
    weatherName = opt.getAttribute('data-name')
  } else if(weatherSel.value === '__custom__'){
    weatherLat = parseFloat(document.getElementById('ride-weather-lat').value)
    weatherLng = parseFloat(document.getElementById('ride-weather-lng').value)
    weatherName = document.getElementById('ride-weather-name').value.trim()
  }
  const deadlineVal = document.getElementById('ride-deadline').value
  const maxVal = document.getElementById('ride-max').value
  const { error } = await db.from('rides').insert({
    title, date, time,
    time2: document.getElementById('ride-time2').value || '',
    location: location1,
    location2: getLocationValue('2'),
    garmin_code: document.getElementById('ride-garmin').value.trim(),
    strava_url: document.getElementById('ride-strava').value.trim(),
    garmin_url: document.getElementById('ride-garmin-url').value.trim(),
    note: document.getElementById('ride-note').value.trim(),
    deadline: deadlineVal ? new Date(deadlineVal).toISOString() : null,
    max_participants: maxVal ? parseInt(maxVal) : null,
    weather_lat: weatherLat,
    weather_lng: weatherLng,
    weather_location_name: weatherName
  })
  if(error){ showToast('發布失敗，請再試一次'); console.error(error); return }
  showToast('✅ 團騎公告發布成功！')
  hideRideForm()
  renderRides()
}

async function deleteRide(id){
  await db.from('rides').delete().eq('id', id)
  showToast('已刪除')
  renderRides()
}

async function renderAdmin(){
  const { data } = await db.from('riders').select('*').order('last_seen', { ascending: false })
  const pending = (data || []).filter(r => r.status === 'pending')
  const approved = (data || []).filter(r => r.status === 'approved')
  const badge = document.getElementById('pending-count')
  badge.textContent = pending.length > 0 ? pending.length : ''
  badge.style.display = pending.length > 0 ? 'inline-block' : 'none'
  document.getElementById('admin-pending').innerHTML = pending.length === 0
    ? `<div class="empty-state">沒有待審核的成員</div>`
    : pending.map(r => `
      <div class="admin-card">
        <div class="admin-card-top">
          ${avatarEl(r.avatar_url, r.name, 40)}
          <div class="admin-info">
            <div class="admin-name">${r.name}</div>
            <div class="admin-meta">FTP ${r.ftp||'未填'}W · ${r.weight||'未填'}kg${r.ftp&&r.weight?' · '+(r.ftp/r.weight).toFixed(2)+' W/kg':''}</div>
          </div>
        </div>
        ${r.mood ? `<div class="rider-mood" style="margin-bottom:8px">💬 ${r.mood}</div>` : ''}
        <div class="admin-actions">
          <button class="approve-btn" onclick="approveMember('${r.line_user_id}')">✅ 核准</button>
          <button class="kick-btn" onclick="kickMember('${r.line_user_id}')">❌ 拒絕</button>
        </div>
      </div>`).join('')
  document.getElementById('admin-active').innerHTML = approved.length === 0
    ? `<div class="empty-state">沒有已核准的成員</div>`
    : approved.map(r => {
      const status = activityStatus(r.last_seen)
      return `<div class="admin-card">
        <div class="admin-card-top">
          ${avatarEl(r.avatar_url, r.name, 40)}
          <div class="admin-info">
            <div class="admin-name">${r.name} ${r.is_admin ? '👑' : ''}</div>
            <div class="admin-meta"><span class="status-dot ${status.cls}"></span>${status.label}</div>
          </div>
        </div>
        <div class="admin-stats-row">
          <div class="admin-stat"><div class="val">${r.ftp||'—'}W</div><div class="lbl">FTP</div></div>
          <div class="admin-stat"><div class="val">${timeAgo(r.updated_at)}</div><div class="lbl">上次更新</div></div>
          <div class="admin-stat"><div class="val">${timeAgo(r.last_seen)}</div><div class="lbl">上次上線</div></div>
        </div>
        <div class="admin-stats-row">
          <div class="admin-stat"><div class="val">${r.attendance_count||0}</div><div class="lbl">出席次數</div></div>
          <div class="admin-stat" style="grid-column:span 2"><div class="val">${getAttendanceBadge(r.attendance_count||0)||'—'}</div><div class="lbl">稱號</div></div>
        </div>
        <div class="admin-actions">
          <button class="kick-btn" onclick="kickMember('${r.line_user_id}')">踢除成員</button>
        </div>
      </div>`
    }).join('')
  renderLocationAdmin()
  renderGuidelineAdmin()
}

async function renderLocationAdmin(){
  const { data } = await db.from('locations').select('*').order('sort_order')
  document.getElementById('location-list').innerHTML = (data||[]).map(l => `
    <div class="admin-card" style="display:flex;align-items:center;gap:10px">
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600">${l.name}</div>
        <div style="font-size:12px;color:#888;margin-top:2px">${l.address}</div>
      </div>
      <button class="delete-btn" onclick="deleteLocation('${l.id}')">刪除</button>
    </div>`).join('')
}

async function saveLocation(){
  const name = document.getElementById('loc-name').value.trim()
  const address = document.getElementById('loc-address').value.trim()
  if(!name || !address){ showToast('請填寫地點名稱和地址'); return }
  await db.from('locations').insert({ name, address, sort_order: 99 })
  document.getElementById('loc-name').value = ''
  document.getElementById('loc-address').value = ''
  showToast('✅ 地點已新增！')
  await loadLocations()
  renderLocationAdmin()
}

async function deleteLocation(id){
  await db.from('locations').delete().eq('id', id)
  showToast('已刪除')
  await loadLocations()
  renderLocationAdmin()
}

async function renderGuidelineAdmin(){
  const { data } = await db.from('guidelines').select('*').order('sort_order')
  document.getElementById('guideline-admin-list').innerHTML = (data||[]).map(g => `
    <div class="guideline-edit-card">
      <div class="guideline-edit-title">${g.category}</div>
      <div class="guideline-edit-preview">${g.content.slice(0,60)}...</div>
      <div class="guideline-edit-actions">
        <button class="edit-btn" onclick="editGuideline('${g.id}', \`${g.category.replace(/`/g,"'")}\`, \`${g.content.replace(/`/g,"'")}\`)">✏️ 編輯</button>
        <button class="delete-btn" onclick="deleteGuideline('${g.id}')">刪除</button>
      </div>
    </div>`).join('')
}

async function saveGuideline(){
  const category = document.getElementById('gl-category').value.trim()
  const content = document.getElementById('gl-content').value.trim()
  if(!category || !content){ showToast('請填寫分類名稱和內容'); return }
  await db.from('guidelines').insert({ category, content, sort_order: 99 })
  document.getElementById('gl-category').value = ''
  document.getElementById('gl-content').value = ''
  showToast('✅ 已新增！')
  renderGuidelineAdmin()
  renderPace()
}

async function deleteGuideline(id){
  await db.from('guidelines').delete().eq('id', id)
  showToast('已刪除')
  renderGuidelineAdmin()
  renderPace()
}

function editGuideline(id, category, content){
  document.getElementById('gl-category').value = category
  document.getElementById('gl-content').value = content
  const btn = document.querySelector('#admin-guidelines .save-btn')
  btn.textContent = '💾 更新內容'
  btn.onclick = async () => {
    const newCategory = document.getElementById('gl-category').value.trim()
    const newContent = document.getElementById('gl-content').value.trim()
    if(!newCategory || !newContent){ showToast('請填寫分類名稱和內容'); return }
    await db.from('guidelines').update({ category: newCategory, content: newContent }).eq('id', id)
    showToast('✅ 已更新！')
    btn.textContent = '新增分類'
    btn.onclick = saveGuideline
    document.getElementById('gl-category').value = ''
    document.getElementById('gl-content').value = ''
    renderGuidelineAdmin()
    renderPace()
  }
  document.getElementById('gl-category').scrollIntoView({ behavior: 'smooth' })
}

async function approveMember(lineUserId){
  await db.from('riders').update({ status: 'approved' }).eq('line_user_id', lineUserId)
  showToast('✅ 已核准')
  renderAdmin()
  await loadRiders()
  renderLeaderboard()
}

async function kickMember(lineUserId){
  await db.from('riders').delete().eq('line_user_id', lineUserId)
  showToast('已移除成員')
  renderAdmin()
  await loadRiders()
  renderLeaderboard()
}

function updatePreview(){
  const ftp = parseInt(document.getElementById('inp-ftp').value)
  const weight = parseFloat(document.getElementById('inp-weight').value)
  const preview = document.getElementById('wkg-preview')
  if(ftp && weight){
    const v = ftp / weight
    const ct = cat(v)
    document.getElementById('preview-val').textContent = v.toFixed(2)
    const badge = document.getElementById('preview-cat')
    badge.textContent = ct.label
    badge.className = 'cat-badge ' + ct.cls
    preview.style.display = 'flex'
  } else { preview.style.display = 'none' }
}

async function saveProfile(){
  if(!myProfile){ showToast('請先登入 LINE'); return }
  const ftp = parseInt(document.getElementById('inp-ftp').value)
  const weight = parseFloat(document.getElementById('inp-weight').value)
  if(!ftp || !weight){ showToast('請填寫 FTP 和體重'); return }
  const me = allRiders.find(r => r.line_user_id === myProfile.line_user_id)
  const count = me?.attendance_count || 0
  const payload = {
    name: myProfile.name,
    avatar_url: myProfile.avatar_url,
    ftp, weight,
    tire_width: parseInt(document.getElementById('inp-tire').value) || null,
    mood: document.getElementById('inp-mood').value.trim(),
    name_color: count >= 10 ? document.getElementById('inp-name-color').value : '',
    z1: parseInt(document.getElementById('z1').value) || 0,
    z2: parseInt(document.getElementById('z2').value) || 0,
    z3: parseInt(document.getElementById('z3').value) || 0,
    z4: parseInt(document.getElementById('z4').value) || 0,
    z5: parseInt(document.getElementById('z5').value) || 0,
    updated_at: new Date().toISOString()
  }
  const { error } = await db.from('riders').update(payload).eq('line_user_id', myProfile.line_user_id)
  if(error){ showToast('儲存失敗，請再試一次'); console.error(error); return }
  showToast('✅ 資料更新成功！')
  await loadRiders()
  renderLeaderboard()
  renderMatch()
  renderPace()
}

function filterCat(v, el){
  currentFilter = v
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'))
  el.classList.add('active')
  renderLeaderboard()
}

function switchTab(id){
  const tabs = ['leaderboard','match','pace','ride','profile','admin']
  document.querySelectorAll('.nav-btn').forEach((b,i) => {
    b.classList.toggle('active', tabs[i] === id)
  })
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
  document.getElementById('tab-'+id).classList.add('active')
  if(id === 'admin') renderAdmin()
  if(id === 'pace') renderPace()
}

function switchAdminTab(id){
  const tabs = ['pending','active','locations','guidelines']
  document.querySelectorAll('.admin-tab').forEach((b,i) => {
    b.classList.toggle('active', tabs[i] === id)
  })
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'))
  document.getElementById('admin-'+id).classList.add('active')
}

init()
