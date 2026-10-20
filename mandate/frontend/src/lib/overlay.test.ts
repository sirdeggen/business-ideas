import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { MAGIC, SAMPLE_DESTINATION, openMandate, signOwnerRecords } from '../../../protocol/mandate'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { bookFromItems, chainTimeFromOutput, overlayLookupService, overlayTopic, viewFromItems, type OverlayItem } from './overlay'

const NONCE = 'ab'.repeat(16)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5189')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5189')).not.toBe('tm_mandate')
    expect(overlayLookupService('http://localhost:5189')).not.toBe('ls_mandate')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only mandate opens on the public book', async () => {
    const owner = new ProtoWallet(PrivateKey.fromRandom())
    const other = new ProtoWallet(PrivateKey.fromRandom())
    const desk = await signOwnerRecords(owner, openMandate({
      orgName: 'Harbor HOA Reserve',
      managerKey: (await other.getPublicKey({ identityKey: true })).publicKey,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: 100_000,
      periodDays: 30,
      feeBps: 800,
      noticeDays: 14
    }, '2026-10-20T16:00:00Z', NONCE))
    const second = await signOwnerRecords(other, openMandate({
      orgName: 'North Club Treasury',
      managerKey: (await owner.getPublicKey({ identityKey: true })).publicKey,
      whitelist: [SAMPLE_DESTINATION],
      periodCapSats: 10_000,
      periodDays: 30,
      feeBps: 500,
      noticeDays: 7
    }, '2026-10-20T16:05:00Z', 'cd'.repeat(16)))
    const foreign = {
      payload: { ...desk.mandate!, magic: 'treasury' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: desk.mandate!, txid: 'aa'.repeat(32), outputIndex: 0, txTime: '2026-10-20T16:00:00Z' },
      foreign,
      { payload: second.mandate!, txid: 'bb'.repeat(32), outputIndex: 0, txTime: '2026-10-20T16:05:00Z' }
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    const book = bookFromItems(items)
    expect(book.map((row) => row.mandate.orgName).sort()).toEqual(['Harbor HOA Reserve', 'North Club Treasury'])
    expect(viewFromItems(items, desk.mandate!.mandateId)?.mandate?.orgName).toBe('Harbor HOA Reserve')
    expect(viewFromItems(items, desk.mandate!.mandateId)?.mandate?.txTime).toBe('2026-10-20T16:00:00Z')
    expect(viewFromItems([foreign], desk.mandate!.mandateId)).toBeNull()
    const early = viewFromItems([
      { payload: desk.mandate!, txid: 'aa'.repeat(32), outputIndex: 0, txTime: '2026-10-21T00:00:00Z' }
    ], desk.mandate!.mandateId)
    expect(early).toBeNull()
  })
})

describe('overlay clock', () => {
  it('prefers block time, then broadcast time, then context', () => {
    expect(chainTimeFromOutput({ broadcastTime: '2026-10-20T12:00:00.000Z' })).toBe('2026-10-20T12:00:00Z')
    expect(chainTimeFromOutput({ blockTime: '2026-02-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' })).toBe('2026-02-01T00:00:00Z')
    const context = Array.from(new TextEncoder().encode(JSON.stringify({ admittedAt: '2026-03-01T00:00:00Z' })))
    expect(chainTimeFromOutput({ context })).toBe('2026-03-01T00:00:00Z')
  })
})
