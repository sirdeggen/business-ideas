import {
  LookupResolver,
  PushDrop,
  TopicBroadcaster,
  Transaction,
  type WalletClient
} from '@bsv/sdk'
import { BASKET } from '../../../protocol/treasury'
import {
  ANNOUNCE_PROTOCOL_ID,
  EVENT_TAG,
  LOOKUP_SERVICE,
  OVERLAY_HOST,
  TOPIC,
  encodeEventFields,
  mergeEvents,
  parseEventFields,
  reconstructTreasury,
  type BoardEvent,
  type Treasury
} from '../../../protocol/events'
import { originator } from './config'

const CACHE_PREFIX = 'policy-treasury.events.'
const PAGE = 100
const MAX_PAGES = 8

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

function cacheKey(treasuryId: string): string {
  return `${CACHE_PREFIX}${treasuryId}`
}

export function readCachedEvents(treasuryId: string): BoardEvent[] {
  try {
    const raw = localStorage.getItem(cacheKey(treasuryId))
    if (!raw) return []
    return JSON.parse(raw) as BoardEvent[]
  } catch {
    return []
  }
}

export function writeCachedEvents(treasuryId: string, events: BoardEvent[]): void {
  try {
    localStorage.setItem(cacheKey(treasuryId), JSON.stringify(events))
  } catch {
    // Private mode / quota — lookup still works.
  }
}

export function rememberEvents(treasuryId: string, incoming: BoardEvent[]): BoardEvent[] {
  const merged = mergeEvents(readCachedEvents(treasuryId), incoming)
  writeCachedEvents(treasuryId, merged)
  return merged
}

function decodeOutput(beef: number[], outputIndex: number): BoardEvent | null {
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    const decoded = PushDrop.decode(output.lockingScript)
    return parseEventFields(decoded.fields)
  } catch {
    return null
  }
}

export async function lookupBoardEvents(treasuryId?: string): Promise<BoardEvent[]> {
  const resolver = overlayResolver()
  const found: BoardEvent[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const answer = await resolver.query({
      service: LOOKUP_SERVICE,
      query: { limit: PAGE, skip: page * PAGE, sortOrder: 'desc' }
    }, 15000)
    if (answer.type !== 'output-list' || answer.outputs.length === 0) break
    for (const output of answer.outputs) {
      const event = decodeOutput(output.beef, output.outputIndex)
      if (!event) continue
      if (treasuryId && event.treasuryId !== treasuryId) continue
      found.push(event)
    }
    if (answer.outputs.length < PAGE) break
    if (treasuryId && found.some((event) => event.kind === 'created')) break
  }
  return found
}

export async function pingOverlay(): Promise<boolean> {
  try {
    const resolver = overlayResolver()
    const answer = await resolver.query({
      service: LOOKUP_SERVICE,
      query: { limit: 1, skip: 0, sortOrder: 'desc' }
    }, 8000)
    return answer.type === 'output-list'
  } catch {
    try {
      const response = await fetch(`${OVERLAY_HOST}/`, { method: 'GET' })
      return response.ok
    } catch {
      return false
    }
  }
}

function beefBytes(tx: Transaction): number[] {
  try {
    return tx.toBEEF()
  } catch {
    return tx.toBinary()
  }
}

async function submitBeefFallback(beef: number[]): Promise<void> {
  const body = Uint8Array.from(beef)
  const response = await fetch(`${OVERLAY_HOST}/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-topics': JSON.stringify([TOPIC])
    },
    body
  })
  if (!response.ok) {
    throw new Error(`overlay /submit failed (${response.status})`)
  }
}

export async function broadcastAnytx(txOrBeef: Transaction | number[]): Promise<void> {
  const tx = Array.isArray(txOrBeef) ? Transaction.fromBEEF(txOrBeef) : txOrBeef
  try {
    const result = await overlayBroadcaster().broadcast(tx)
    if (result && 'status' in result && result.status === 'error') {
      throw new Error(result.description || 'TopicBroadcaster failed')
    }
  } catch {
    await submitBeefFallback(Array.isArray(txOrBeef) ? txOrBeef : beefBytes(tx))
  }
}

export async function publishBoardEvent(
  wallet: WalletClient,
  event: BoardEvent
): Promise<{ txid: string; tx: number[] }> {
  const stamped = event.at ? event : { ...event, at: new Date().toISOString() }
  const keyID = `${stamped.treasuryId}:${stamped.kind}:${stamped.at}:${crypto.randomUUID()}`
  const token = new PushDrop(wallet, originator())
  const lockingScript = await token.lock(
    encodeEventFields(stamped),
    ANNOUNCE_PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )
  const response = await wallet.createAction({
    description: `Treasury ${stamped.kind}`.slice(0, 50),
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `${EVENT_TAG} ${stamped.kind}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: ANNOUNCE_PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'board', stamped.kind]
    }],
    labels: [BASKET, 'board', stamped.kind],
    options: { randomizeOutputs: false }
  })
  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a board announcement')
  }
  await broadcastAnytx(response.tx as number[])
  rememberEvents(stamped.treasuryId, [stamped])
  return { txid: response.txid, tx: response.tx as number[] }
}

export async function loadTreasury(treasuryId: string): Promise<Treasury | null> {
  let overlayEvents: BoardEvent[] = []
  try {
    overlayEvents = await lookupBoardEvents(treasuryId)
  } catch {
    overlayEvents = []
  }
  const events = rememberEvents(treasuryId, overlayEvents)
  return reconstructTreasury(events)
}
