const SUPABASE_URL = 'https://yvgjaljdxmsmtljcmemp.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Z2phbGpkeG1zbXRsamNtZW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTExMDYsImV4cCI6MjA5NzY4NzEwNn0.Bpfwwf_MfG_foTVk1oc3tKf6oBP7_ShRM1Nu0hR-Pz0'
const LIFF_ID = '2010470481-aY3CdaJS'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

let myProfile = null
let myData = null
let allRiders = []
let currentFilter = 'all'
let isAdmin = false

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
    await updateLastSeen()
    const { data: me } = await db.from('riders')
      .select('*').eq('line_user_id', myProfile.line_user_id).single()
    myData = me

    if(!me){
      await db.from('riders').insert({
        line_user_id: myProfile.line_user_id,
        name: myProfile.name,
        avatar_url: myProfile.avatar_url,
        ftp: 0, weight: 0,
        status: 'pending',
        last_seen: new Date().toISOString()
      })
      document.getElementById('loading').style.display = 'none'
      document.getElementById('pending-screen').style.display = 'flex'
      return
    }

    if(me.status === 'pending'){
      document.getElementById('loading').style.display = 'none'
      document.getElementById('pending-screen').style.display = 'flex'
      return
    }

    isAdmin = me.is_admin === true
    document.getElementById('loading').style.display = 'none'
    document.getElementById('app').style.display = 'block'
    if(isAdmin){
      document.getElementById('admin-nav-btn').style.display = 'flex'
    }
    await loadRiders()
    renderLeaderboard()
    renderMatch()
    renderProfile()
    renderRides()
    if(isAdmin) renderAdmin()
  } catch(e){
    document.querySelector('.loading-text').textContent = '載入失敗，請重新整理'
    console.error(e)
  }
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
    .order('ftp', { ascending: false })
  allRiders = data || []
}

function renderLeaderboard(){
  const sorted = [...allRiders].sort((a,b) => wkg(b) - wkg(a))
  const filtered = currentFilter === 'all' ? sorted : sorted.filter(r => cat(wkg(r)).label.startsWith(currentFilter))
  const avgFtp = allRiders.length ? Math.round(allRiders.reduce((s,r) => s+r.ftp, 0) / allRiders.length) : '—'
  const avgW = allRiders.length ? (allRiders.reduce((s,r) => s+wkg(r), 0) / allRiders.length).toFixed(2) : '—'
  document.getElementById('avg-ftp').textContent = avgFtp
  document.getElementById('avg-wkg').textContent = avgW
  document.getElementById('member-count').textContent = allRiders.length
  const medals = ['🥇','🥈','🥉']
  document.getElementById('rider-list').innerHTML = filtered.map((r, i) => {
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
    if(me.z1) document.getElementById('z1').value = me.z1
    if(me.z2) document.getElementById('z2').value = me.z2
    if(me.z3) document.getElementById('z3').value = me.z3
    if(me.z4) document.getElementById('z4').value = me.z4
    if(me.z5) document.getElementById('z5').value = me.z5
    updatePreview()
  }
}

async function renderRides(){
  const { data } = await db.from('rides').select('*').order('date', { ascending: true })
  const rides = data || []
  if(isAdmin) document.getElementById('add-ride-btn').style.display = 'block'
  document.getElementById('ride-list').innerHTML = rides.length === 0
    ? `<div class="empty-state">目前沒有團騎公告</div>`
    : rides.map(r => `
      <div class="ride-card">
        <div class="ride-title">🚴 ${r.title}</div>
        <div class="ride-info-grid">
          <div class="ride-info-item"><div><span class="label">日期</span>${r.date}</div></div>
          <div class="ride-info-item"><div><span class="label">集合時間</span>${r.time}</div></div>
          <div class="ride-info-item" style="grid-column:1/-1"><div><span class="label">集合地點</span>${r.location}</div></div>
        </div>
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
      </div>`).join('')
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
  const location = document.getElementById('ride-location').value.trim()
  if(!title || !date || !time || !location){ showToast('請填寫標題、日期、時間和地點'); return }
  const { error } = await db.from('rides').insert({
    title, date, time, location,
    garmin_code: document.getElementById('ride-garmin').value.trim(),
    note: document.getElementById('ride-note').value.trim()
  })
  if(error){ showToast('發布失敗，請再試一次'); return }
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
            <div class="admin-meta">申請時間：${timeAgo(r.updated_at)}</div>
          </div>
        </div>
        <div class="admin-actions">
          <button class="approve-btn" onclick="approveMember('${r.line_user_id}')">✅ 核准</button>
          <button class="kick-btn" onclick="kickMember('${r.line_user_id}')">❌ 拒絕</button>
        </div>
      </div>`).join('')

  document.getElementById('admin-active').innerHTML = approved.length === 0
    ? `<div class="empty-state">沒有已核准的成員</div>`
    : approved.map(r => {
      const status = activityStatus(r.last_seen)
      const ftpAge = timeAgo(r.updated_at)
      const lastSeen = timeAgo(r.last_seen)
      return `<div class="admin-card">
        <div class="admin-card-top">
          ${avatarEl(r.avatar_url, r.name, 40)}
          <div class="admin-info">
            <div class="admin-name">${r.name} ${r.is_admin ? '👑' : ''}</div>
            <div class="admin-meta"><span class="status-dot ${status.cls}"></span>${status.label}</div>
          </div>
        </div>
        <div class="admin-stats-row">
          <div class="admin-stat"><div class="val">${r.ftp || '—'}W</div><div class="lbl">FTP</div></div>
          <div class="admin-stat"><div class="val">${ftpAge}</div><div class="lbl">上次更新資料</div></div>
          <div class="admin-stat"><div class="val">${lastSeen}</div><div class="lbl">上次上線</div></div>
        </div>
        <div class="admin-actions">
          <button class="kick-btn" onclick="kickMember('${r.line_user_id}')">踢除成員</button>
        </div>
      </div>`
    }).join('')
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
}

function filterCat(v, el){
  currentFilter = v
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'))
  el.classList.add('active')
  renderLeaderboard()
}

function switchTab(id){
  document.querySelectorAll('.nav-btn').forEach((b,i) => {
    b.classList.toggle('active', ['leaderboard','ride','match','profile','admin'][i] === id)
  })
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
  document.getElementById('tab-'+id).classList.add('active')
  if(id === 'admin') renderAdmin()
}

function switchAdminTab(id){
  document.querySelectorAll('.admin-tab').forEach((b,i) => {
    b.classList.toggle('active', ['pending','active'][i] === id)
  })
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'))
  document.getElementById('admin-'+id).classList.add('active')
}

init()
