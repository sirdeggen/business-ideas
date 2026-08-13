import { describe, expect, it } from 'vitest'
import { MAGIC, type InvoicePayload, type ReceiptPayload } from '../../../protocol/invoice'
import { InvoicesStorage } from './InvoicesStorage'

const PAYEE = '025706528f0f6894b2ba505007267ccff1133e004452a1f6b72ac716f246216366'
const PAYER = '031111111111111111111111111111111111111111111111111111111111111111'

function invoice(invoiceId = 'ab'.repeat(16)): InvoicePayload {
  return {
    magic: MAGIC,
    invoiceId,
    payeeIdentity: PAYEE,
    amountSats: 1500,
    memo: 'Hall hire',
    dueDate: '2026-09-01',
    createdAt: '2026-08-13T18:00:00.000Z',
    orgName: 'Riverside Community Church',
    billedTo: 'Jordan Lee',
    amountUsd: '50.00'
  }
}

function receipt(invoiceId = 'ab'.repeat(16)): ReceiptPayload {
  return {
    magic: 'bsvinvoice-paid',
    invoiceId,
    payeeIdentity: PAYEE,
    payerIdentity: PAYER,
    amountSats: 1500,
    invoiceOutpoint: `${'11'.repeat(32)}.0`,
    remittance: {
      derivationPrefix: 'p',
      derivationSuffix: 's',
      paymentOutputIndex: 0
    }
  }
}

interface Doc {
  [key: string]: unknown
}

function memoryDb(): { collection: (name: string) => unknown } {
  const docs: Doc[] = []

  const matches = (filter: Record<string, unknown>, doc: Doc): boolean =>
    Object.entries(filter).every(([key, value]) => doc[key] === value)

  const collection = {
    createIndex: async () => undefined,
    findOne: async (filter: Record<string, unknown>) => docs.find((doc) => matches(filter, doc)) ?? null,
    updateOne: async (
      filter: Record<string, unknown>,
      update: { $set?: Doc, $setOnInsert?: Doc },
      options?: { upsert?: boolean }
    ) => {
      const index = docs.findIndex((doc) => matches(filter, doc))
      if (index >= 0) {
        docs[index] = { ...docs[index], ...(update.$set ?? {}) }
        return { matchedCount: 1, modifiedCount: 1 }
      }
      if (options?.upsert) {
        docs.push({ ...filter, ...(update.$setOnInsert ?? {}), ...(update.$set ?? {}) })
        return { matchedCount: 0, modifiedCount: 0 }
      }
      return { matchedCount: 0, modifiedCount: 0 }
    },
    find: (filter: Record<string, unknown>) => ({
      sort: () => ({
        skip: (n: number) => ({
          limit: (m: number) => ({
            toArray: async () => docs.filter((doc) => matches(filter, doc)).slice(n, n + m)
          })
        })
      })
    })
  }

  return { collection: () => collection }
}

describe('InvoicesStorage', () => {
  it('marks an open invoice paid and rejects a second pay', async () => {
    const storage = new InvoicesStorage(memoryDb())
    const open = invoice()
    await storage.storeOpen('11'.repeat(32), 0, open)

    const paid = await storage.markPaid('22'.repeat(32), 1, receipt())
    expect(paid.status).toBe('paid')
    expect(paid.paymentTxid).toBe('22'.repeat(32))

    await expect(storage.markPaid('33'.repeat(32), 1, receipt())).rejects.toThrow(/already paid/)
  })
})
