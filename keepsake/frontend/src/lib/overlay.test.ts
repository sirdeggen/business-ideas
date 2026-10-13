import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { MAGIC, openEdition, signRecordedDesk } from '../../../protocol/keepsake'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { bookFromItems, overlayLookupService, overlayTopic, viewFromItems, type OverlayItem } from './overlay'

const ID = 'ab'.repeat(16)

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5188')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5188')).not.toBe('tm_keepsake')
    expect(overlayLookupService('http://localhost:5188')).not.toBe('ls_keepsake')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only keepsake editions on the public book', async () => {
    const desk = await signRecordedDesk(new ProtoWallet(PrivateKey.fromRandom()), openEdition({
      orgName: 'North Hall Volunteers',
      title: 'Founding Volunteer 2026',
      editionSize: 500,
      mintFeeSats: 1_000,
      royaltyBps: 500,
      deskBps: 200
    }, '2026-10-13T16:00:00Z', ID))
    const other = await signRecordedDesk(new ProtoWallet(PrivateKey.fromRandom()), openEdition({
      orgName: 'Other Hall',
      title: 'Opening Night',
      editionSize: 40,
      mintFeeSats: 1,
      royaltyBps: 0,
      deskBps: 200
    }, '2026-10-13T16:05:00Z', 'cd'.repeat(16)))
    const foreign = {
      payload: { ...desk.edition!, magic: 'grant' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: desk.edition!, txid: 'aa'.repeat(32), outputIndex: 0 },
      foreign,
      { payload: other.edition!, txid: 'bb'.repeat(32), outputIndex: 0 }
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    const book = bookFromItems(items)
    expect(book.map((row) => row.edition.title).sort()).toEqual(['Founding Volunteer 2026', 'Opening Night'])
    expect(viewFromItems(items, desk.edition!.keepsakeId)?.edition?.title).toBe('Founding Volunteer 2026')
    expect(viewFromItems([foreign], desk.edition!.keepsakeId)).toBeNull()
  })
})
