const SUPABASE_URL = 'https://yvgjaljdxmsmtljcmemp.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl2Z2phbGpkeG1zbXRsamNtZW1wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMTExMDYsImV4cCI6MjA5NzY4NzEwNn0.Bpfwwf_MfG_foTVk1oc3tKf6oBP7_ShRM1Nu0hR-Pz0'
const LIFF_ID = '2010470481-aY3CdaJS'

const { createClient } = supabase
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

let myProfile = null
let allRiders = []
let currentFilter = 'all'

function wkg(r){ return (r.ftp / r.weight) }
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
  const initials = name.slice(0,2)
  const colors = ['#534AB7','#1D9E75','#D85A30','#D4537E','#378ADD','#639922','#BA7517']
  const bg = colors[name.charCodeAt(0) % colors.length]
  return `<div class="avatar-placeholder" style="width:${size}px;height:${size}px;background:${bg};color:#fff">${initials}</div>`
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
    if(!liff.isLoggedIn()){
      liff.login()
      return
    }
    const profile = await liff.getProfile()
    myProfile = {
      line_user_id: profile.userId,
      name: profile.displayName,
      avatar_url: profile.pictureUrl
    }
    document.getElementById('loading').style.display = 'none'
    document.getElementById('app').style.display = 'block'
    await loadRiders()
    renderLeaderboard()
    renderMatch()
    renderProfile()
  } catch(e){
    document.querySelector('.loading-text').textContent = '載入失敗，請重新整理'
    console.error(e)
  }
}

async function loadRiders(){
  const { data } = await db.from('riders').select('*').order('ftp', { ascending: false })
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
      <div class="rank">${rank < 3 ? medals[rank] :
