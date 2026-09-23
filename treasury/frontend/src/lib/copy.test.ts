import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { FeedEvent, Proposal, Treasury } from '../../../protocol/events'
import {
  BUSINESS_CASE_CITATIONS,
  BUSINESS_CASE_DEMO,
  BUSINESS_CASE_FIELDS,
  BUSINESS_CASE_MARKET,
  BUSINESS_CASE_PROOF_CHAIN,
  BUSINESS_CASE_PROOF_FIAT,
  BUSINESS_CASE_TITLE,
  BUSINESS_CASE_WHO,
  BUSINESS_CASE_WHY,
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

describe('Business case page copy is locked', () => {
  it('uses the exact title and five fields in PATTERN order', () => {
    assert.equal(BUSINESS_CASE_TITLE, 'Business case')
    assert.deepEqual([...BUSINESS_CASE_FIELDS], [
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
  })

  it('keeps the locked bodies and does not dump Revandrew or Sources', () => {
    assert.equal(
      BUSINESS_CASE_WHY,
      'Groups that hold money together cannot trust one person’s account. A multi-approver vault turns “two people have to say yes” into readable minutes: propose → approve → pay — a board can audit who signed without learning a new dialect.'
    )
    assert.equal(
      BUSINESS_CASE_WHO,
      'Clubs, churches, HOAs, DAOs, and small companies that already run dual-control spending. The buyer is the group that needs joint custody, not the payee — enterprise treasury / AP dual control and grassroots volunteer treasurers alike.'
    )
    assert.equal(
      BUSINESS_CASE_MARKET,
      'Safe (formerly Gnosis Safe), Q2 2026: ~$27.24B self-custodied assets; 63.4M accounts; ~$39.3B Q2 transfer volume. Lifetime value processed cited >$1.4T. Share that is club/HOA dual-control vs DeFi/DAO is unknown.'
    )
    assert.equal(
      BUSINESS_CASE_PROOF_CHAIN,
      'Other-chain analog: Safe / Gnosis Safe — teams already coordinate serious capital through multi-approver smart accounts.'
    )
    assert.equal(
      BUSINESS_CASE_PROOF_FIAT,
      'Non-chain analog: BILL Dual Control and multi-approver AP workflows; banks’ dual-authorization wires — enterprises pay for “initiator ≠ approver” every day.'
    )
    assert.equal(
      BUSINESS_CASE_DEMO,
      '2-of-2 or 2-of-3 vault → propose → two approvals → pay; a stranger can read board minutes without joining the vault.'
    )
    const joined = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      BUSINESS_CASE_PROOF_CHAIN,
      BUSINESS_CASE_PROOF_FIAT,
      BUSINESS_CASE_DEMO
    ].join('\n')
    assert.doesNotMatch(joined, /Revandrew/)
    assert.doesNotMatch(joined, /## Sources/)
    assert.doesNotMatch(joined, /Margaret/)
  })

  it('offers at most three citation chips', () => {
    assert.ok(BUSINESS_CASE_CITATIONS.length <= 3)
    assert.deepEqual(BUSINESS_CASE_CITATIONS.map((cite) => cite.label), [
      'Safe Q2 2026',
      'BILL Dual Control'
    ])
  })

  it('sits on the default view only, below the head and above the desk', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const app = readFileSync(resolve(here, '../App.tsx'), 'utf8')
    assert.match(app, /\{!boardMode && <BusinessCase \/>\}/)
    assert.equal(app.split('<BusinessCase />').length, 2)
    const head = app.indexOf('<header className="masthead">')
    const caseMark = app.indexOf('{!boardMode && <BusinessCase />}')
    const desk = app.indexOf('<h2>Open a board</h2>')
    assert.ok(head > -1)
    assert.ok(caseMark > head)
    assert.ok(desk > caseMark)

    const catalog = readFileSync(resolve(here, '../../../../pages/index.html'), 'utf8')
    const treasuryStart = catalog.indexOf('demo-treasury')
    const treasuryCard = catalog.slice(
      treasuryStart,
      catalog.indexOf('</article>', treasuryStart)
    )
    assert.match(treasuryCard, /<span class="badge">Server<\/span>/)
    assert.doesNotMatch(treasuryCard, /Business case/)
  })
})
