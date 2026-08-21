import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { FeedEvent, Proposal, Treasury } from '../../../protocol/events'
import {
  boardBanner,
  minutesAsDocument,
  motionSentence,
  motionStatusWord,
  pageTitle
} from './copy.ts'

function proposal(partial: Partial<Proposal> & Pick<Proposal, 'status'>): Proposal {
  return {
    id: 'p1',
    amountSats: 1000,
    amountUsd: '25.00',
    payeeIdentityKey: '02' + 'aa'.repeat(32),
    payeeName: 'Hall Committee',
    memo: 'hall hire',
    payeeLockingScriptHex: '',
    vaultTxid: '',
    vaultVout: 0,
    vaultSatoshis: 0,
    feeSats: 0,
    changeSats: 0,
    createdAt: '2026-08-13T20:43:00.000Z',
    createdBy: 'treasurer',
    approvals: [],
    p2msSigs: [],
    ...partial
  }
}

const board = {
  threshold: 2,
  signers: []
} as unknown as Treasury

describe('treasury frontend display copy', () => {
  it('uses Treasury or the board name as the tab title', () => {
    assert.equal(pageTitle(undefined), 'Treasury')
    assert.equal(pageTitle(''), 'Treasury')
    assert.equal(pageTitle('Demo Club'), 'Demo Club')
    assert.ok(!pageTitle('Demo Club').includes('BSV'))
  })

  it('does not claim minutes are up to date without a board or without minutes', () => {
    assert.equal(
      boardBanner({ boardMode: false, status: 'online', hasMinutes: false }),
      null
    )
    assert.equal(
      boardBanner({ boardMode: true, status: 'online', hasMinutes: false }),
      null
    )
    assert.equal(
      boardBanner({ boardMode: true, status: 'online', hasMinutes: true }),
      'Minutes up to date'
    )
    assert.equal(
      boardBanner({ boardMode: true, status: 'failed', hasMinutes: false }),
      'Couldn’t refresh minutes'
    )
    assert.equal(
      boardBanner({ boardMode: true, status: 'checking', hasMinutes: false }),
      'Looking up minutes…'
    )
  })

  it('lists same-timestamp minutes with opened above joined', () => {
    const at = '2026-08-13T20:43:00.000Z'
    const feed: FeedEvent[] = [
      { id: 'joined', at, kind: 'joined', text: 'Treasurer joined.' },
      { id: 'created', at, kind: 'created', text: 'Demo Club opened as a 2-of-3 board.' }
    ]
    const listed = minutesAsDocument(feed)
    assert.equal(listed[0].kind, 'created')
    assert.equal(listed[1].kind, 'joined')
  })

  it('treats pending as a sentence waiting on a second yes, and Approved ≠ Paid', () => {
    const pending = proposal({ status: 'open' })
    assert.equal(motionStatusWord(pending, board), 'Pending')
    assert.equal(motionSentence(pending, board), 'Waiting on two yeses.')

    const oneYes = proposal({
      status: 'open',
      approvals: [{
        identityKey: '02aa',
        role: 'treasurer',
        derivedPubkey: '02aa',
        signature: [],
        at: '2026-08-13T20:43:00.000Z'
      }]
    })
    assert.equal(motionStatusWord(oneYes, board), 'Pending')
    assert.equal(motionSentence(oneYes, board), 'Treasurer said yes. Waiting on a second yes.')

    const approved = proposal({ status: 'approved' })
    assert.equal(motionStatusWord(approved, board), 'Approved')
    assert.notEqual(motionStatusWord(approved, board), 'Paid')

    const paid = proposal({ status: 'paid' })
    assert.equal(motionStatusWord(paid, board), 'Paid')
  })
})
