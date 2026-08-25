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
  const dump = partial.dump ?? DUMP
  const base = {
    listingId: makeListingId(SELLER, 'Common Crawl snippet', '2026-08-25T10:00:00Z', 'aa'),
    seller: SELLER,
    title: 'Common Crawl snippet',
    license: 'CC-BY-4.0',
    sampleHash: sampleHashOf(dump),
    priceSats: 100,
    dump,
    timestamp: '2026-08-25T10:00:00Z',
    ...partial
  }
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'listing',
    ...base,
    sampleHash: partial.sampleHash ?? sampleHashOf(base.dump)
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

describe('dataset stall protocol', () => {
  it('round-trips a listing and keeps the sample hash of the dump', () => {
    const item = listing()
    const parsed = parseDatasetFields(encodeListingFields(item))
    expect(parsed).toEqual(item)
    expect(validateListing(parsed as DatasetListing)).toBeNull()
    expect((parsed as DatasetListing).sampleHash).toBe(sampleHashOf(DUMP))
  })

  it('still parses when extra fields sit before MAGIC', () => {
    const item = listing()
    const extra = [Array.from(new TextEncoder().encode('pubkey'))]
    const parsed = parseDatasetFields([...extra, ...encodeListingFields(item)])
    expect(parsed).toEqual(item)
  })

  it('round-trips a receipt', () => {
    const item = receipt()
    const parsed = parseDatasetFields(encodeReceiptFields(item))
    expect(parsed).toEqual(item)
    expect(validateReceipt(parsed as DatasetReceipt)).toBeNull()
  })

  it('rejects a listing whose sample hash does not match the dump', () => {
    expect(validateListing(listing({ sampleHash: 'ab'.repeat(32) }))).toBe(
      'sample hash does not match dump'
    )
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
