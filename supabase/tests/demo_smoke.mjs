import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('/tmp/pace-jsdom/package.json')
const { JSDOM } = require('jsdom')

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const core = readFileSync(new URL('../../lib/pace-core.js', import.meta.url), 'utf8')
const icons = readFileSync(new URL('../../icons.js', import.meta.url), 'utf8')
const app = readFileSync(new URL('../../app.js', import.meta.url), 'utf8')

function boot(url) {
  const page = html.replace('</body>', `<script>${core}<\/script><script>${icons}<\/script><script>${app}<\/script></body>`)
  return new JSDOM(page, { url, runScripts: 'dangerously', pretendToBeVisual: true })
}

async function settle(dom) {
  await new Promise((resolve) => setTimeout(resolve, 400))
  return dom.window.document
}

function appText(doc) {
  return doc.getElementById('app').textContent
}

const member = boot('http://127.0.0.1/?demo=1')
const memberDoc = await settle(member)
if (memberDoc.getElementById('app').hidden || memberDoc.querySelector('.loading-text').textContent.includes('失敗')) {
  console.error('demo member did not finish loading')
  process.exit(1)
}
const memberText = appText(memberDoc)
if (!memberText.includes('阿揚') || !memberDoc.getElementById('ride-list').textContent.includes('週日晨騎')) {
  console.error('demo member UI missing expected rider or ride')
  process.exit(1)
}
const hero = memberDoc.getElementById('next-ride').textContent
if (!hero.includes('武嶺') || !hero.includes('週日晨騎') || !hero.includes('已報名') || !hero.includes('公告')) {
  console.error('home did not show the challenge hero and compact Sunday signup')
  process.exit(1)
}
if (!memberDoc.getElementById('monthly-test-hint').textContent.includes('檢定')) {
  console.error('monthly test hint missing')
  process.exit(1)
}
const fallback = boot('http://127.0.0.1/?demo=1&scenario=fallback')
const fallbackDoc = await settle(fallback)
const fallbackHome = fallbackDoc.getElementById('next-ride').textContent
if (fallbackHome.includes('武嶺') || !fallbackHome.includes('週日晨騎') || !fallbackHome.includes('週日固定團騎')) {
  console.error('home did not fall back to the Sunday ride')
  process.exit(1)
}
fallback.window.close()
const podium = memberDoc.getElementById('podium').textContent
if (!podium.includes('阿揚') || podium.includes('小林')) {
  console.error('podium did not keep recent qualifiers separate from the power list')
  process.exit(1)
}
const firstRow = memberDoc.querySelector('#rider-list .rider-name')
if (!firstRow || !firstRow.textContent.includes('小林')) {
  console.error('full power ranking no longer starts with the highest W/kg')
  process.exit(1)
}
if (!memberDoc.getElementById('monthly-board').textContent.includes('大熊')) {
  console.error('monthly attendance board missing the consistent rider')
  process.exit(1)
}
if (memberDoc.documentElement.scrollWidth > memberDoc.documentElement.clientWidth + 2) {
  console.error('demo page overflows horizontally')
  process.exit(1)
}
if (memberDoc.getElementById('admin-entry').textContent.includes('成員管理')) {
  console.error('demo member should not see admin entry')
  process.exit(1)
}

const admin = boot('http://127.0.0.1/?demo=1&admin=1')
const adminDoc = await settle(admin)
if (adminDoc.querySelector('.loading-text').textContent.includes('失敗')) {
  console.error('demo admin did not finish loading')
  process.exit(1)
}
if (!adminDoc.getElementById('admin-entry').textContent.includes('成員管理')) {
  console.error('demo admin entry missing')
  process.exit(1)
}
if (typeof admin.window.liff !== 'undefined') {
  console.error('demo mode loaded LIFF')
  process.exit(1)
}

const studio = boot('http://127.0.0.1/?demo=1&admin=1&open=studio')
const studioDoc = await settle(studio)
const studioText = studioDoc.getElementById('admin-studio').textContent
if (!studioText.includes('尚未') || !studioText.includes('不會帶入') || studioText.includes('OLD-DEMO')) {
  console.error('copy form published or carried an old GroupRide code')
  process.exit(1)
}
const route = boot('http://127.0.0.1/?demo=1&admin=1&open=route')
const routeDoc = await settle(route)
const routeText = routeDoc.getElementById('admin-routes').textContent
if (!routeText.includes('估算') || !routeDoc.querySelector('#admin-routes .route-svg')) {
  console.error('route preview missing the GPX estimate')
  process.exit(1)
}
const announce = boot('http://127.0.0.1/?demo=1&open=announce&ride=ride-next')
const announceDoc = await settle(announce)
const announceText = announceDoc.getElementById('announce-text').textContent
if (announceDoc.getElementById('announce').hidden || !announceText.includes('打開這一場') || announceText.includes('待補') || announceText.includes('GroupRide')) {
  console.error('announcement preview invented a missing value or did not deep link')
  process.exit(1)
}
if (!announceText.includes('ride-next')) {
  console.error('announcement deep link is not for that ride')
  process.exit(1)
}

member.window.close()
admin.window.close()
studio.window.close()
route.window.close()
announce.window.close()
console.log('PASS demo=1 member and admin=1 stay on the local sample data')
process.exit(0)
