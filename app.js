const SUPABASE_URL = 'https://yvgjaljdxmsmtljcmemp.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Z2phbGpkeG1zbXRsamNtZW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTExMDYsImV4cCI6MjA5NzY4NzEwNn0.Bpfwwf_MfG_foTVk1oc3tKf6oBP7_ShRM1Nu0hR-Pz0'
const LIFF_ID = '2010470481-aY3CdaJS'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

let myProfile = null
let myData = null
let allRiders = []
let allLocations = []
let currentFilter = 'all'
let isAdmin = false

const TIRE_COEFFICIENTS = {
  25: { front: 0.91, rear: 1.35 },
  26: { front: 0.87, rear: 1.29 },
  28: { front: 0.79, rear: 1.18 },
  29: { front: 0.75, rear: 1.12 },
  30: { front: 0.72, rear: 1.07 },
  32: { front: 0.66, rear: 0.98 }
}

function calcTirePressure(weight, tireWidth){
  const coef = TIRE_COEFFICIENTS[tireWidth]
  if(!coef || !weight) return null
  const openFront = Math.round(weight * coef.front)
  const openRear = Math.round(weight * coef.rear)
  return {
    open: {
      front: { low: openFront, high: openFront + 5 },
      rear: { low: openRear, high: openRear + 3 }
    },
    tubeless: {
      front: { low: openFront - 10, high: openFront - 5 },
      rear: { low: openRear - 10, high: openRear - 7 }
    }
  }
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
    if(!me){
      showPendingForm(false)
      return
    }
    if(me.status === 'pending'){
      showPendingForm(true, me)
      return
    }
    await updateLastSeen()
    isAdmin = me.is_admin === true
    document.getElementById('app').style.display = 'block'
    if(isAdmin) document.getElementById('admin-nav-btn').style.display = 'flex'
    await loadLocations()
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
      <div class="form-row">
        <label>FTP（瓦特）</label>
        <input type="number" id="p-ftp" placeholder="例如 280" value="${ftp}" oninput="updatePendingPreview()">
      </div>
      <div class="form-row">
        <label>體重（kg）</label>
        <input type="number" id="p-weight" placeholder="例如 70" value="${weight}" oninput="updatePendingPreview()">
      </div>
      <div class="wkg-preview" id="p-wkg-preview" style="display:${ftp&&weight?'flex':'none'}">
        <span id="p-preview-val">${ftp&&weight?(ftp/weight).toFixed(2):'—'}</span> W/kg
        <span class="cat-badge" id="p-preview-cat"></span>
      </div>
      <div class="form-row">
        <label>胎寬</label>
        <select id="p-tire">
          <option value="">請選擇胎寬</option>
          ${[25,26,28,29,30,32].map(w=>`<option value="${w}" ${tireWidth==w?'selected':''}>${w}c</option>`).join('')}
        </select>
      </div>
      <div class="form-row">
        <label>心情小語（選填）</label>
        <input type="text" id="p-mood" placeholder="例如：新手上路 🙏" maxlength="30" value="${mood}">
      </div>
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
  } else {
    preview.style.display = 'none'
  }
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
  const { data: existing } = await db.from('riders')
    .select('id').eq('line_user_id', myProfile.line_user_id).single()
  if(existing){
    await db.from('riders').update(payload).eq('line_user_id', myProfile.line_user_id)
  } else {
    await db.from('riders').insert({...payload, last_seen: new Date().toISOString()})
  }
  showToast('✅ 資料已儲存，等待管理員審核！')
}

async function updateLastSeen(){
  await db.from('riders')
    .update({ last_seen: new Date().toISOString() })
    .eq('line_user_id', myProfile.line_user_id)
}

async function loadRiders(){
  const { data } = await db.from('riders')
    .select('*')
    .eq('status', 'approved')
    .gt('ftp', 0)
    .gt('weight', 0)
    .order('ftp', { ascending: false })
  allRiders = data || []
}

async function loadLocations(){
  const { data } = await db.from('locations').select('*').order('sort_order')
  allLocations = data || []
  renderLocationSelects()
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
  if(sel.value === '__custom__'){
    custom.style.display = 'block'
    custom.focus()
  } else {
    custom.style.display = 'none'
  }
}

function getLocationValue(num){
  const sel = document.getElementById(`ride-location${num}`)
  if(!sel || !sel.value || sel.value === '') return ''
  if(sel.value === '__custom__'){
    return document.getElementById(`ride-location${num}-custom`).value.trim()
  }
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
    return `<div class="rider-row${isMe ? ' is-me' : ''}">
      <div class="rider-main">
        <div class="rank">${rank < 3 ? medals[rank] : rank+1}</div>
        ${avatarEl(r.avatar_url, r.name)}
        <div class="rider-info">
          <div class="rider-name">${r.name}${isMe ? '<span class="me-tag">我</span>' : ''}</div>
          <div class="rider-cat"><span class="cat-badge ${ct.cls}">${ct.label}</span></div>
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
  }
}

async function renderPace(){
  const me = allRiders.find(r => r.line_user_id === myProfile.line_user_id) || myData
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
        <div class="tire-card open">
          <div class="tire-card-title">Open 胎</div>
          <div class="tire-wheel-row">
            <div class="tire-wheel">
              <div class="tire-wheel-label">前輪</div>
              <div class="tire-psi">${pressure.open.front.low}</div>
              <div class="tire-psi-range">~${pressure.open.front.high} psi</div>
            </div>
            <div class="tire-wheel">
              <div class="tire-wheel-label">後輪</div>
              <div class="tire-psi">${pressure.open.rear.low}</div>
              <div class="tire-psi-range">~${pressure.open.rear.high} psi</div>
            </div>
          </div>
        </div>
        <div class="tire-card tubeless">
          <div class="tire-card-title">Tubeless</div>
          <div class="tire-wheel-row">
            <div class="tire-wheel">
              <div class="tire-wheel-label">前輪</div>
              <div class="tire-psi">${pressure.tubeless.front.low}</div>
              <div class="tire-psi-range">~${pressure.tubeless.front.high} psi</div>
            </div>
            <div class="tire-wheel">
              <div class="tire-wheel-label">後輪</div>
              <div class="tire-psi">${pressure.tubeless.rear.low}</div>
              <div class="tire-psi-range">~${pressure.tubeless.rear.high} psi</div>
            </div>
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
  document.getElementById('ride-list').innerHTML = rides.length === 0
    ? `<div class="empty-state">目前沒有團騎公告</div>`
    : rides.map(r => {
      const parts = r.location ? r.location.split('｜') : []
      const locName = parts.length > 1 ? parts[0] : r.location
      const locAddr = parts.length > 1 ? parts[1] : r.location
      const loc2Parts = r.location2 ? r.location2.split('｜') : []
      const loc2Name = loc2Parts.length > 1 ? loc2Parts[0] : r.location2
      const loc2Addr = loc2Parts.length > 1 ? loc2Parts[1] : r.location2
      return `<div class="ride-card">
        <div class="ride-title">🚴 ${r.title}</div>
        <div class="ride-info-grid">
          <div class="ride-info-item"><div><span class="label">日期</span>${r.date}</div></div>
          <div class="ride-info-item"><div><span class="label">集合時間</span>${r.time}</div></div>
        </div>
        <div class="ride-location-row">
          <div>
            <div style="font-size:11px;color:#999;margin-bottom:2px">第一集合點</div>
            <div style="font-size:14px;font-weight:500">${locName}</div>
            ${locAddr && locAddr !== locName ? `<div style="font-size:12px;color:#888">${locAddr}</div>` : ''}
          </div>
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locAddr||locName)}" target="_blank" class="nav-btn-link">🗺️ 導航</a>
        </div>
        ${r.location2 ? `
        <div class="ride-location-row" style="margin-top:8px">
          <div>
            <div style="font-size:11px;color:#999;margin-bottom:2px">第二集合點</div>
            <div style="font-size:14px;font-weight:500">${loc2Name}</div>
            ${loc2Addr && loc2Addr !== loc2Name ? `<div style="font-size:12px;color:#888">${loc2Addr}</div>` : ''}
          </div>
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc2Addr||loc2Name)}" target="_blank" class="nav-btn-link">🗺️ 導航</a>
        </div>` : ''}
        ${r.strava_url ? `
          <a href="${r.strava_url}" target="_blank" class="route-card strava-card">
            <div class="route-icon">🟠</div>
            <div class="route-info">
              <div class="route-label">Strava 路線</div>
              <div class="route-url">${r.strava_url.replace('https://','').slice(0,40)}...</div>
            </div>
            <div class="route-arrow">→</div>
          </a>` : ''}
        ${r.garmin_url ? `
          <a href="${r.garmin_url}" target="_blank" class="route-card garmin-card">
            <div class="route-icon">🔵</div>
            <div class="route-info">
              <div class="route-label">Garmin Connect 路線</div>
              <div class="route-url">${r.garmin_url.replace('https://','').slice(0,40)}...</div>
            </div>
            <div class="route-arrow">→</div>
          </a>` : ''}
        ${r.garmin_code ? `
          <div class="garmin-row">
            <div>
              <div style="font-size:11px;color:#666;margin-bottom:2px">Garmin Code</div>
              <div class="garmin-code">${r.garmin_code}</div>
            </div>
            <button class="copy-btn" onclick="copyCode('${r.garmin_code}')">複製</button>
          </div>` : ''}
        ${r.note ? `<div class="ride-note">📝 ${r.note}</div>` : ''}
        ${isAdmin ? `<div class="ride-admin-row"><button class="delete-btn" onclick="deleteRide('${r.id}')">刪除</button></div>` : ''}
      </div>`
    }).join('')
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
  const { error } = await db.from('rides').insert({
    title, date, time,
    location: location1,
    location2: getLocationValue('2'),
    garmin_code: document.getElementById('ride-garmin').value.trim(),
    strava_url: document.getElementById('ride-strava').value.trim(),
    garmin_url: document.getElementById('ride-garmin-url').value.trim(),
    note: document.getElementById('ride-note').value.trim()
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
          <div class="admin-stat"><div class="val">${timeAgo(r.updated_at)}</div><div class="lbl">上次更新資料</div></div>
          <div class="admin-stat"><div class="val">${timeAgo(r.last_seen)}</div><div class="lbl">上次上線</div></div>
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
  } else {
    preview.style.display = 'none'
  }
}

async function saveProfile(){
  if(!myProfile){ showToast('請先登入 LINE'); return }
  const ftp = parseInt(document.getElementById('inp-ftp').value)
  const weight = parseFloat(document.getElementById('inp-weight').value)
  if(!ftp || !weight){ showToast('請填寫 FTP 和體重'); return }
  const payload = {
    name: myProfile.name,
    avatar_url: myProfile.avatar_url,
    ftp, weight,
    tire_width: parseInt(document.getElementById('inp-tire').value) || null,
    mood: document.getElementById('inp-mood').value.trim(),
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
