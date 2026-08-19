import {
  LookupResolver,
  PushDrop,
  TopicBroadcaster,
  Transaction,
  type WalletClient
} from '@bsv/sdk'
import { originator } from './config'
import {
  keepLastGoodGifts,
  keepLastGoodReceipts,
  readCachedOverlayGifts,
  readCachedOverlayReceipts,
  readCachedReceipt,
  writeCachedOverlayGifts,
  writeCachedOverlayReceipts,
  writeCachedReceipt,
  type CachedPublicReceipt
} from './persist'
import {
  ANNOUNCE_PROTOCOL_ID,
  BASKET,
  LOOKUP_SERVICE,
  OVERLAY_HOST,
  PROTOCOL_TAG,
  TOPIC,
  encodeAnnouncementFields,
  encodeGiftAnnouncementFields,
  filterGiftsForOrg,
  parseAnnouncementFields,
  parseGiftAnnouncementFields,
  receiptMatchesGift,
  type CanonicalReceipt,
  type GiftNotice
} from './protocol'

export type OverlayLookupStatus = 'idle' | 'checking' | 'online' | 'failed'

export function overlayResolver(): LookupResolver {
  return new LookupResolver({
    networkPreset: 'mainnet',
    slapTrackers: [OVERLAY_HOST],
    hostOverrides: {
      [LOOKUP_SERVICE]: [OVERLAY_HOST]
    }
  })
}

export function overlayBroadcaster(): TopicBroadcaster {
  return new TopicBroadcaster([TOPIC], {
    networkPreset: 'mainnet',
    resolver: overlayResolver(),
    requireAcknowledgmentFromAnyHostForTopics: 'all'
  })
}

async function submitBeefFallback(beef: number[]): Promise<void> {
  const response = await fetch(`${OVERLAY_HOST}/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-topics': JSON.stringify([TOPIC])
    },
    body: Uint8Array.from(beef)
  })
  if (!response.ok) {
    throw new Error(`Could not publish the public receipt (${response.status})`)
  }
}

export async function broadcastAnnouncement(beef: number[]): Promise<void> {
  const tx = Transaction.fromBEEF(beef)
  try {
    const result = await overlayBroadcaster().broadcast(tx)
    if (result && 'status' in result && result.status === 'error') {
      throw new Error(result.description || 'Broadcast failed')
    }
  } catch {
    await submitBeefFallback(beef)
  }
}

export async function publishReceiptAnnouncement(
  wallet: WalletClient,
  receipt: CanonicalReceipt,
  signature: number[],
  signingKey: string
): Promise<string> {
  const keyID = `${receipt.giftTxid}:receipt:${receipt.at}`
  const token = new PushDrop(wallet, originator())
  const lockingScript = await token.lock(
    encodeAnnouncementFields(receipt, signature, signingKey),
    ANNOUNCE_PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )
  const response = await wallet.createAction({
    description: `Receipt: ${receipt.purpose}`.slice(0, 50),
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `${PROTOCOL_TAG} receipt`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: ANNOUNCE_PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'receipt']
    }],
    labels: [BASKET, 'receipt'],
    options: { randomizeOutputs: false }
  })
  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a public receipt')
  }
  await broadcastAnnouncement(response.tx as number[])
  const announced: CachedPublicReceipt = {
    receipt,
    signature,
    signingKey,
    announceTxid: response.txid
  }
  writeCachedReceipt(response.txid, announced)
  const cached = keepLastGoodReceipts(readCachedOverlayReceipts(), [announced], false)
  writeCachedOverlayReceipts(cached)
  return response.txid
}

export async function publishGiftAnnouncement(
  wallet: WalletClient,
  gift: GiftNotice
): Promise<string> {
  const keyID = `${gift.giftId}:gift:${gift.at}`
  const token = new PushDrop(wallet, originator())
  const lockingScript = await token.lock(
    encodeGiftAnnouncementFields(gift),
    ANNOUNCE_PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )
  const response = await wallet.createAction({
    description: `Gift notice: ${gift.purpose}`.slice(0, 50),
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `${PROTOCOL_TAG} gift`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: ANNOUNCE_PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'gift']
    }],
    labels: [BASKET, 'gift'],
    options: { randomizeOutputs: false }
  })
  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a public gift notice')
  }
  await broadcastAnnouncement(response.tx as number[])
  const cached = keepLastGoodGifts(readCachedOverlayGifts(), [gift], false)
  writeCachedOverlayGifts(cached)
  return response.txid
}

function decodeOutput(beef: number[], outputIndex: number): CachedPublicReceipt | null {
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    const decoded = PushDrop.decode(output.lockingScript)
    const parsed = parseAnnouncementFields(decoded.fields)
    if (!parsed) return null
    return {
      receipt: parsed.receipt,
      signature: parsed.signature,
      signingKey: parsed.signingKey,
      announceTxid: tx.id('hex')
    }
  } catch {
    return null
  }
}

export async function lookupPublicReceipt(txid: string): Promise<{
  found: CachedPublicReceipt | null
  status: OverlayLookupStatus
  usedCache: boolean
  error?: string
}> {
  const cached = readCachedReceipt(txid)
  try {
    const resolver = overlayResolver()
    const answer = await resolver.query({
      service: LOOKUP_SERVICE,
      query: { txid }
    }, 15000) as {
      type?: string
      outputs?: Array<{ beef: number[]; outputIndex: number; txid?: string }>
    }
    if (answer.type === 'output-list' && answer.outputs) {
      for (const output of answer.outputs) {
        const decoded = decodeOutput(output.beef, output.outputIndex)
        if (!decoded) continue
        writeCachedReceipt(txid, { ...decoded, announceTxid: txid })
        return { found: { ...decoded, announceTxid: txid }, status: 'online', usedCache: false }
      }
    }
    if (cached) {
      return { found: cached, status: 'online', usedCache: true }
    }
    return { found: null, status: 'online', usedCache: false }
  } catch (err) {
    return {
      found: cached,
      status: 'failed',
      usedCache: Boolean(cached),
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

const GIFT_PAGE = 100
const GIFT_MAX_PAGES = 4

async function queryOverlayPages(): Promise<Array<{ beef: number[]; outputIndex: number }>> {
  const resolver = overlayResolver()
  const outputs: Array<{ beef: number[]; outputIndex: number }> = []
  for (let page = 0; page < GIFT_MAX_PAGES; page++) {
    const answer = await resolver.query({
      service: LOOKUP_SERVICE,
      query: { limit: GIFT_PAGE, skip: page * GIFT_PAGE, sortOrder: 'desc' }
    }, 15000) as {
      type?: string
      outputs?: Array<{ beef: number[]; outputIndex: number }>
    }
    if (answer.type !== 'output-list' || !answer.outputs) break
    outputs.push(...answer.outputs)
    if (answer.outputs.length < GIFT_PAGE) break
  }
  return outputs
}

function decodeGiftOutput(beef: number[], outputIndex: number): GiftNotice | null {
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    const decoded = PushDrop.decode(output.lockingScript)
    return parseGiftAnnouncementFields(decoded.fields)
  } catch {
    return null
  }
}

export async function lookupIncomingGifts(orgIdentityKey?: string): Promise<{
  gifts: GiftNotice[]
  status: OverlayLookupStatus
  usedCache: boolean
  error?: string
}> {
  const cached = readCachedOverlayGifts()
  try {
    const live: GiftNotice[] = []
    const seen = new Set<string>()
    for (const output of await queryOverlayPages()) {
      const gift = decodeGiftOutput(output.beef, output.outputIndex)
      if (!gift || seen.has(gift.giftId)) continue
      seen.add(gift.giftId)
      live.push(gift)
    }
    const kept = keepLastGoodGifts(cached, live, live.length === 0)
    if (kept.length > 0) writeCachedOverlayGifts(kept)
    const gifts = filterGiftsForOrg(kept, orgIdentityKey)
    return {
      gifts,
      status: 'online',
      usedCache: live.length === 0 && kept.length > 0
    }
  } catch (err) {
    const kept = keepLastGoodGifts(cached, [], true)
    return {
      gifts: filterGiftsForOrg(kept, orgIdentityKey),
      status: 'failed',
      usedCache: kept.length > 0,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export function filterReceiptsForGift(
  receipts: CachedPublicReceipt[],
  gift: {
    giftTxid: string
    purposeHash: string
    donorIdentityKey: string
    orgIdentityKey: string
  }
): CachedPublicReceipt[] {
  return receipts.filter((row) => receiptMatchesGift(row.receipt, gift))
}

/** ls_anytx client-filter on `grant receipt` receipt announcements. No wallet. */
export async function lookupReceiptAnnouncements(): Promise<{
  receipts: CachedPublicReceipt[]
  status: OverlayLookupStatus
  usedCache: boolean
  error?: string
}> {
  const cached = readCachedOverlayReceipts()
  try {
    const live: CachedPublicReceipt[] = []
    const seen = new Set<string>()
    for (const output of await queryOverlayPages()) {
      const decoded = decodeOutput(output.beef, output.outputIndex)
      if (!decoded) continue
      const key = decoded.announceTxid || decoded.receipt.giftTxid
      if (seen.has(key)) continue
      seen.add(key)
      live.push(decoded)
    }
    const kept = keepLastGoodReceipts(cached, live, live.length === 0)
    if (kept.length > 0) writeCachedOverlayReceipts(kept)
    return {
      receipts: kept,
      status: 'online',
      usedCache: live.length === 0 && kept.length > 0
    }
  } catch (err) {
    const kept = keepLastGoodReceipts(cached, [], true)
    return {
      receipts: kept,
      status: 'failed',
      usedCache: kept.length > 0,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

export async function lookupDonorReceipt(gift: {
  giftTxid: string
  purposeHash: string
  donorIdentityKey: string
  orgIdentityKey: string
}): Promise<{
  found: CachedPublicReceipt | null
  status: OverlayLookupStatus
  usedCache: boolean
  error?: string
}> {
  const looked = await lookupReceiptAnnouncements()
  const found = filterReceiptsForGift(looked.receipts, gift)[0] ?? null
  return {
    found,
    status: looked.status,
    usedCache: looked.usedCache,
    error: looked.error
  }
}
