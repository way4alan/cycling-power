import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const zh = readFileSync(new URL('docs/strava-review/PRIVACY-POLICY.zh-TW.md', root), 'utf8')
const en = readFileSync(new URL('docs/strava-review/PRIVACY-POLICY.en.md', root), 'utf8')
const page = readFileSync(new URL('privacy.html', root), 'utf8')

function pngSize(name) {
  const bytes = readFileSync(new URL(name, root))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length }
}

test('privacy sources drop the draft marks and share one effective date', () => {
  assert.equal(zh.includes('（草稿）'), false)
  assert.equal(zh.includes('尚未發布的草稿'), false)
  assert.equal(en.includes('(draft)'), false)
  assert.equal(en.includes('unpublished draft'), false)
  assert.match(zh, /生效日期：\*\*2026-11-18|\*\*生效日期：\*\*2026-11-18/)
  assert.match(en, /\*\*Effective date:\*\* 2026-11-18/)
  assert.match(zh, /PACE沛速車隊/)
  assert.match(en, /PACE沛速車隊 \(PACE Cycling Team\)/)
  assert.match(zh, /thewayzstore@gmail.com/)
  assert.match(en, /thewayzstore@gmail.com/)
  assert.match(page, /name="privacy-effective" content="2026-11-18"/)
  assert.match(page, /const PRIVACY_EFFECTIVE_DATE/)
  assert.match(page, /id="withdraw"/)
  assert.match(page, /id="policy-en"/)
  assert.match(page, /#E62B8A|E62B8A/)
})

test('the connect button files are the unmodified official orange assets', () => {
  const one = pngSize('assets/strava/btn_strava_connect_with_orange.png')
  const two = pngSize('assets/strava/btn_strava_connect_with_orange_x2.png')
  assert.deepEqual([one.width, one.height, one.bytes], [237, 48, 2685])
  assert.deepEqual([two.width, two.height, two.bytes], [474, 96, 4966])
})
