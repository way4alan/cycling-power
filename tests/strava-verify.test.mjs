import assert from 'node:assert/strict'
import test from 'node:test'
import { deriveWebhookVerifyToken } from '../supabase/scripts/strava-subscribe.mjs'

test('the subscribe script derives the same webhook token as strava-webhook', () => {
  assert.equal(
    deriveWebhookVerifyToken('strava-client-secret-not-real'),
    '63a96339967a2e1e09506604ae3c24c1',
  )
})
