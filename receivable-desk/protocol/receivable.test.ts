import { PushDrop, Transaction } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { lockPushDrop } from './pushdrop'
import {
  ADVANCE_BPS,
  MAGIC,
  agingLabel,
  classifyReceivableTransaction,
  daysLate,
  encodeReceivableFields,
  isDisplayName,
  isPartyIdentity,
  explainReceivableParse,
  parseReceivableFields,
  resolvePartyIdentity,
  validateReceivable,
  type ReceivablePayload
} from './receivable'
import { sampleOperatorPublicKey, sampleReceivables } from './samples'

const CREDITOR = '02' + 'ab'.repeat(32)
const DEBTOR = '03' + 'cd'.repeat(32)
const OTHER = '02' + 'ef'.repeat(32)

function invoice(partial: Partial<ReceivablePayload> = {}): ReceivablePayload {
  return {
    magic: MAGIC,
    invoiceId: 'INV-2026-100',
    creditor: CREDITOR,
    debtor: DEBTOR,
    amountSats: 1000,
    dueDate: '2026-09-01',
    status: 'open',
    memo: 'test',
    advanceBps: 0,
    ...partial
  }
}

describe('receivable protocol', () => {
  it('maps due date into English aging, not numeric buckets', () => {
    const asOf = '2026-08-13'
    expect(daysLate('2026-08-20', asOf)).toBe(-7)
    expect(agingLabel(daysLate('2026-08-20', asOf))).toBe('on time')
    expect(daysLate('2026-08-13', asOf)).toBe(0)
    expect(agingLabel(0)).toBe('on time')
    expect(agingLabel(daysLate('2026-08-06', asOf))).toBe('a bit late')
    expect(agingLabel(daysLate('2026-07-20', asOf))).toBe('call them')
    expect(agingLabel(daysLate('2026-06-01', asOf))).toBe('board should know')
  })

  it('round-trips PushDrop fields', () => {
    const item = invoice()
    const fields = encodeReceivableFields(item)
    expect(parseReceivableFields(fields)).toEqual(item)
  })

  it('still parses an invoice when lock() adds extra fields before or after MAGIC', () => {
    const item = invoice()
    const fields = encodeReceivableFields(item)
    const pubkey = new Array(33).fill(2)
    const signature = new Array(71).fill(3)
    expect(parseReceivableFields([...fields, pubkey, signature])).toEqual(item)
    expect(parseReceivableFields([pubkey, ...fields, signature])).toEqual(item)
    expect(parseReceivableFields([pubkey, signature, ...fields])).toEqual(item)
  })

  it('explains why parse failed', () => {
    const fields = encodeReceivableFields(invoice())
    fields[0] = Array.from(new TextEncoder().encode('notareceivable'))
    expect(parseReceivableFields(fields)).toBeNull()
    expect(explainReceivableParse(fields)).toMatch(/magic mismatch/)
    expect(explainReceivableParse([])).toMatch(/0 fields/)
  })

  it('encodes a real PushDrop locking script that @bsv/sdk can decode', () => {
    const item = invoice()
    const script = lockPushDrop(encodeReceivableFields(item), sampleOperatorPublicKey())
    const decoded = PushDrop.decode(script)
    expect(parseReceivableFields(decoded.fields)).toEqual(item)
    expect(decoded.lockingPublicKey.toString()).toBe(sampleOperatorPublicKey())
  })

  it('mints ten sample receivables as real PushDrop outputs on one transaction', () => {
    const samples = sampleReceivables()
    expect(samples).toHaveLength(10)
    const tx = new Transaction()
    for (const item of samples) {
      tx.addOutput({
        satoshis: 1,
        lockingScript: lockPushDrop(encodeReceivableFields(item), sampleOperatorPublicKey())
      })
    }
    expect(tx.outputs).toHaveLength(10)
    const recovered = tx.outputs.map((output) => {
      const decoded = PushDrop.decode(output.lockingScript)
      const parsed = parseReceivableFields(decoded.fields)
      if (!parsed) throw new Error('sample output was not a receivable PushDrop')
      return parsed.invoiceId
    })
    expect(new Set(recovered).size).toBe(10)
    const classified = classifyReceivableTransaction(
      [],
      samples.map((item, index) => ({ index, item }))
    )
    expect(classified.action).toBe('register')
    expect(classified.admitOutputIndexes).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('rejects junk: wrong magic, empty parties, non-positive amount, bad status', () => {
    const fields = encodeReceivableFields(invoice())
    fields[0] = Array.from(new TextEncoder().encode('notareceivable'))
    expect(parseReceivableFields(fields)).toBeNull()

    expect(validateReceivable(invoice({ creditor: '' }))).toMatch(/creditor/)
    expect(validateReceivable(invoice({ debtor: '   ' }))).toMatch(/debtor/)
    expect(validateReceivable(invoice({ creditor: 'x'.repeat(81) }))).toMatch(/creditor/)
    expect(validateReceivable(invoice({ amountSats: 0 }))).toMatch(/amount/)
    expect(validateReceivable(invoice({ amountSats: -5 }))).toMatch(/amount/)
    expect(validateReceivable(invoice({ status: 'pending' as ReceivablePayload['status'] }))).toMatch(/status/)
    expect(validateReceivable(invoice({ dueDate: '13 Aug 2026' }))).toMatch(/due date/)
    expect(validateReceivable(invoice({ invoiceId: '' }))).toMatch(/invoice id/)
    expect(validateReceivable(invoice({ creditor: DEBTOR, debtor: DEBTOR }))).toMatch(/differ/)
    expect(validateReceivable(invoice({ creditor: 'Alex', debtor: 'Alex' }))).toMatch(/differ/)
  })

  it('accepts a name or org, or a 66-hex identity, and keeps name-only records', () => {
    const named = invoice({ creditor: 'Riverside Hall', debtor: 'Alex' })
    expect(validateReceivable(named)).toBeNull()
    expect(parseReceivableFields(encodeReceivableFields(named))).toEqual(named)

    const hex = invoice()
    expect(validateReceivable(hex)).toBeNull()
    expect(parseReceivableFields(encodeReceivableFields(hex))).toEqual(hex)

    const mixed = invoice({ creditor: CREDITOR, debtor: 'Alex' })
    expect(validateReceivable(mixed)).toBeNull()
    expect(parseReceivableFields(encodeReceivableFields(mixed))).toEqual(mixed)

    expect(isDisplayName('Riverside Hall')).toBe(true)
    expect(isDisplayName('Alex')).toBe(true)
    expect(isDisplayName('')).toBe(false)
    expect(isPartyIdentity(CREDITOR)).toBe(true)
    expect(isPartyIdentity('Alex')).toBe(true)
    expect(isPartyIdentity('')).toBe(false)

    expect(resolvePartyIdentity('Riverside Hall', '', CREDITOR)).toBe('Riverside Hall')
    expect(resolvePartyIdentity('', '', CREDITOR)).toBe(CREDITOR)
    expect(resolvePartyIdentity('Alex', DEBTOR)).toBe(DEBTOR)
    expect(resolvePartyIdentity(CREDITOR, '')).toBe(CREDITOR)
    expect(resolvePartyIdentity('Alex', 'not-a-key')).toBeNull()

    const classified = classifyReceivableTransaction([], [{ index: 0, item: named }])
    expect(classified.action).toBe('register')
    expect(classified.admitOutputIndexes).toEqual([0])
  })

  it('rejects a double-register of the same invoice id in one transaction', () => {
    const result = classifyReceivableTransaction(
      [],
      [
        { index: 0, item: invoice({ invoiceId: 'INV-DUP' }) },
        { index: 1, item: invoice({ invoiceId: 'INV-DUP', memo: 'copy' }) }
      ]
    )
    expect(result.action).toBe('invalid')
    expect(result.reason).toMatch(/duplicate invoice/)
    expect(result.admitOutputIndexes).toEqual([])
  })

  it('classifies approve, settle, and advance-intent', () => {
    const open = invoice({ status: 'open' })
    const approved = invoice({ status: 'approved' })
    const paid = invoice({ status: 'paid' })
    const advanced = invoice({ status: 'approved', advanceBps: ADVANCE_BPS })

    expect(classifyReceivableTransaction(
      [{ index: 0, item: open }],
      [{ index: 0, item: approved }]
    ).action).toBe('approve')

    const settledFromOpen = classifyReceivableTransaction(
      [{ index: 0, item: open }],
      [{ index: 0, item: paid }],
      [1, 1000]
    )
    expect(settledFromOpen.action).toBe('settle')
    expect(settledFromOpen.admitOutputIndexes).toEqual([0])

    const settledFromApproved = classifyReceivableTransaction(
      [{ index: 0, item: approved }],
      [{ index: 0, item: paid }],
      [1, 1000]
    )
    expect(settledFromApproved.action).toBe('settle')

    expect(classifyReceivableTransaction(
      [{ index: 0, item: approved }],
      [{ index: 0, item: advanced }]
    ).action).toBe('advance')
  })

  it('marks paid after settle and rejects a second settle', () => {
    const approved = invoice({ status: 'approved' })
    const paid = invoice({ status: 'paid' })
    const settle = classifyReceivableTransaction(
      [{ index: 0, item: approved }],
      [{ index: 0, item: paid }],
      [1, 1000]
    )
    expect(settle.action).toBe('settle')
    expect(paid.status).toBe('paid')

    const withoutPayment = classifyReceivableTransaction(
      [{ index: 0, item: approved }],
      [{ index: 0, item: paid }],
      [1]
    )
    expect(withoutPayment.action).toBe('invalid')
    expect(withoutPayment.reason).toMatch(/BRC-29/)

    const second = classifyReceivableTransaction(
      [{ index: 0, item: paid }],
      [{ index: 0, item: invoice({ status: 'paid', memo: 'again' }) }]
    )
    expect(second.action).toBe('invalid')
    expect(second.reason).toMatch(/already paid/)
    expect(second.admitOutputIndexes).toEqual([])
  })

  it('rejects state changes that alter parties, amount, or invoice id', () => {
    const open = invoice({ status: 'open' })
    const mutated = invoice({ status: 'approved', amountSats: 999 })
    const result = classifyReceivableTransaction(
      [{ index: 0, item: open }],
      [{ index: 0, item: mutated }]
    )
    expect(result.action).toBe('invalid')
    expect(result.admitOutputIndexes).toEqual([])

    const otherParty = classifyReceivableTransaction(
      [{ index: 0, item: open }],
      [{ index: 0, item: invoice({ status: 'approved', creditor: OTHER }) }]
    )
    expect(otherParty.action).toBe('invalid')
  })

  it('rejects a two-input spend and an approve that skips open', () => {
    const twoInputs = classifyReceivableTransaction(
      [
        { index: 0, item: invoice({ invoiceId: 'A' }) },
        { index: 1, item: invoice({ invoiceId: 'B' }) }
      ],
      [{ index: 0, item: invoice({ invoiceId: 'A', status: 'approved' }) }]
    )
    expect(twoInputs.action).toBe('invalid')

    const skip = classifyReceivableTransaction(
      [{ index: 0, item: invoice({ status: 'paid' }) }],
      [{ index: 0, item: invoice({ status: 'open' }) }]
    )
    expect(skip.action).toBe('invalid')
  })
})
