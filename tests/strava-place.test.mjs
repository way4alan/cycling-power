import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8')
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

function slice(source, start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  assert.ok(from >= 0 && to > from, start)
  return source.slice(from, to)
}

test('strava connecting lives on the profile page and the garage keeps a status line', () => {
  const sectionAt = html.indexOf('id="strava-section"')
  const deauthAt = html.indexOf('id="strava-deauth"')
  const heroAt = html.indexOf('id="profile-hero"')
  assert.ok(sectionAt > 0 && deauthAt > sectionAt && heroAt > deauthAt)
  assert.match(html, /Strava 連動/)
  assert.equal(html.includes('id="support-line"'), false)

  const garage = slice(app, 'function garageHtml', 'function renderGear')
  assert.equal(garage.includes('stravaConsent'), false)
  assert.equal(garage.includes('stravaConnectControl'), false)
  assert.match(garage, /stravaGarageStatusLine/)
  assert.match(garage, /stravaPendingBlock/)
  assert.match(garage, /stravaMapSection/)

  const panel = slice(app, 'function stravaPanelHtml', 'function renderStravaPanel')
  assert.match(panel, /stravaConsent/)
  assert.match(panel, /stravaConnectControl/)
  assert.match(panel, /strava-sync/)
  assert.match(panel, /strava-disconnect/)
  assert.equal(panel.includes('strava-ride'), false)

  const show = slice(app, 'function showStravaResult', 'async function finishStravaOAuth')
  assert.match(show, /focusStravaSection/)
  assert.equal(show.includes('gearOpen = true'), false)
  assert.match(app, /section'\) === 'strava'/)
  assert.match(app, /data-act="strava-open"/)
  assert.match(app, /strava-status-go/)
  const support = slice(app, 'function stravaSupportLine', 'function stravaConnectControl')
  assert.match(support, /客服：/)
  assert.equal(support.includes('隱私權政策'), false)
  assert.equal(support.includes('前往我的 Strava'), false)
})
