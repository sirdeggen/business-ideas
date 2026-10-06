import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  AUDIT_VIEW_FEE_SATS,
  MAGIC,
  paymentFeeSats,
  type FoldedPayment,
  type PaymentRecord
} from '../../../protocol/private-pay'
import { assertCanGrant, assertCanPay, assertCanRevoke } from './actions'
import { ALREADY_GRANTED, NEED_AUDITOR } from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')

const PAYER = `02${'ab'.repeat(32)}`
const PAYER_ID = `03${'cd'.repeat(32)}`
const PAYEE = `02${'11'.repeat(32)}`
const PAYEE_ID = `03${'22'.repeat(32)}`
const AUDITOR = `02${'33'.repeat(32)}`
const WHEN = '2026-10-06T12:00:00Z'

function payment(): PaymentRecord {
  return {
    magic: MAGIC,
    version: '1',
    kind: 'payment',
    paymentId: 'ab'.repeat(16),
    label: 'October payroll',
    payer: PAYER,
    payerIdentity: PAYER_ID,
    payeeIdentity: PAYEE_ID,
    payee: PAYEE,
    desk: PAYER_ID,
    counterpartyKeyId: 'cd'.repeat(8),
    amountCipher: 'ef'.repeat(40),
    feeSats: 1_000,
    paidAt: WHEN,
    signature: 'aa'.repeat(40)
  }
}

function folded(extra: Partial<FoldedPayment> = {}): FoldedPayment {
  return {
    payment: payment(),
    attestation: null,
    grants: [],
    revokes: [],
    viewGranted: false,
    openViews: 0,
    ...extra
  }
}

describe('pay and grant gates', () => {
  it('quotes the payment fee before a wallet is required', () => {
    const ready = assertCanPay({
      label: ' October payroll ',
      amount: '400000',
      lineNote: ' October salary ',
      payeeIdentity: '',
      payee: '',
      desk: ''
    }, null, null)
    expect(ready.label).toBe('October payroll')
    expect(ready.lineNote).toBe('October salary')
    expect(ready.feeSats).toBe(paymentFeeSats(400_000))
    expect(ready.feeSats).toBe(1_000)
  })

  it('fills a blank payee from the connected wallet', () => {
    const ready = assertCanPay({
      label: 'October payroll',
      amount: '400000',
      lineNote: 'October salary',
      payeeIdentity: '',
      payee: '',
      desk: ''
    }, PAYER_ID, PAYER)
    expect(ready.payeeIdentity).toBe(PAYER_ID)
    expect(ready.payee).toBe(PAYER)
    expect(ready.desk).toBe(PAYER_ID)
  })

  it('rejects a half-filled payee and a bad auditor', () => {
    expect(() => assertCanPay({
      label: 'October payroll',
      amount: '400000',
      lineNote: 'October salary',
      payeeIdentity: PAYEE_ID,
      payee: '',
      desk: ''
    }, PAYER_ID, PAYER)).toThrow(/both payee keys/i)
    const book = payment()
    expect(() => assertCanGrant(book, folded(), PAYER, { auditor: '', days: '90' })).toThrow(NEED_AUDITOR)
    expect(() => assertCanGrant(book, folded(), PAYEE, { auditor: AUDITOR, days: '90' })).toThrow(/didn’t send/i)
    expect(() => assertCanGrant(book, folded(), PAYER, { auditor: PAYER_ID, days: '90' })).toThrow(/other than/i)
  })

  it('refuses a second open grant and a second revoke', () => {
    const book = payment()
    const grant = {
      magic: MAGIC,
      version: '1' as const,
      kind: 'grant' as const,
      grantId: 'cd'.repeat(16),
      paymentId: book.paymentId,
      payer: PAYER,
      auditor: AUDITOR,
      scope: 'amount' as const,
      expiresAt: '2027-01-04T12:00:00Z',
      auditorCipher: 'ab'.repeat(40),
      feeSats: AUDIT_VIEW_FEE_SATS,
      grantedAt: WHEN,
      signature: 'aa'.repeat(40)
    }
    expect(() => assertCanGrant(book, folded({ grants: [grant], viewGranted: true, openViews: 1 }), PAYER, {
      auditor: AUDITOR,
      days: '90'
    }, WHEN)).toThrow(ALREADY_GRANTED)
    expect(() => assertCanRevoke(book, folded(), PAYER, grant.grantId)).toThrow(/no view/i)
    expect(() => assertCanRevoke(book, folded({
      grants: [grant],
      revokes: [{
        magic: MAGIC,
        version: '1',
        kind: 'revoke',
        grantId: grant.grantId,
        paymentId: book.paymentId,
        payer: PAYER,
        revokedAt: WHEN,
        signature: 'bb'.repeat(40)
      }],
      viewGranted: true
    }), PAYER, grant.grantId)).toThrow(/already revoked/i)
  })

  it('pays labeled fees with createAction and signs with the wallet', () => {
    expect(actionsSrc).toContain("outputDescription: 'Payment fee'")
    expect(actionsSrc).toContain("outputDescription: 'Audit-view grant fee'")
    expect(actionsSrc).toContain('createAction')
    expect(actionsSrc).toContain('createSignature')
    expect(actionsSrc).toContain('wallet.encrypt')
    expect(actionsSrc).toContain('wallet.decrypt')
    expect(actionsSrc).toContain('PROTOCOL_ID')
    expect(actionsSrc).not.toContain('x402')
    expect(actionsSrc).not.toContain('USDC')
    expect(actionsSrc).not.toContain('localhost')
  })
})
