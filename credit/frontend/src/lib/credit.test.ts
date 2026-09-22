import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DESK_FEE_BPS,
  MAGIC,
  SCHEMA_VERSION,
  artifactKindFromTexts,
  assertCanDraw,
  assertCanFlagDefault,
  assertCanRepay,
  assertCanTerm,
  availableSats,
  canDraw,
  canFlagDefault,
  canRepay,
  deskFeeSats,
  encodeDefaultFields,
  encodeDrawFields,
  encodeRepayFields,
  encodeTermFields,
  facilityStatus,
  formatCollateralList,
  isLender,
  outstandingSats,
  parseCollateralList,
  parseCreditFields,
  termBreached,
  type CreditTerm
} from '../../../protocol/credit'

const LENDER = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`
const FACILITY = 'a'.repeat(32)
const INVOICE = 'b'.repeat(32)
const TX = 'c'.repeat(64)

function term(overrides: Partial<CreditTerm> = {}): CreditTerm {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'term',
    facilityId: FACILITY,
    borrower: 'North mill cloth',
    lenderIdentity: LENDER,
    limitSats: 10_000_000,
    maturity: '2026-12-31',
    collateral: `invoice:${INVOICE}`,
    deskFeeBps: DEFAULT_DESK_FEE_BPS,
    underwritingFeeSats: 100_000,
    underwritingNote: 'Seasonal draw against open invoices.',
    openedAt: '2026-09-22T12:00:00Z',
    ...overrides
  }
}

describe('credit facility state', () => {
  it('moves open → drawn → repaid, and default wins', () => {
    expect(facilityStatus({
      term: false, outstanding: 0, drawCount: 0, repayCount: 0, flagged: false
    })).toBeNull()
    expect(facilityStatus({
      term: true, outstanding: 0, drawCount: 0, repayCount: 0, flagged: false
    })).toBe('open')
    expect(facilityStatus({
      term: true, outstanding: 100, drawCount: 1, repayCount: 0, flagged: false
    })).toBe('drawn')
    expect(facilityStatus({
      term: true, outstanding: 0, drawCount: 1, repayCount: 1, flagged: false
    })).toBe('repaid')
    expect(facilityStatus({
      term: true, outstanding: 100, drawCount: 1, repayCount: 0, flagged: true
    })).toBe('defaulted')
  })

  it('charges the desk fee in bps on the draw and tracks outstanding', () => {
    expect(deskFeeSats(1_000_000, 50)).toBe(5_000)
    expect(deskFeeSats(100, 50)).toBe(0)
    expect(outstandingSats(
      [{ principalSats: 1_000_000 }, { principalSats: 250_000 }],
      [{ amountSats: 400_000 }]
    )).toBe(850_000)
    expect(availableSats(1_000_000, 850_000)).toBe(150_000)
  })

  it('allows a draw inside the limit and a repay up to outstanding', () => {
    const row = term()
    expect(canDraw('open', row.maturity, row.limitSats, '2026-09-22')).toBe(true)
    expect(canDraw('open', row.maturity, row.limitSats, '2027-01-01')).toBe(false)
    expect(assertCanDraw(row, 'open', 0, 2_000_000, '2026-09-22')).toEqual({
      principalSats: 2_000_000,
      feeSats: 10_000
    })
    expect(() => assertCanDraw(row, 'open', 0, 11_000_000, '2026-09-22')).toThrow(/available/)
    expect(canRepay('drawn', 100)).toBe(true)
    expect(canRepay('open', 0)).toBe(false)
    expect(assertCanRepay('drawn', 100, 40)).toBe(40)
    expect(() => assertCanRepay('drawn', 100, 101)).toThrow(/outstanding/)
  })

  it('flags default only for the lender when the term is breached and unpaid', () => {
    const row = term({ maturity: '2026-09-01' })
    expect(termBreached(row.maturity, 10, '2026-09-22')).toBe(true)
    expect(termBreached(row.maturity, 0, '2026-09-22')).toBe(false)
    expect(canFlagDefault(row, 'drawn', 10, LENDER, '2026-09-22')).toBe(true)
    expect(canFlagDefault(row, 'drawn', 10, OTHER, '2026-09-22')).toBe(false)
    expect(canFlagDefault(row, 'open', 0, LENDER, '2026-09-22')).toBe(false)
    expect(isLender(row, LENDER)).toBe(true)
    expect(assertCanFlagDefault(row, 'drawn', 10, LENDER, 'Still unpaid.', '2026-09-22')).toBe('Still unpaid.')
    expect(() => assertCanFlagDefault(row, 'drawn', 10, OTHER, 'Still unpaid.', '2026-09-22')).toThrow(/breached/)
  })
})

describe('collateral references', () => {
  it('parses invoice, receivable, receipt, and overlay ids without issuing them', () => {
    const refs = parseCollateralList([
      `invoice:${INVOICE}`,
      'receivable:INV-2041',
      `receipt:${TX}.1`,
      TX
    ].join('\n'))
    expect(refs.map((ref) => ref.kind)).toEqual(['invoice', 'receivable', 'receipt', 'overlay'])
    expect(formatCollateralList(refs)).toBe(
      `invoice:${INVOICE}|receivable:INV-2041|receipt:${TX}.1|overlay:${TX}`
    )
    expect(artifactKindFromTexts(['bsvinvoice', 'memo'])).toBe('invoice')
    expect(artifactKindFromTexts(['bsvinvoice-paid'])).toBe('receipt')
    expect(artifactKindFromTexts(['receivable'])).toBe('receivable')
    expect(artifactKindFromTexts(['credit'])).toBeNull()
  })

  it('rejects an empty collateral list', () => {
    expect(() => parseCollateralList('  ')).toThrow(/Collateral is required/)
    expect(() => assertCanTerm({
      borrower: 'North mill cloth',
      lenderIdentity: LENDER,
      limitSats: 10,
      maturity: '2026-12-31',
      collateral: '',
      deskFeeBps: 50,
      underwritingFeeSats: 0,
      underwritingNote: ''
    }, '2026-09-22')).toThrow(/Collateral is required/)
  })
})

describe('encode and parse', () => {
  it('round-trips term, draw, repay, and default', () => {
    const row = term()
    const parsedTerm = parseCreditFields(encodeTermFields(row))
    expect(parsedTerm).toMatchObject({ kind: 'term', borrower: row.borrower, deskFeeBps: 50 })

    const draw = parseCreditFields(encodeDrawFields({
      facilityId: FACILITY,
      drawId: 'd'.repeat(32),
      drawerIdentity: OTHER,
      principalSats: 1_000_000,
      feeSats: 5_000,
      drawnAt: '2026-09-22T13:00:00Z'
    }))
    expect(draw).toMatchObject({ kind: 'draw', feeSats: 5_000 })

    const repay = parseCreditFields(encodeRepayFields({
      facilityId: FACILITY,
      repayId: 'e'.repeat(32),
      payerIdentity: OTHER,
      amountSats: 400_000,
      repaidAt: '2026-10-01T13:00:00Z'
    }))
    expect(repay).toMatchObject({ kind: 'repay', amountSats: 400_000 })

    const flag = parseCreditFields(encodeDefaultFields({
      facilityId: FACILITY,
      flaggerIdentity: LENDER,
      reason: 'Term breached. Still unpaid.',
      flaggedAt: '2027-01-02T13:00:00Z'
    }))
    expect(flag).toMatchObject({ kind: 'default', reason: 'Term breached. Still unpaid.' })
  })

  it('ignores lock padding before MAGIC', () => {
    const fields = encodeTermFields(term())
    const padded = [[2, ...Array(32).fill(1)], ...fields]
    expect(parseCreditFields(padded)?.kind).toBe('term')
  })
})
