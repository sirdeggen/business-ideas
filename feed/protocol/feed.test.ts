import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  SCHEMA_VERSION,
  activeSubscription,
  dedupeFeeds,
  encodeFeedFields,
  encodePulseFields,
  encodeQueryFields,
  encodeReadingFields,
  encodeSubFields,
  expiresAt,
  latestCommitment,
  makeFeedId,
  parseFeedFields,
  queryCharge,
  readingHash,
  validateListing,
  validateReading,
  type FeedListing,
  type FeedPulse,
  type FeedReading,
  type FeedSub
} from './feed'

const PUBLISHER = `02${'ab'.repeat(32)}`
const BUYER = `03${'cd'.repeat(32)}`
const WHEN = '2026-09-22T12:00:00Z'
const VALUE = '2431.50'

function hashOf(timestamp = WHEN, value = VALUE): string {
  return readingHash({
    label: 'Gold spot',
    metricType: 'price',
    value,
    unit: 'USD/oz',
    timestamp
  })
}

function listing(partial: Partial<FeedListing> = {}): FeedListing {
  const valueHash = partial.valueHash ?? hashOf()
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'feed',
    feedId: makeFeedId(PUBLISHER, 'Gold spot', WHEN, 'aa'),
    publisher: PUBLISHER,
    label: 'Gold spot',
    metricType: 'price',
    unit: 'USD/oz',
    queryPriceSats: 1000,
    subPriceSats: 20000,
    subHours: 24,
    valueHash,
    timestamp: WHEN,
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('feed desk protocol', () => {
  it('round-trips a feed without the reading plaintext', () => {
    const item = listing()
    const fields = encodeFeedFields(item)
    expect(fieldTexts(fields)).not.toContain(VALUE)
    expect(fieldTexts(fields).join('\n')).not.toContain('2431.50')
    const parsed = parseFeedFields(fields)
    expect(parsed).toEqual(item)
    expect(validateListing(parsed as FeedListing)).toBeNull()
  })

  it('round-trips a pulse, a subscription, a query meter, and a signed reading', () => {
    const feed = listing()
    const pulse = {
      feedId: feed.feedId,
      publisher: PUBLISHER,
      valueHash: hashOf('2026-09-22T13:00:00Z', '2432.10'),
      timestamp: '2026-09-22T13:00:00Z'
    }
    expect(parseFeedFields(encodePulseFields(pulse))).toMatchObject({ kind: 'pulse', ...pulse })

    const sub = {
      feedId: feed.feedId,
      buyer: BUYER,
      paidSats: 20000,
      expires: expiresAt(WHEN, 24),
      timestamp: WHEN
    }
    expect(parseFeedFields(encodeSubFields(sub))).toMatchObject({ kind: 'sub', ...sub })

    const query = {
      feedId: feed.feedId,
      buyer: BUYER,
      paidSats: 1000,
      valueHash: feed.valueHash,
      timestamp: WHEN
    }
    expect(parseFeedFields(encodeQueryFields(query))).toMatchObject({ kind: 'query', ...query })

    const reading: Omit<FeedReading, 'magic' | 'version' | 'kind'> = {
      feedId: feed.feedId,
      buyer: BUYER,
      label: 'Gold spot',
      metricType: 'price',
      value: VALUE,
      unit: 'USD/oz',
      paidSats: 1000,
      mode: 'query',
      valueHash: hashOf(),
      timestamp: WHEN
    }
    const parsed = parseFeedFields(encodeReadingFields(reading))
    expect(parsed).toMatchObject({ kind: 'reading', value: VALUE, paidSats: 1000 })
    expect(validateReading(parsed as FeedReading)).toBeNull()
  })

  it('rejects a reading whose hash does not match the value', () => {
    const feed = listing()
    const reading: FeedReading = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'reading',
      feedId: feed.feedId,
      buyer: BUYER,
      label: 'Gold spot',
      metricType: 'price',
      value: VALUE,
      unit: 'USD/oz',
      paidSats: 1000,
      mode: 'query',
      valueHash: hashOf(WHEN, '1'),
      timestamp: WHEN
    }
    expect(validateReading(reading)).toBe('reading hash does not match the value')
    expect(parseFeedFields(encodeReadingFields(reading))).toBeNull()
  })

  it('keeps the newest commitment and an open subscription', () => {
    const feed = listing()
    const older: FeedPulse = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'pulse',
      feedId: feed.feedId,
      publisher: PUBLISHER,
      valueHash: hashOf(WHEN, '1'),
      timestamp: '2026-09-22T11:00:00Z'
    }
    const newer: FeedPulse = {
      ...older,
      valueHash: hashOf('2026-09-22T15:00:00Z', '2440'),
      timestamp: '2026-09-22T15:00:00Z'
    }
    expect(latestCommitment(feed, [older, newer]).valueHash).toBe(newer.valueHash)

    const open: FeedSub = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'sub',
      feedId: feed.feedId,
      buyer: BUYER,
      paidSats: 20000,
      expires: '2026-09-23T12:00:00Z',
      timestamp: WHEN
    }
    const now = new Date('2026-09-22T18:00:00Z').getTime()
    expect(activeSubscription([open], BUYER, feed.feedId, now)?.paidSats).toBe(20000)
    expect(activeSubscription([open], BUYER, feed.feedId, new Date('2026-09-24T00:00:00Z').getTime())).toBeNull()
    expect(queryCharge(feed, open)).toEqual({ paidSats: 0, mode: 'sub' })
    expect(queryCharge(feed, null)).toEqual({ paidSats: 1000, mode: 'query' })
  })

  it('dedupes feeds by id and ignores a foreign magic', () => {
    const feed = listing()
    const again = listing({ timestamp: '2026-09-22T16:00:00Z', queryPriceSats: 50 })
    const rows = dedupeFeeds([feed, again])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.queryPriceSats).toBe(50)
    const foreign = encodeFeedFields(feed)
    foreign[0] = Array.from(new TextEncoder().encode('trace'))
    expect(parseFeedFields(foreign)).toBeNull()
  })
})
