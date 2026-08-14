import { PushDrop, Transaction, UnlockingScript } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { lockPushDrop } from '../../../protocol/pushdrop'
import {
  MAGIC,
  classifyReceivableTransaction,
  encodeReceivableFields,
  parseReceivableFields,
  type ReceivablePayload
} from '../../../protocol/receivable'
import { sampleOperatorPublicKey, sampleReceivables } from '../../../protocol/samples'
import { DuplicateInvoiceError } from './duplicate'
import ReceivablesLookupServiceFactory from './ReceivablesLookupServiceFactory'
import { ReceivablesStorage } from './ReceivablesStorage'
import ReceivablesTopicManager from './ReceivablesTopicManager'
import type { ReceivableRecord } from './types'

const CREDITOR = '02' + 'ab'.repeat(32)
const DEBTOR = '03' + 'cd'.repeat(32)

function invoice(partial: Partial<ReceivablePayload> = {}): ReceivablePayload {
  return {
    magic: MAGIC,
    invoiceId: 'INV-TEST-1',
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

interface Doc extends ReceivableRecord {
  [key: string]: unknown
}

function memoryDb(): { collection: (name: string) => unknown } {
  const docs: Doc[] = []

  const matches = (doc: Doc, filter: Record<string, unknown>): boolean => {
    for (const [key, value] of Object.entries(filter)) {
      if (key === '$in') continue
      if (value && typeof value === 'object' && !Array.isArray(value) && '$in' in (value as object)) {
        const options = (value as { $in: unknown[] }).$in
        if (!options.includes(doc[key])) return false
      } else if (doc[key] !== value) {
        return false
      }
    }
    return true
  }

  const collection = {
    createIndex: async () => undefined,
    findOne: async (filter: object) => docs.find((doc) => matches(doc, filter as Record<string, unknown>)) ?? null,
    updateOne: async (filter: object, update: object, options?: { upsert?: boolean }) => {
      const typed = update as { $set?: Record<string, unknown>, $setOnInsert?: Record<string, unknown> }
      const index = docs.findIndex((doc) => matches(doc, filter as Record<string, unknown>))
      if (index >= 0) {
        docs[index] = { ...docs[index], ...(typed.$set ?? {}) }
        return
      }
      if (options?.upsert) {
        docs.push({ ...(typed.$setOnInsert ?? {}), ...(typed.$set ?? {}) } as Doc)
      }
    },
    deleteOne: async (filter: object) => {
      const index = docs.findIndex((doc) => matches(doc, filter as Record<string, unknown>))
      if (index >= 0) docs.splice(index, 1)
    },
    find: (filter: object) => ({
      sort: () => ({
        skip: (n: number) => ({
          limit: (nLimit: number) => ({
            toArray: async () => docs
              .filter((doc) => matches(doc, filter as Record<string, unknown>))
              .slice(n, n + nLimit)
          })
        })
      })
    })
  }

  return { collection: () => collection }
}

function receivableTx(
  outputs: ReceivablePayload[],
  previous?: Transaction,
  paymentSats?: number
): Transaction {
  const tx = new Transaction()
  if (previous) {
    tx.addInput({
      sourceTransaction: previous,
      sourceTXID: previous.id('hex'),
      sourceOutputIndex: 0,
      unlockingScript: new UnlockingScript()
    })
  }
  for (const item of outputs) {
    tx.addOutput({
      satoshis: 1,
      lockingScript: lockPushDrop(encodeReceivableFields(item), sampleOperatorPublicKey())
    })
  }
  if (paymentSats && paymentSats > 0) {
    tx.addOutput({
      satoshis: paymentSats,
      lockingScript: lockPushDrop(
        [Array.from(new TextEncoder().encode('brc29-settle-stub'))],
        sampleOperatorPublicKey()
      )
    })
  }
  return tx
}

describe('receivables storage', () => {
  it('rejects a second register of the same invoice id', async () => {
    const storage = new ReceivablesStorage(memoryDb())
    const item = invoice()
    await storage.storeRecord('aa'.repeat(32), 0, item)
    await expect(storage.storeRecord('bb'.repeat(32), 0, item)).rejects.toBeInstanceOf(DuplicateInvoiceError)
    const open = await storage.find({ status: 'open' })
    expect(open).toHaveLength(1)
    expect(open[0].txid).toBe('aa'.repeat(32))
  })

  it('keeps a paid marker after settle and still blocks re-register', async () => {
    const storage = new ReceivablesStorage(memoryDb())
    await storage.storeRecord('aa'.repeat(32), 0, invoice({ status: 'open' }))
    await storage.deleteRecord('aa'.repeat(32), 0)
    await storage.storeRecord('cc'.repeat(32), 0, invoice({ status: 'paid' }))

    const paid = await storage.find({ status: 'paid' })
    expect(paid).toHaveLength(1)
    expect(await storage.find({ status: 'open' })).toHaveLength(0)

    await expect(
      storage.storeRecord('dd'.repeat(32), 0, invoice({ status: 'open' }))
    ).rejects.toBeInstanceOf(DuplicateInvoiceError)

    await storage.deleteRecord('cc'.repeat(32), 0)
    expect(await storage.find({ status: 'paid' })).toHaveLength(1)
  })

  it('records a stub 70% advance-intent without changing paid status', async () => {
    const storage = new ReceivablesStorage(memoryDb())
    await storage.storeRecord('aa'.repeat(32), 0, invoice({ status: 'approved' }))
    const updated = await storage.recordAdvanceIntent('INV-TEST-1', 7000)
    expect(updated.status).toBe('approved')
    expect(updated.advanceBps).toBe(7000)
    await expect(storage.recordAdvanceIntent('missing', 7000)).rejects.toThrow(/No receivable/)
  })
})

describe('receivables topic manager', () => {
  it('admits the ten sample PushDrop outputs and rejects junk', async () => {
    const manager = new ReceivablesTopicManager()
    const samples = sampleReceivables()
    const tx = receivableTx(samples)
    const admitted = await manager.identifyAdmissibleOutputs(tx.toBEEF(), [])
    expect(admitted.outputsToAdmit).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])

    const junk = new Transaction()
    junk.addOutput({
      satoshis: 1,
      lockingScript: lockPushDrop(
        [Array.from(new TextEncoder().encode('nope')), Array.from(new TextEncoder().encode('x'))],
        sampleOperatorPublicKey()
      )
    })
    const rejected = await manager.identifyAdmissibleOutputs(junk.toBEEF(), [])
    expect(rejected.outputsToAdmit).toEqual([])
  })

  it('admits a settle spend and refuses a second paid spend', async () => {
    const manager = new ReceivablesTopicManager()
    const open = invoice({ status: 'open' })
    const mint = receivableTx([open])
    const noPay = receivableTx([invoice({ status: 'paid' })], mint)
    const missing = await manager.identifyAdmissibleOutputs(noPay.toBEEF(), [0])
    expect(missing.outputsToAdmit).toEqual([])

    const settle = receivableTx([invoice({ status: 'paid' })], mint, open.amountSats)
    const admitted = await manager.identifyAdmissibleOutputs(settle.toBEEF(), [0])
    expect(admitted.outputsToAdmit).toEqual([0])

    const paidMint = receivableTx([invoice({ status: 'paid' })])
    const second = receivableTx([invoice({ status: 'paid', memo: 'again' })], paidMint)
    const refused = await manager.identifyAdmissibleOutputs(second.toBEEF(), [0])
    expect(refused.outputsToAdmit).toEqual([])
  })

  it('admits a name-only register so the worklist can show the name', async () => {
    const manager = new ReceivablesTopicManager()
    const named = invoice({ creditor: 'Riverside Hall', debtor: 'Alex' })
    const tx = receivableTx([named])
    const admitted = await manager.identifyAdmissibleOutputs(tx.toBEEF(), [])
    expect(admitted.outputsToAdmit).toEqual([0])
    expect(parseReceivableFields(
      PushDrop.decode(tx.outputs[0].lockingScript).fields
    )?.debtor).toBe('Alex')
  })

  it('rejects a double-register of one invoice id in the same beef', async () => {
    const manager = new ReceivablesTopicManager()
    const dup = receivableTx([
      invoice({ invoiceId: 'INV-DUP' }),
      invoice({ invoiceId: 'INV-DUP', memo: 'copy' })
    ])
    const result = await manager.identifyAdmissibleOutputs(dup.toBEEF(), [])
    expect(result.outputsToAdmit).toEqual([])
  })
})

describe('lookup factory', () => {
  it('indexes an admitted PushDrop and answers by invoice id', async () => {
    const service = ReceivablesLookupServiceFactory(memoryDb())
    const item = invoice()
    const script = lockPushDrop(encodeReceivableFields(item), sampleOperatorPublicKey())
    await service.outputAdmittedByTopic({
      mode: 'locking-script',
      topic: 'tm_receivables',
      txid: 'aa'.repeat(32),
      outputIndex: 0,
      lockingScript: script,
      satoshis: 1
    } as Parameters<typeof service.outputAdmittedByTopic>[0])

    const found = await service.lookup({
      service: 'ls_receivables',
      query: { invoiceId: 'INV-TEST-1' }
    })
    expect(found).toHaveLength(1)
    const decoded = PushDrop.decode(script)
    expect(parseReceivableFields(decoded.fields)?.invoiceId).toBe('INV-TEST-1')
  })
})

describe('classify helpers used by the topic manager', () => {
  it('labels a register of unique samples', () => {
    const samples = sampleReceivables()
    const result = classifyReceivableTransaction([], samples.map((item, index) => ({ index, item })))
    expect(result.action).toBe('register')
  })
})
