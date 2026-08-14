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
  parseEventFields,
  reconstructTreasury,
  type BoardEvent,
  type Treasury
} from '../../../protocol/events'
import {
  keepLastGoodEvents,
  retryEmptyLookup,
  type OverlayLookupStatus
} from '../../../protocol/lookup'
import { originator } from './config'

const CACHE_PREFIX = 'policy-treasury.events.'
const SNAPSHOT_PREFIX = 'policy-treasury.snapshot.'
const CREATED_TX_PREFIX = 'policy-treasury.createdTx.'
const PAGE = 100
const MAX_PAGES = 8
const WIDE_PAGES = 16

export type { OverlayLookupStatus }

export interface TreasuryLoad {
  treasury: Treasury | null
  status: OverlayLookupStatus
  usedCache: boolean
  createdTxid?: string
  error?: string
}

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

function snapshotKey(treasuryId: string): string {
  return `${SNAPSHOT_PREFIX}${treasuryId}`
}

function createdTxKey(treasuryId: string): string {
  return `${CREATED_TX_PREFIX}${treasuryId}`
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

export function readCachedTreasury(treasuryId: string): Treasury | null {
  try {
    const raw = localStorage.getItem(snapshotKey(treasuryId))
    if (!raw) return null
    return JSON.parse(raw) as Treasury
  } catch {
    return null
  }
}

export function writeCachedTreasury(treasuryId: string, treasury: Treasury): void {
  try {
    localStorage.setItem(snapshotKey(treasuryId), JSON.stringify(treasury))
  } catch {
    // Private mode / quota.
  }
}

export function readCreatedTxid(treasuryId: string): string | undefined {
  try {
    return localStorage.getItem(createdTxKey(treasuryId)) || undefined
  } catch {
    return undefined
  }
}

export function writeCreatedTxid(treasuryId: string, txid: string): void {
  try {
    localStorage.setItem(createdTxKey(treasuryId), txid)
  } catch {
    // Private mode / quota.
  }
}

export function rememberEvents(treasuryId: string, incoming: BoardEvent[]): BoardEvent[] {
  const merged = keepLastGoodEvents(readCachedEvents(treasuryId), incoming, incoming.length === 0)
  writeCachedEvents(treasuryId, merged)
  const treasury = reconstructTreasury(merged)
  if (treasury) writeCachedTreasury(treasuryId, treasury)
  return merged
}

function outputTxid(output: { beef: number[]; txid?: string }): string | undefined {
  if (typeof output.txid === 'string' && output.txid) return output.txid
  try {
    return Transaction.fromBEEF(output.beef).id('hex')
  } catch {
    return undefined
  }
}

function decodeOutput(beef: number[], outputIndex: number, txid?: string): BoardEvent | null {
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    const decoded = PushDrop.decode(output.lockingScript)
    const event = parseEventFields(decoded.fields)
    if (!event) return null
    if (txid && event.kind === 'created' && !event.payload.announceTxid) {
      event.payload.announceTxid = txid
    }
    return event
  } catch {
    return null
  }
}

function collectFromAnswer(
  answer: { type?: string; outputs?: Array<{ beef: number[]; outputIndex: number; txid?: string }> },
  treasuryId?: string
): { events: BoardEvent[]; createdTxid?: string } {
  const events: BoardEvent[] = []
  let createdTxid: string | undefined
  if (answer.type !== 'output-list' || !answer.outputs) return { events }
  for (const output of answer.outputs) {
    const txid = outputTxid(output)
    const event = decodeOutput(output.beef, output.outputIndex, txid)
    if (!event) continue
    if (treasuryId && event.treasuryId !== treasuryId) continue
    events.push(event)
    if (event.kind === 'created' && txid) createdTxid = txid
  }
  return { events, createdTxid }
}

async function queryAnytx(
  query: Record<string, unknown>,
  timeout = 15000
): Promise<{ events: BoardEvent[]; createdTxid?: string; outputCount: number }> {
  const resolver = overlayResolver()
  const answer = await resolver.query({
    service: LOOKUP_SERVICE,
    query
  }, timeout) as { type?: string; outputs?: Array<{ beef: number[]; outputIndex: number; txid?: string }> }
  const collected = collectFromAnswer(answer, undefined)
  return {
    events: collected.events,
    createdTxid: collected.createdTxid,
    outputCount: answer.type === 'output-list' ? (answer.outputs?.length ?? 0) : 0
  }
}

export async function lookupBoardEvents(
  treasuryId?: string,
  opts?: { txid?: string; pages?: number }
): Promise<{ events: BoardEvent[]; createdTxid?: string }> {
  const found: BoardEvent[] = []
  let createdTxid = opts?.txid

  if (opts?.txid) {
    try {
      const byTx = await queryAnytx({ txid: opts.txid }, 20000)
      for (const event of byTx.events) {
        if (treasuryId && event.treasuryId !== treasuryId) continue
        found.push(event)
        if (event.kind === 'created') createdTxid = opts.txid
      }
    } catch {
      // Fall through to the firehose; overlay is flaky.
    }
  }

  const pages = opts?.pages ?? MAX_PAGES
  for (let page = 0; page < pages; page++) {
    const answer = await queryAnytx({
      limit: PAGE,
      skip: page * PAGE,
      sortOrder: 'desc'
    })
    for (const event of answer.events) {
      if (treasuryId && event.treasuryId !== treasuryId) continue
      found.push(event)
      if (event.kind === 'created' && event.payload.announceTxid) {
        createdTxid = String(event.payload.announceTxid)
      }
    }
    if (answer.outputCount < PAGE) break
    if (treasuryId && found.some((event) => event.kind === 'created')) break
  }

  if (treasuryId && !found.some((event) => event.kind === 'created')) {
    const end = new Date()
    const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
    try {
      const windowed = await queryAnytx({
        limit: PAGE,
        skip: 0,
        sortOrder: 'desc',
        startDate: start.toISOString(),
        endDate: end.toISOString()
      })
      for (const event of windowed.events) {
        if (event.treasuryId !== treasuryId) continue
        found.push(event)
        if (event.kind === 'created' && event.payload.announceTxid) {
          createdTxid = String(event.payload.announceTxid)
        }
      }
    } catch {
      // Date-window query is best-effort.
    }
  }

  return { events: found, createdTxid }
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
  if (stamped.kind === 'created') writeCreatedTxid(stamped.treasuryId, response.txid)
  rememberEvents(stamped.treasuryId, [stamped])
  return { txid: response.txid, tx: response.tx as number[] }
}

function lastGood(treasuryId: string): Treasury | null {
  return reconstructTreasury(readCachedEvents(treasuryId)) ?? readCachedTreasury(treasuryId)
}

export async function loadTreasury(
  treasuryId: string,
  opts?: { txid?: string }
): Promise<TreasuryLoad> {
  const cached = lastGood(treasuryId)
  const cachedTx = opts?.txid || readCreatedTxid(treasuryId)
  let pages = MAX_PAGES

  const result = await retryEmptyLookup(async () => {
    const looked = await lookupBoardEvents(treasuryId, { txid: cachedTx, pages })
    pages = WIDE_PAGES
    return looked.events
  }, { delayMs: 350 })

  if (result.items.length > 0) {
    const events = rememberEvents(treasuryId, result.items)
    const treasury = reconstructTreasury(events) ?? cached
    if (treasury) writeCachedTreasury(treasuryId, treasury)
    const created = result.items.find((event) => event.kind === 'created')
    const createdTxid = cachedTx
      || (created && typeof created.payload.announceTxid === 'string' ? created.payload.announceTxid : undefined)
    if (createdTxid) writeCreatedTxid(treasuryId, createdTxid)
    return {
      treasury,
      status: 'online',
      usedCache: !reconstructTreasury(result.items) && Boolean(cached),
      createdTxid
    }
  }

  if (cached) {
    return {
      treasury: cached,
      status: result.failed ? 'failed' : 'online',
      usedCache: true,
      createdTxid: cachedTx,
      error: result.error
    }
  }

  return {
    treasury: null,
    status: result.failed ? 'failed' : 'online',
    usedCache: false,
    createdTxid: cachedTx,
    error: result.error
  }
}
