import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  applyAnnouncement,
  applyAnnouncements,
  closeSession,
  encodePayloadFields,
  filterSessionPayloads,
  hashReceipt,
  joinSessionRecords,
  lineItemFromReceipt,
  nextStatus,
  openDraft,
  parseSessionFields,
  rolledUpTotal,
  stringToUtf8Bytes,
  type ApprovalAnnouncement,
  type PaymentAnnouncement,
  type SessionInvoice
} from './protocol'

const PAYER = '02c5313bc21f0a61418640c94a23d3cdb09ea50a8a3dd8daababe93f57a5fa0082'
const PAYEE = `03${'aa'.repeat(32)}`

function closedBooks(): SessionInvoice {
  const draft = openDraft({
    label: 'March crawls',
    payerIdentity: PAYER,
    dueDate: '2026-09-01'
  })
  draft.lineItems = [
    lineItemFromReceipt({
      label: 'Article fetch',
      amountSats: 4_020_134,
      amountUsd: '0.60',
      receipt: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    }),
    lineItemFromReceipt({
      label: 'Search page',
      amountSats: 4_020_134,
      amountUsd: '0.60',
      receipt: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    })
  ]
  return closeSession(draft, PAYEE)
}

function approval(sessionId: string): ApprovalAnnouncement {
  return {
    magic: MAGIC,
    version: '1',
    kind: 'approval',
    sessionId,
    approverIdentity: PAYER,
    timestamp: '2026-08-25T12:00:00.000Z'
  }
}

function payment(sessionId: string): PaymentAnnouncement {
  return {
    magic: MAGIC,
    version: '1',
    kind: 'payment',
    sessionId,
    payerIdentity: PAYER,
    amountSats: 8_040_268,
    timestamp: '2026-08-25T12:05:00.000Z',
    remittance: {
      derivationPrefix: 'pre',
      derivationSuffix: 'suf',
      paymentOutputIndex: 0
    }
  }
}

describe('hashing a receipt or txid into a line item', () => {
  it('stores SHA-256 of the pasted txid on the line', () => {
    const txid = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
    const line = lineItemFromReceipt({
      label: '402 receipt',
      amountSats: 1337,
      amountUsd: '0.01',
      receipt: txid
    })
    expect(line.receiptHash).toBe(hashReceipt(txid))
    expect(line.receiptHash).toMatch(/^[0-9a-f]{64}$/)
    expect(line.receiptHash).not.toBe(txid)
    expect(line.label).toBe('402 receipt')
    expect(line.amountSats).toBe(1337)
  })

  it('hashes a receipt blob the same way as a txid', () => {
    const blob = '{"txid":"abc","amount":1}'
    const line = lineItemFromReceipt({
      label: 'Pasted blob',
      amountSats: 2,
      receipt: blob
    })
    expect(line.receiptHash).toBe(hashReceipt(blob))
    expect(line.receiptHash).not.toBe(hashReceipt('abc'))
  })
})

describe('status machine', () => {
  it('advances open → closed → approved → paid', () => {
    expect(nextStatus('open', 'close')).toBe('closed')
    expect(nextStatus('closed', 'approve')).toBe('approved')
    expect(nextStatus('approved', 'pay')).toBe('paid')
  })

  it('rejects skips and reversals', () => {
    expect(() => nextStatus('open', 'approve')).toThrow(/approve/)
    expect(() => nextStatus('open', 'pay')).toThrow(/pay/)
    expect(() => nextStatus('closed', 'close')).toThrow(/close/)
    expect(() => nextStatus('paid', 'pay')).toThrow(/pay/)
  })

  it('closeSession writes the rolled-up total', () => {
    const closed = closedBooks()
    expect(closed.status).toBe('closed')
    expect(closed.totalSats).toBe(rolledUpTotal(closed.lineItems))
    expect(closed.totalSats).toBe(8_040_268)
    expect(closed.payeeIdentity).toBe(PAYEE)
  })
})

describe('applying an approval or payment announcement', () => {
  it('flips a closed session to approved, then paid', () => {
    const closed = closedBooks()
    const approved = applyAnnouncement(closed, approval(closed.sessionId))
    expect(approved.status).toBe('approved')
    const paid = applyAnnouncement(approved, payment(closed.sessionId))
    expect(paid.status).toBe('paid')
  })

  it('lets a payment announcement settle a closed book (same-wallet pay)', () => {
    const closed = closedBooks()
    expect(applyAnnouncement(closed, payment(closed.sessionId)).status).toBe('paid')
  })

  it('ignores the wrong session and other-protocol announcements', () => {
    const closed = closedBooks()
    const other = approval('ffffffffffffffffffffffffffffffff')
    expect(applyAnnouncement(closed, other).status).toBe('closed')
    const foreign = { ...approval(closed.sessionId), magic: 'bsvinvoice' as typeof MAGIC }
    expect(applyAnnouncement(closed, foreign).status).toBe('closed')
  })

  it('joinSessionRecords applies announcements after reload', () => {
    const closed = closedBooks()
    const joined = joinSessionRecords(
      [{ invoice: closed, txid: 'aa'.repeat(32), outputIndex: 0 }],
      [
        { announcement: approval(closed.sessionId), txid: 'bb'.repeat(32), outputIndex: 0 },
        { announcement: payment(closed.sessionId), txid: 'cc'.repeat(32), outputIndex: 1 }
      ]
    )
    expect(joined).toHaveLength(1)
    expect(joined[0].status).toBe('paid')
    expect(joined[0].approvalTxid).toBe('bb'.repeat(32))
    expect(joined[0].paymentTxid).toBe('cc'.repeat(32))
  })

  it('applyAnnouncements is order-stable for approve then pay', () => {
    const closed = closedBooks()
    const next = applyAnnouncements(closed, [
      payment(closed.sessionId),
      approval(closed.sessionId)
    ])
    expect(next.status).toBe('paid')
  })
})

describe('MAGIC / client-side filter', () => {
  it('ignores invoices/ and other protocols', () => {
    const closed = closedBooks()
    const kept = filterSessionPayloads([
      { magic: 'bsvinvoice', kind: 'session', sessionId: closed.sessionId },
      { magic: 'raffle', kind: 'header' },
      { magic: 'grant receipt', kind: 'gift' },
      closed,
      approval(closed.sessionId)
    ])
    expect(kept).toHaveLength(2)
    expect(kept.every((item) => item.magic === MAGIC)).toBe(true)
  })

  it('parseSessionFields returns null for invoices MAGIC', () => {
    const invoiceFields = [
      stringToUtf8Bytes('bsvinvoice'),
      stringToUtf8Bytes('id'),
      stringToUtf8Bytes(PAYEE),
      stringToUtf8Bytes('1000'),
      stringToUtf8Bytes('one memo'),
      stringToUtf8Bytes('2026-09-01'),
      stringToUtf8Bytes('2026-08-25T00:00:00.000Z')
    ]
    expect(parseSessionFields(invoiceFields)).toBeNull()
  })

  it('round-trips a closed session through PushDrop fields', () => {
    const closed = closedBooks()
    const parsed = parseSessionFields(encodePayloadFields(closed))
    expect(parsed).toMatchObject({
      magic: MAGIC,
      kind: 'session',
      sessionId: closed.sessionId,
      payerIdentity: PAYER,
      payeeIdentity: PAYEE,
      status: 'closed',
      totalSats: 8_040_268
    })
    if (parsed?.kind === 'session') {
      expect(parsed.lineItems).toHaveLength(2)
      expect(parsed.lineItems[0].receiptHash).toBe(closed.lineItems[0].receiptHash)
    }
  })
})
