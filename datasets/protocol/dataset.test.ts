import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  SCHEMA_VERSION,
  encodeListingFields,
  encodeReceiptFields,
  formatSats,
  makeListingId,
  parseDatasetFields,
  sampleHashOf,
  validateFile,
  validateListing,
  validatePrice,
  validateReceipt,
  type DatasetListing,
  type DatasetReceipt
} from './dataset'

const SELLER = `02${'ab'.repeat(32)}`
const BUYER = `03${'cd'.repeat(32)}`
const DUMP = '{"url":"https://example.edu/paper","text":"abstract"}\n'

function listing(partial: Partial<DatasetListing> = {}): DatasetListing {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'listing',
    listingId: makeListingId(SELLER, 'Common Crawl snippet', '2026-08-25T10:00:00Z', 'aa'),
    seller: SELLER,
    title: 'Common Crawl snippet',
    license: 'CC-BY-4.0',
    sampleHash: sampleHashOf(DUMP),
    priceSats: 100,
    timestamp: '2026-08-25T10:00:00Z',
    ...partial
  }
}

function receipt(partial: Partial<DatasetReceipt> = {}): DatasetReceipt {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'receipt',
    listingId: makeListingId(SELLER, 'Common Crawl snippet', '2026-08-25T10:00:00Z', 'aa'),
    buyer: BUYER,
    paidSats: 100,
    sampleHash: sampleHashOf(DUMP),
    timestamp: '2026-08-25T10:05:00Z',
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('dataset stall protocol', () => {
  it('round-trips a listing without the file bytes', () => {
    const item = listing()
    const fields = encodeListingFields(item)
    expect(fieldTexts(fields)).toEqual([
      MAGIC,
      SCHEMA_VERSION,
      'listing',
      item.listingId,
      item.seller,
      item.title,
      item.license,
      item.sampleHash,
      String(item.priceSats),
      item.timestamp
    ])
    expect(fieldTexts(fields)).not.toContain(DUMP)
    expect(fieldTexts(fields).join('\n')).not.toContain('abstract')
    const parsed = parseDatasetFields(fields)
    expect(parsed).toEqual(item)
    expect(parsed).not.toHaveProperty('dump')
    expect(validateListing(parsed as DatasetListing)).toBeNull()
    expect((parsed as DatasetListing).sampleHash).toBe(sampleHashOf(DUMP))
  })

  it('still parses when extra fields sit before MAGIC', () => {
    const item = listing()
    const extra = [Array.from(new TextEncoder().encode('pubkey'))]
    const parsed = parseDatasetFields([...extra, ...encodeListingFields(item)])
    expect(parsed).toEqual(item)
    expect(parsed).not.toHaveProperty('dump')
  })

  it('drops dump bytes if an older listing leaked them after price', () => {
    const item = listing()
    const fields = encodeListingFields(item)
    const leaked = [
      ...fields.slice(0, 9),
      Array.from(new TextEncoder().encode(DUMP)),
      Array.from(new TextEncoder().encode(item.timestamp))
    ]
    const parsed = parseDatasetFields(leaked)
    expect(parsed).toEqual(item)
    expect(parsed).not.toHaveProperty('dump')
    expect(JSON.stringify(parsed)).not.toContain('abstract')
  })

  it('round-trips a receipt', () => {
    const item = receipt()
    const parsed = parseDatasetFields(encodeReceiptFields(item))
    expect(parsed).toEqual(item)
    expect(validateReceipt(parsed as DatasetReceipt)).toBeNull()
  })

  it('keeps the sample hash check on the private file, not the listing row', () => {
    expect(validateFile(DUMP, 'ab'.repeat(32))).toBe('sample hash does not match dump')
    expect(validateFile(DUMP, sampleHashOf(DUMP))).toBeNull()
    expect(validateListing(listing({ sampleHash: 'nope' }))).toBe('sample hash must be 64 hex chars')
  })

  it('rejects a zero-sat price and formats sats without dollars', () => {
    expect(validatePrice(0)).toBe('price must be at least 1 sat')
    expect(validatePrice(1.5)).toBe('price must be a whole number of sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(100)).toBe('100 sats')
    expect(formatSats(100)).not.toMatch(/\$/)
  })

  it('rejects a receipt that is not a listing kind', () => {
    expect(parseDatasetFields(encodeListingFields(listing({ title: '' })))).toBeNull()
  })
})
