import { describe, expect, it } from 'vitest'
import {
  FEE_SATS,
  MAGIC,
  SCHEMA_VERSION,
  encodeReceiptFields,
  filterTracePayloads,
  formatSats,
  makeToken,
  matchReceipts,
  parseTraceFields,
  rightsError,
  selectReceipt,
  stringToUtf8Bytes,
  whatError,
  whoError,
  type TraceReceipt
} from './trace'

function receipt(partial: Partial<TraceReceipt> = {}): TraceReceipt {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    token: 'a1b2c3d4e5f67890',
    what: 'Dawn lot 12',
    who: 'Harbor Co.',
    rights: 'own',
    feePaid: FEE_SATS,
    timestamp: '2026-09-08T12:00:00Z',
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('field rules', () => {
  it('requires what, who, and rights', () => {
    expect(whatError('')).toBe('Say what this receipt is for.')
    expect(whatError('   ')).toBe('Say what this receipt is for.')
    expect(whatError('Dawn lot 12')).toBeNull()
    expect(whoError('')).toBe('Say who holds the rights.')
    expect(whoError('Harbor Co.')).toBeNull()
    expect(rightsError('')).toBe('Say what rights this covers.')
    expect(rightsError('own')).toBeNull()
    expect(rightsError('license')).toBeNull()
  })

  it('keeps the register fee small and whole', () => {
    expect(FEE_SATS).toBe(100_000)
    expect(formatSats(FEE_SATS)).toBe('100,000 sats')
    expect(formatSats(1)).toBe('1 sat')
  })
})

describe('token', () => {
  it('derives a 16-hex token from what, who, rights, time, and nonce', () => {
    const token = makeToken({
      what: 'Dawn lot 12',
      who: 'Harbor Co.',
      rights: 'own',
      timestamp: '2026-09-08T12:00:00Z',
      nonce: 'n1'
    })
    expect(token).toMatch(/^[0-9a-f]{16}$/)
    expect(makeToken({
      what: 'Dawn lot 12',
      who: 'Harbor Co.',
      rights: 'own',
      timestamp: '2026-09-08T12:00:00Z',
      nonce: 'n1'
    })).toBe(token)
    expect(makeToken({
      what: 'Dawn lot 12',
      who: 'Harbor Co.',
      rights: 'own',
      timestamp: '2026-09-08T12:00:00Z',
      nonce: 'n2'
    })).not.toBe(token)
  })
})

describe('search', () => {
  it('finds a receipt by token or by what / who', () => {
    const dawn = receipt()
    const other = receipt({
      token: 'ffffffffffffffff',
      what: 'Master tape June',
      who: 'Studio B',
      rights: 'license',
      timestamp: '2026-09-07T12:00:00Z'
    })
    expect(selectReceipt([dawn, other], 'a1b2c3d4e5f67890')?.what).toBe('Dawn lot 12')
    expect(selectReceipt([dawn, other], 'a1b2c3d4')?.token).toBe(dawn.token)
    expect(matchReceipts([dawn, other], 'dawn').map((row) => row.what)).toEqual(['Dawn lot 12'])
    expect(matchReceipts([dawn, other], 'studio b')[0]?.who).toBe('Studio B')
    expect(selectReceipt([dawn, other], 'no-such')).toBeNull()
  })
})

describe('encode / parse', () => {
  it('round-trips what, who, rights, fee, and timestamp', () => {
    const row = receipt()
    const fields = encodeReceiptFields(row)
    expect(fieldTexts(fields)).toEqual([
      MAGIC,
      SCHEMA_VERSION,
      'register',
      row.token,
      'Dawn lot 12',
      'Harbor Co.',
      'own',
      String(FEE_SATS),
      row.timestamp
    ])
    expect(parseTraceFields(fields)).toEqual(row)
  })

  it('finds MAGIC among lock padding and drops foreign protocols', () => {
    const row = receipt()
    const padded = [
      new Uint8Array([2, ...new Uint8Array(32)]),
      ...encodeReceiptFields(row)
    ]
    expect(parseTraceFields(padded)).toEqual(row)
    expect(parseTraceFields([stringToUtf8Bytes('dataset'), stringToUtf8Bytes('1')])).toBeNull()
    expect(parseTraceFields([stringToUtf8Bytes('record'), stringToUtf8Bytes('1')])).toBeNull()
    expect(filterTracePayloads([
      { ...row, magic: 'dataset' as typeof MAGIC },
      { ...row, magic: 'record' as typeof MAGIC },
      row
    ])).toEqual([row])
  })
})
