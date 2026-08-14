import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { reconstructTreasury, type BoardEvent } from './events.ts'
import {
  MINUTES_COPY,
  keepLastGoodEvents,
  minutesEmptyCopy,
  overlayBanner,
  reconstructPreferringCache,
  retryEmptyLookup,
  resolveMinutesView,
  shouldRetryEmptyLookup
} from './lookup.ts'

const DEMO = 'fd99a97b-0415-4036-909d-ca7794a70f04'

function created(at = '2026-08-14T03:43:00.000Z'): BoardEvent {
  return {
    treasuryId: DEMO,
    kind: 'created',
    at,
    payload: { name: 'Demo Club', signerCount: 3 }
  }
}

function joined(at = '2026-08-14T03:43:10.000Z'): BoardEvent {
  return {
    treasuryId: DEMO,
    kind: 'joined',
    at,
    payload: { role: 'treasurer', identityKey: '02' + 'c5'.repeat(32), derivedPubkey: '02' + 'aa'.repeat(32) }
  }
}

describe('flaky overlay lookup + empty-state copy', () => {
  it('retries a known ?treasury= id when ls_anytx comes back empty', async () => {
    assert.equal(shouldRetryEmptyLookup({ treasuryId: DEMO, found: 0, attempt: 1 }), true)
    assert.equal(shouldRetryEmptyLookup({ treasuryId: DEMO, found: 2, attempt: 1 }), false)
    assert.equal(shouldRetryEmptyLookup({ treasuryId: '', found: 0, attempt: 1 }), false)
    assert.equal(shouldRetryEmptyLookup({ treasuryId: DEMO, found: 0, attempt: 3 }), false)

    let calls = 0
    const result = await retryEmptyLookup(async () => {
      calls += 1
      if (calls < 3) return []
      return [created(), joined()]
    }, { delayMs: 0, pause: async () => undefined })
    assert.equal(result.attempts, 3)
    assert.equal(result.failed, false)
    assert.equal(result.items.length, 2)
  })

  it('keeps last-good minutes when a later lookup fails or returns empty', () => {
    const cached = [created(), joined()]
    const keptEmpty = keepLastGoodEvents(cached, [], true)
    assert.equal(keptEmpty.length, 2)
    const keptFail = keepLastGoodEvents(cached, [], true)
    assert.deepEqual(keptFail, cached)

    const live = reconstructTreasury([created(), joined()])
    const wiped = resolveMinutesView({
      inFlight: false,
      overlayFailed: false,
      live: null,
      cached: live
    })
    assert.ok(wiped.board)
    assert.equal(wiped.board?.name, 'Demo Club')
    assert.equal(wiped.usedCache, true)
    assert.equal(wiped.emptyCopy, null)
    assert.notEqual(wiped.emptyCopy, MINUTES_COPY.empty)

    const failed = resolveMinutesView({
      inFlight: false,
      overlayFailed: true,
      live: null,
      cached: live
    })
    assert.equal(failed.status, 'failed')
    assert.ok(failed.board)
    assert.equal(failed.emptyCopy, null)
    assert.match(overlayBanner(failed.status, true), /minutes may be cached/)

    const reconstructed = reconstructPreferringCache([], cached, true)
    assert.ok(reconstructed)
    assert.equal(reconstructed.name, 'Demo Club')
    assert.ok(reconstructed.feed.some((item) => item.text.includes('Demo Club opened')))
  })

  it('uses honest empty-state copy: checking vs failed vs confirmed empty', () => {
    assert.equal(
      minutesEmptyCopy({ status: 'checking', hasMinutes: false }),
      MINUTES_COPY.checking
    )
    assert.equal(
      minutesEmptyCopy({ status: 'failed', hasMinutes: false }),
      MINUTES_COPY.failed
    )
    assert.equal(
      minutesEmptyCopy({ status: 'online', hasMinutes: false }),
      MINUTES_COPY.empty
    )
    assert.equal(minutesEmptyCopy({ status: 'online', hasMinutes: true }), null)
    assert.equal(overlayBanner('checking'), 'checking overlay-us-1')
    assert.equal(overlayBanner('online'), 'overlay-us-1 online')
    assert.equal(overlayBanner('failed'), 'lookup failed')

    const inFlight = resolveMinutesView({
      inFlight: true,
      overlayFailed: false,
      live: null,
      cached: null
    })
    assert.equal(inFlight.status, 'checking')
    assert.equal(inFlight.emptyCopy, MINUTES_COPY.checking)
    assert.notEqual(inFlight.emptyCopy, MINUTES_COPY.empty)

    const failedBare = resolveMinutesView({
      inFlight: false,
      overlayFailed: true,
      live: null,
      cached: null
    })
    assert.equal(failedBare.emptyCopy, MINUTES_COPY.failed)
    assert.match(failedBare.emptyCopy ?? '', /not missing/)
  })
})
