import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { queryCharge, type FeedListing } from '../../../protocol/feed'
import { assertCanPublish, assertCanUpdate, parseWhole } from './actions'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')
const protocolSrc = readFileSync(join(here, '../../../protocol/feed.ts'), 'utf8')

const feed = {
  queryPriceSats: 1000
} as Pick<FeedListing, 'queryPriceSats'>

describe('publish a feed', () => {
  it('requires a label, a reading, and a whole price', () => {
    expect(parseWhole('1000')).toBe(1000)
    expect(parseWhole('')).toBeNull()
    expect(() => assertCanPublish({
      label: ' ',
      metricType: 'price',
      unit: '',
      value: '2431.50',
      queryPriceSats: 1000,
      subPriceSats: 0,
      subHours: 0
    })).toThrow('Label is required.')
    expect(() => assertCanPublish({
      label: 'Gold spot',
      metricType: 'price',
      unit: '',
      value: ' ',
      queryPriceSats: 1000,
      subPriceSats: 0,
      subHours: 0
    })).toThrow('Write the current reading.')
    expect(() => assertCanPublish({
      label: 'Gold spot',
      metricType: 'price',
      unit: '',
      value: '2431.50',
      queryPriceSats: 0,
      subPriceSats: 0,
      subHours: 0
    })).toThrow('Enter a price.')
    expect(() => assertCanUpdate(' ')).toThrow('Write the fresh reading.')
  })

  it('meters a query in sats and waives it while a subscription is open', () => {
    expect(queryCharge(feed, null)).toEqual({ paidSats: 1000, mode: 'query' })
    expect(queryCharge(feed, { paidSats: 20000 } as never)).toEqual({ paidSats: 0, mode: 'sub' })
    expect(String(queryCharge(feed, null).paidSats)).not.toMatch(/\$/)
  })
})

describe('signed reading stays off the catalog row', () => {
  it('puts the plaintext on the reading receipt, not the feed fields', () => {
    const encode = protocolSrc.slice(
      protocolSrc.indexOf('export function encodeFeedFields'),
      protocolSrc.indexOf('export function encodePulseFields')
    )
    expect(encode).not.toMatch(/item\.value(?!Hash)/)
    expect(encode).toContain('item.valueHash')
    expect(actionsSrc).toContain('encodeReadingFields')
    expect(actionsSrc).toContain('readHeld')
    expect(actionsSrc).toContain('sendDelivery')
    expect(actionsSrc).toContain('brc29PaymentOutput')
    expect(actionsSrc).not.toContain('row.feed.value')
  })
})
