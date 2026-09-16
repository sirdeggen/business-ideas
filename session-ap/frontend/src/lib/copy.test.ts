import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
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
  FIRST_PAINT,
  PAYER_NAME_PLACEHOLDER,
  advancedSatsLine,
  lineFace,
  lineFaceAmount,
  moneyActionLabel,
  partyFaceName,
  sheetTitle
} from './copy'
import { shortKey } from './config'

const PAYER = '02c5313bc21f0a61418640c94a23d3cdb09ea50a8a3dd8daababe93f57a5fa0082'
const HASH = '2b4ad31adad0c899a981c3cfbcdb38e41048a16be77681644faa712e8f0174cc'

describe('first paint payer is a name', () => {
  it('does not say Their account', () => {
    expect(FIRST_PAINT.payerPlaceholder).toBe(PAYER_NAME_PLACEHOLDER)
    expect(FIRST_PAINT.payerPlaceholder).toBe('Alex')
    expect(FIRST_PAINT.payerPlaceholder.toLowerCase()).not.toContain('account')
    expect(FIRST_PAINT.payerPlaceholder).not.toBe('Their account')
    expect(FIRST_PAINT.payerLabel).toBe('Payer')
  })

  it('uses one title — eyebrow Session AP, H1 is the session or Close this session.', () => {
    expect(FIRST_PAINT.eyebrow).toBe('Session AP')
    expect(sheetTitle('')).toBe('Close this session.')
    expect(sheetTitle('March crawls')).toBe('March crawls')
    expect(sheetTitle('March crawls')).not.toBe('Session AP')
    expect(sheetTitle('')).not.toBe('Session AP')
  })
})

describe('book sheet parties are names', () => {
  it('shows a name and never shortKey hex', () => {
    expect(partyFaceName('Alex')).toBe('Alex')
    expect(partyFaceName('Northstar')).toBe('Northstar')
    expect(partyFaceName(PAYER)).toBe('')
    expect(partyFaceName(PAYER)).not.toMatch(/^(02|03)[0-9a-fA-F]{64}$/)
    expect(partyFaceName(shortKey(PAYER))).toBe('')
    expect(partyFaceName(shortKey(PAYER))).not.toMatch(/[0-9a-fA-F]{6}/)
    expect(partyFaceName('')).toBe('')
  })
})

describe('line face is label + dollars', () => {
  it('keeps the receipt hash off the face', () => {
    const face = lineFace({
      label: 'Article fetch',
      amountUsd: '0.60',
      receiptHash: HASH
    })
    expect(face.label).toBe('Article fetch')
    expect(face.amount).toBe('$0.60')
    expect(JSON.stringify(face)).not.toContain(HASH)
    expect(JSON.stringify(face).toLowerCase()).not.toContain('receipt')
  })

  it('skips the amount when there is no dollar — no billed sat fallback', () => {
    expect(lineFaceAmount('')).toBe('')
    expect(lineFaceAmount(undefined)).toBe('')
    const face = lineFace({ label: 'Search page', amountUsd: '', receiptHash: HASH })
    expect(face.amount).toBe('')
    expect(face.amount).not.toMatch(/billed/i)
    expect(face.amount).not.toMatch(/sats/i)
    expect(face.amount).not.toContain('18,291')
  })
})

describe('Pay and Send are dollars only', () => {
  it('does not put sats on the primary', () => {
    expect(moneyActionLabel('Pay', '1.20')).toBe('Pay $1.20')
    expect(moneyActionLabel('Pay', '1.20')).not.toContain('8,040,268')
    expect(moneyActionLabel('Pay', '12.40')).toBe('Pay $12.40')
    expect(moneyActionLabel('Send', 0.60)).toBe('Send $0.60')
    expect(moneyActionLabel('Pay', '12.40')).not.toMatch(/sats/i)
    expect(moneyActionLabel('Pay', '12.40')).not.toContain('·')
    expect(moneyActionLabel('Pay', '')).toBe('Pay')
    expect(advancedSatsLine(18_291)).toBe('18,291 sats')
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

  it('keeps the locked bodies and does not dump Revandrew or Sources', () => {
    expect(BUSINESS_CASE_WHY).toBe(
      'Bookkeepers collect many tiny spends — receipts, card swipes, small payables — and need one payable the treasurer can approve once. Rolling lines into a single session invoice closes the books without a dozen one-shot payments or a spreadsheet chase.'
    )
    expect(BUSINESS_CASE_WHO).toBe(
      'Finance ops and bookkeepers who already buy expense / AP tools; grassroots treasurers who batch a trip or project’s small spends. Payers settle one total; the buyer of the product is the team that closes sessions.'
    )
    expect(BUSINESS_CASE_MARKET).toBe(
      'Expensify FY2025: $142.1M revenue (+2% YoY); Expensify Card interchange $21.3M (+24%); ~650K paid members (Q4 2025). Habit signal: roll many expenses → one report / one pay. Broader “session close-out” share of AP automation GMV is unknown.'
    )
    expect(BUSINESS_CASE_PROOF_CHAIN).toBe(
      'Other-chain analog: Request Finance Expenses — Web3 teams submit, approve, and mass-pay reimbursements in crypto/fiat; platform reported >$1.3B all-time payment volume by Jan 2026 (processing volume, not product ARR).'
    )
    expect(BUSINESS_CASE_PROOF_FIAT).toBe(
      'Non-chain analog: Expensify, Ramp, and Concur — companies pay to capture many receipts and close them as one reimbursable or payable batch; corporate card statement close-out is the same habit without crypto.'
    )
    expect(BUSINESS_CASE_DEMO).toBe(
      'Open a session → attach many small lines → close books → treasurer reads one invoice → approve → pay once → export lines.'
    )
    const joined = [
      BUSINESS_CASE_WHY,
      BUSINESS_CASE_WHO,
      BUSINESS_CASE_MARKET,
      BUSINESS_CASE_PROOF_CHAIN,
      BUSINESS_CASE_PROOF_FIAT,
      BUSINESS_CASE_DEMO
    ].join('\n')
    expect(joined).not.toMatch(/Revandrew/)
    expect(joined).not.toMatch(/## Sources/)
    expect(joined).not.toMatch(/Margaret/)
    expect(joined).not.toMatch(/protocol-priced/)
    expect(joined).not.toMatch(/\bBSV\b/)
  })

  it('offers at most three citation chips', () => {
    expect(BUSINESS_CASE_CITATIONS.length).toBeLessThanOrEqual(3)
    expect(BUSINESS_CASE_CITATIONS.map((cite) => cite.label)).toEqual([
      'Expensify FY2025',
      'Request Finance'
    ])
  })

  it('sits on the default view only, below the head and above the desk', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const app = readFileSync(resolve(here, '../App.tsx'), 'utf8')
    expect(app).toMatch(/\{!isInvoice && <BusinessCase \/>\}/)
    expect(app.split('<BusinessCase />')).toHaveLength(2)
    const head = app.indexOf('<p className="lede">Many small spends. One invoice to approve.</p>')
    const caseMark = app.indexOf('{!isInvoice && <BusinessCase />}')
    const desk = app.indexOf('<p className="job">Open a session, attach the small spends, then close the books for the treasurer.</p>')
    expect(head).toBeGreaterThan(-1)
    expect(caseMark).toBeGreaterThan(head)
    expect(desk).toBeGreaterThan(caseMark)

    const catalog = readFileSync(resolve(here, '../../../../pages/index.html'), 'utf8')
    const sessionCard = catalog.slice(
      catalog.indexOf('demo-session'),
      catalog.indexOf('demo-datasets')
    )
    expect(sessionCard).toContain('<span class="badge">Server</span>')
    expect(sessionCard).not.toContain('Live')
    expect(sessionCard).not.toContain('Business case')
  })
})
