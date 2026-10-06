import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  PROFILE_FEE_SATS,
  PROTOCOL_ID,
  SIGNING_KEY_ID,
  bytesToHex,
  canonicalProfileBytes,
  profileBindingId
} from '../../../protocol/boost'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { directoryFromItems, overlayLookupService, overlayTopic, type OverlayItem } from './overlay'

const DESK = `03${'cd'.repeat(32)}`
const WHEN = '2026-10-06T12:00:00Z'

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5187')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
  })
})

describe('client MAGIC filter', () => {
  it('keeps boost profiles and drops another desk', async () => {
    const wallet = new ProtoWallet(PrivateKey.fromRandom())
    const { publicKey: owner } = await wallet.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: SIGNING_KEY_ID,
      counterparty: 'self'
    })
    const draft = {
      category: 'business' as const,
      name: 'Harbor market',
      blurb: 'Saturday stalls.',
      link: '',
      owner,
      desk: DESK,
      profileFeeSats: PROFILE_FEE_SATS,
      createdAt: WHEN
    }
    const profileId = profileBindingId(draft)
    const { signature } = await wallet.createSignature({
      data: canonicalProfileBytes({ ...draft, profileId }),
      protocolID: PROTOCOL_ID,
      keyID: SIGNING_KEY_ID,
      counterparty: 'self'
    })
    const profile: OverlayItem = {
      payload: {
        magic: MAGIC,
        version: '1',
        kind: 'profile',
        profileId,
        ...draft,
        signature: bytesToHex(signature)
      },
      txid: '11'.repeat(32),
      outputIndex: 0
    }
    const foreign = {
      ...profile,
      payload: { ...profile.payload, magic: 'cover' },
      txid: '22'.repeat(32)
    } as OverlayItem
    const rows = directoryFromItems([foreign, profile], Date.parse(WHEN))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.profile.profileId).toBe(profileId)
    expect(rows[0]?.boosted).toBe(false)
  })
})
