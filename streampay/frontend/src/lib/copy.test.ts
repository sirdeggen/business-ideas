import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_AMOUNT_SATS, TAG, rateSatsPerSec } from '../../../protocol/stream'
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
  CLOCK_STOPPED,
  FREEZE_HINT,
  RECEIPT_CARD,
  STREAM_CARD,
  accruedLine,
  claimLabel,
  displayAmount,
  displayMoney,
  displaySats,
  remainingLine,
  remainingPotSats,
  showStatusStamp,
  streamHeading
} from './copy'
import type { OverlayStream } from './overlay'

function stream(partial: Partial<OverlayStream> = {}): OverlayStream {
  const amountSats = partial.amountSats ?? DEFAULT_AMOUNT_SATS
  const durationSec = 14 * 86_400
  return {
    tag: TAG,
    streamId: 'ab'.repeat(16),
    org: 'Harbor Legal Aid',
    contractorName: 'Jordan Lee',
    contractorIdentity: `03${'11'.repeat(32)}`,
    treasurerIdentity: '025706528f0f6894b2ba505007267ccff1133e004452a1f6b72ac716f246216366',
    amountSats,
    rateSatsPerSec: rateSatsPerSec(amountSats, durationSec),
    startIso: '2026-08-11T12:00:00.000Z',
    durationSec,
    frozen: false,
    claimedSats: 0,
    freezeIso: '',
    amountUsd: partial.amountUsd ?? '',
    memo: 'Legal research week',
    updatedIso: '2026-08-11T12:00:00.000Z',
    lastClaimSats: 0,
    lastClaimIso: '',
    txid: 'aa'.repeat(32),
    outputIndex: 0,
    satoshis: amountSats,
    ...partial
  }
}

describe('stream copy is sats unless dollars are meaningful', () => {
  it('forbids paired pennies on the default pot; sats stay the settlement', () => {
    expect(displayAmount(stream())).toBe('100,000 sats')
    expect(displayAmount(stream({ amountUsd: '0.07' }))).toBe('$0.07')
    expect(displayMoney(21_428, stream({ amountUsd: '0.07' }))).toBe('21,428 sats')
    expect(displayMoney(21_428, stream({ amountUsd: '0.07' }))).not.toMatch(/\$0\.0[01]/)
    expect(displaySats(21_428)).toBe('21,428 sats')
    expect(displaySats(14)).not.toMatch(/\$0\.0[01]/)
    expect(claimLabel(14, stream({ amountUsd: '0.07' }))).toBe('Claim 14 sats')
    expect(claimLabel(14, stream({ amountUsd: '0.07' }))).not.toMatch(/\$0\.0[01]/)
    expect(claimLabel(21_428, stream({ amountUsd: '0.07' }))).toBe('Claim 21,428 sats')
    expect(claimLabel(0)).toBe('Nothing to claim yet')
  })

  it('shows claimable in sats, not a spot dollar conversion of the notional', () => {
    expect(displaySats(21_428)).toBe('21,428 sats')
    expect(displaySats(21_428)).not.toContain('$86')
    expect(displayMoney(21_428, stream({ amountUsd: '0.07' }))).not.toContain('$86')
  })

  it('writes the remaining pot after a claim (QA 78,559)', () => {
    const afterClaim = stream({ satoshis: 100_000, claimedSats: 21_441 })
    expect(remainingPotSats(afterClaim)).toBe(78_559)
    expect(remainingLine(afterClaim)).toBe('78,559 sats remaining')
    expect(accruedLine(afterClaim, Date.parse(afterClaim.startIso) + 3 * 86_400_000)).toContain('78,559 sats remaining')
  })

  it('says who can freeze and what freeze does', () => {
    expect(FREEZE_HINT).toMatch(/opened this stream/i)
    expect(FREEZE_HINT).toMatch(/stops new pay from accruing/i)
    expect(FREEZE_HINT).toMatch(/already-accrued can still be claimed/i)
    expect(CLOCK_STOPPED).toMatch(/clock is stopped/i)
  })

  it('names the OPEN stream card and the CLAIMED receipt card', () => {
    expect(STREAM_CARD).toBe('Stream')
    expect(RECEIPT_CARD).toBe('Receipt')
  })

  it('never titles a missing stream Stream or stamps OPEN', () => {
    expect(streamHeading(null)).toBe('StreamPay')
    expect(showStatusStamp(null)).toBe(false)
    expect(streamHeading(stream())).toBe('Harbor Legal Aid')
  })
})

describe('Business case page copy is locked', () => {
  it('uses the exact title and five fields in PATTERN order', () => {
    expect(BUSINESS_CASE_TITLE).toBe('Business case')
    expect([...BUSINESS_CASE_FIELDS]).toEqual([
      'Why it exists',
      'Who pays',
      'Market signal',
      'Proof people pay',
      'Demo goal'
    ])
  })

  it('keeps the locked bodies and does not dump Margaret or Sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'Salaries, retainers, and vesting don’t have to arrive as lump sums. Streaming pay settles continuously so the recipient can withdraw accrued value anytime and the payer can stop or top up without rewriting the deal.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Crypto-native companies and DAOs that already stream vesting or payroll; freelancers who want ongoing retainers instead of monthly invoices. Enterprise payroll buyers remain a stretch until fiat rails and compliance are clear.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Sablier (Jul 2023–Feb 2026): ~534K streams, ~$43M stablecoin volume. Sablier 2025: 892K transactions, ~$30M stablecoin volume. Superfluid ~$6M TVL (live snapshot). Broader fiat streaming-payroll TAM is unknown.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Sablier and Superfluid are live streaming protocols with multi-year volume/TVL for vesting, payroll, and grants.'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: ADP, Gusto, and Rippling prove employers pay for scheduled pay rails — public “per-second stream” revenue is unknown; the closest paid habit is recurring payroll subscriptions.'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Create a continuous payable → recipient withdraws accrued amount → stop or top-up works. Show streaming is legible next to lump-sum invoices.'
    )
    const joined = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      BUSINESS_CASE_PROOF_CHAIN,
      BUSINESS_CASE_PROOF_FIAT,
      BUSINESS_CASE_DEMO
    ].join('\n')
    expect(joined).not.toMatch(/Margaret/)
    expect(joined).not.toMatch(/## Sources/)
  })

  it('offers at most three citation chips, Sablier and Superfluid only', () => {
    expect(BUSINESS_CASE_CITATIONS.length).toBeLessThanOrEqual(3)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'Sablier',
      'Superfluid'
    ])
  })

  it('sits on Home only, below the head and above the desk, with StreamPay still Live', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const app = readFileSync(resolve(here, '../App.tsx'), 'utf8')
    expect(app).toMatch(/function Home\(/)
    expect(app).toMatch(/<BusinessCase \/>/)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">Pay as they work.</p>')
    const caseMark = app.indexOf('<BusinessCase />')
    const ghost = app.indexOf('<GhostCard />')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(ghost).toBeGreaterThan(caseMark)
    expect(app).not.toMatch(/function Create[\s\S]*<BusinessCase \/>/)
    expect(app).not.toMatch(/function StreamPage[\s\S]*<BusinessCase \/>/)

    const catalog = readFileSync(resolve(here, '../../../../pages/index.html'), 'utf8')
    const streampayCard = catalog.slice(
      catalog.indexOf('demo-streampay'),
      catalog.indexOf('demo-grants')
    )
    expect(streampayCard).toContain('<span class="badge">Live</span>')
    expect(streampayCard).toContain('StreamPay')
  })
})
