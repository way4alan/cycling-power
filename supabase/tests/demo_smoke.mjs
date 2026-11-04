import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire('/tmp/pace-jsdom/package.json')
const { JSDOM } = require('jsdom')

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
const icons = readFileSync(new URL('../../icons.js', import.meta.url), 'utf8')
const app = readFileSync(new URL('../../app.js', import.meta.url), 'utf8')

function boot(url) {
  const page = html.replace('</body>', `<script>${icons}<\/script><script>${app}<\/script></body>`)
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

member.window.close()
admin.window.close()
console.log('PASS demo=1 member and admin=1 stay on the local sample data')
process.exit(0)
