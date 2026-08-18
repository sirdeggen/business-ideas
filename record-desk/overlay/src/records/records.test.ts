import { Transaction } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { lockPushDrop } from '../../../protocol/pushdrop'
import {
  MAGIC,
  SCHEMA_VERSION,
  classifyRecordTransaction,
  encodeRecordFields,
  parseRecordFields,
  recordHash,
  type RecordPayload
} from '../../../protocol/record'
import RecordsLookupServiceFactory from './RecordsLookupServiceFactory'
import { RecordsStorage } from './RecordsStorage'
import RecordsTopicManager from './RecordsTopicManager'
import type { RecordDoc } from './types'

const SAMPLE_KEY = '02' + 'ab'.repeat(32)

function reading(partial: Partial<RecordPayload> = {}): RecordPayload {
  const base = {
    name: 'Alex',
    kind: 'note' as const,
    note: 'Gate lock checked at dusk.',
    time: '2026-08-18T16:00:00Z',
    lat: '51.5074',
    lon: '-0.1278',
    ...partial
  }
  return {
    magic: MAGIC,
    schemaVersion: SCHEMA_VERSION,
    hash: partial.hash ?? recordHash(base),
    ...base
  }
}

interface Doc extends RecordDoc {
  [key: string]: unknown
}

function memoryDb(): { collection: (name: string) => unknown } {
  const docs: Doc[] = []

  const matches = (doc: Doc, filter: Record<string, unknown>): boolean => {
    for (const [key, value] of Object.entries(filter)) {
      if (doc[key] !== value) return false
    }
    return true
  }

  const collection = {
    createIndex: async () => undefined,
    updateOne: async (filter: object, update: object, options?: { upsert?: boolean }) => {
      const typed = update as { $set?: Record<string, unknown> }
      const index = docs.findIndex((doc) => matches(doc, filter as Record<string, unknown>))
      if (index >= 0) {
        docs[index] = { ...docs[index], ...(typed.$set ?? {}) }
        return
      }
      if (options?.upsert) {
        docs.push({ ...(typed.$set ?? {}) } as Doc)
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

describe('records overlay topic', () => {
  it('admits a valid posted record and rejects junk', async () => {
    const item = reading()
    const tx = new Transaction()
    tx.addOutput({
      satoshis: 1,
      lockingScript: lockPushDrop(encodeRecordFields(item), SAMPLE_KEY)
    })
    const manager = new RecordsTopicManager()
    const admitted = await manager.identifyAdmissibleOutputs(tx.toBEEF(), [])
    expect(admitted.outputsToAdmit).toEqual([0])

    const junk = new Transaction()
    junk.addOutput({
      satoshis: 1,
      lockingScript: lockPushDrop([Array.from(new TextEncoder().encode('notarecord'))], SAMPLE_KEY)
    })
    const rejected = await manager.identifyAdmissibleOutputs(junk.toBEEF(), [])
    expect(rejected.outputsToAdmit).toEqual([])
  })

  it('stores and looks up a record by hash', async () => {
    const item = reading()
    const db = memoryDb()
    const service = RecordsLookupServiceFactory(db)
    await service.storage.storeRecord('aa'.repeat(32), 0, item)
    const found = await service.storage.find({ hash: item.hash })
    expect(found).toHaveLength(1)
    expect(found[0].note).toBe(item.note)

    const decoded = parseRecordFields(encodeRecordFields(item))
    expect(decoded?.hash).toBe(item.hash)
    expect(classifyRecordTransaction([{ index: 0, item }]).action).toBe('post')
  })

  it('deletes a spent record from storage', async () => {
    const item = reading()
    const storage = new RecordsStorage(memoryDb())
    await storage.storeRecord('bb'.repeat(32), 1, item)
    expect(await storage.find({ hash: item.hash })).toHaveLength(1)
    await storage.deleteRecord('bb'.repeat(32), 1)
    expect(await storage.find({ hash: item.hash })).toHaveLength(0)
  })
})
