import {
  LookupResolver,
  PushDrop,
  TopicBroadcaster,
  Transaction,
  type WalletClient
} from '@bsv/sdk'
import { originator } from './config'
import { readCachedReceipt, writeCachedReceipt, type CachedPublicReceipt } from './persist'
import {
  ANNOUNCE_PROTOCOL_ID,
  BASKET,
  LOOKUP_SERVICE,
  OVERLAY_HOST,
  PROTOCOL_TAG,
  TOPIC,
  encodeAnnouncementFields,
  parseAnnouncementFields,
  type CanonicalReceipt
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
  writeCachedReceipt(response.txid, {
    receipt,
    signature,
    signingKey,
    announceTxid: response.txid
  })
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
