import { Hash, PushDrop, Utils } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { lockPushDrop } from './pushdrop'
import {
  MAGIC,
  SCHEMA_VERSION,
  classifyRecordTransaction,
  canonicalPayload,
  encodeRecordFields,
  explainRecordParse,
  isDisplayName,
  isIdentityKey,
  parseRecordFields,
  recordHash,
  resolveContributor,
  validateRecord,
  type RecordPayload
} from './record'

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
  const hash = partial.hash ?? recordHash(base)
  return {
    magic: MAGIC,
    schemaVersion: SCHEMA_VERSION,
    hash,
    ...base
  }
}

describe('signed record protocol', () => {
  it('matches @bsv/sdk SHA-256 and the empty-string / abc vectors', () => {
    expect(recordHash({
      name: 'abc',
      kind: 'note',
      note: 'x',
      time: '2026-01-01T00:00:00Z',
      lat: '',
      lon: ''
    })).toMatch(/^[0-9a-f]{64}$/)
    const payload = canonicalPayload({
      name: 'Alex',
      kind: 'note',
      note: 'Gate lock checked at dusk.',
      time: '2026-08-18T16:00:00Z',
      lat: '51.5074',
      lon: '-0.1278'
    })
    expect(recordHash({
      name: 'Alex',
      kind: 'note',
      note: 'Gate lock checked at dusk.',
      time: '2026-08-18T16:00:00Z',
      lat: '51.5074',
      lon: '-0.1278'
    })).toBe(Utils.toHex(Hash.sha256(Utils.toArray(payload, 'utf8'))))
  })

  it('round-trips PushDrop fields and keeps the hash', () => {
    const item = reading()
    const fields = encodeRecordFields(item)
    const parsed = parseRecordFields(fields)
    expect(parsed).toEqual(item)
    expect(validateRecord(parsed!)).toBeNull()
    expect(parsed!.hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('still parses when lock() adds extra fields before or after MAGIC', () => {
    const item = reading()
    const fields = encodeRecordFields(item)
    const pubkey = new Array(33).fill(2)
    const signature = new Array(71).fill(3)
    expect(parseRecordFields([...fields, pubkey, signature])).toEqual(item)
    expect(parseRecordFields([pubkey, ...fields, signature])).toEqual(item)
    expect(parseRecordFields([pubkey, signature, ...fields])).toEqual(item)
  })

  it('parses when optional lat/lon fields are omitted', () => {
    const item = reading({ lat: '', lon: '' })
    const fields = encodeRecordFields(item).slice(0, 7)
    expect(parseRecordFields(fields)).toEqual(item)
  })

  it('explains why parse failed', () => {
    const fields = encodeRecordFields(reading())
    fields[0] = Array.from(new TextEncoder().encode('notarecord'))
    expect(parseRecordFields(fields)).toBeNull()
    expect(explainRecordParse(fields)).toMatch(/magic mismatch/)
    expect(explainRecordParse([])).toMatch(/0 fields/)
  })

  it('encodes a real PushDrop locking script that @bsv/sdk can decode', () => {
    const item = reading()
    const script = lockPushDrop(encodeRecordFields(item), SAMPLE_KEY)
    const decoded = PushDrop.decode(script)
    expect(parseRecordFields(decoded.fields)).toEqual(item)
    expect(decoded.lockingPublicKey.toString()).toBe(SAMPLE_KEY)
  })

  it('rejects junk: wrong magic, empty name, bad kind, empty note', () => {
    const fields = encodeRecordFields(reading())
    fields[0] = Array.from(new TextEncoder().encode('notarecord'))
    expect(parseRecordFields(fields)).toBeNull()

    expect(validateRecord(reading({ name: '' }))).toMatch(/name/)
    expect(validateRecord(reading({ name: '   ' }))).toMatch(/name/)
    expect(validateRecord(reading({ name: 'x'.repeat(81) }))).toMatch(/name/)
    expect(validateRecord(reading({ kind: 'radio' as RecordPayload['kind'] }))).toMatch(/kind/)
    expect(validateRecord(reading({ note: '' }))).toMatch(/note/)
    expect(validateRecord(reading({ note: '   ' }))).toMatch(/note/)
    expect(validateRecord(reading({ time: '18 Aug 2026' }))).toMatch(/timestamp/)
    expect(validateRecord(reading({ hash: 'deadbeef' }))).toMatch(/hash/)
  })

  it('accepts a display name or a 66-hex identity, and hours / inspection / note', () => {
    const named = reading({ name: 'Riverside Hall', kind: 'inspection' })
    expect(validateRecord(named)).toBeNull()
    expect(parseRecordFields(encodeRecordFields(named))).toEqual(named)

    const hex = reading({ name: SAMPLE_KEY, kind: 'hours' })
    expect(validateRecord(hex)).toBeNull()
    expect(parseRecordFields(encodeRecordFields(hex))).toEqual(hex)

    expect(isDisplayName('Riverside Hall')).toBe(true)
    expect(isDisplayName('')).toBe(false)
    expect(isIdentityKey(SAMPLE_KEY)).toBe(true)
    expect(resolveContributor('Alex', '')).toBe('Alex')
    expect(resolveContributor('Alex', SAMPLE_KEY)).toBe(SAMPLE_KEY)
    expect(resolveContributor(SAMPLE_KEY, '')).toBe(SAMPLE_KEY)
    expect(resolveContributor('Alex', 'not-a-key')).toBeNull()
  })

  it('rejects a hash that does not match the canonical payload', () => {
    const item = reading({ hash: 'ab'.repeat(32) })
    expect(validateRecord(item)).toMatch(/hash does not match/)
    expect(validateRecord(item, { requireHashMatch: false })).toBeNull()
  })

  it('classifies a post of one or more valid records and rejects junk', () => {
    const first = reading()
    const second = reading({ note: 'Second reading', time: '2026-08-18T17:00:00Z' })
    expect(classifyRecordTransaction([{ index: 0, item: first }]).action).toBe('post')
    expect(classifyRecordTransaction([
      { index: 0, item: first },
      { index: 2, item: second }
    ]).admitOutputIndexes).toEqual([0, 2])

    const junk = classifyRecordTransaction([{ index: 0, item: reading({ note: '' }) }])
    expect(junk.action).toBe('invalid')
    expect(junk.admitOutputIndexes).toEqual([])
  })
})
