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
  legalAnytxQuery,
  relatedTxids,
  resolveCreateTxid,
  retryEmptyLookup,
  shortPageIsEof,
  type OverlayLookupStatus
} from '../../../protocol/lookup'
import { originator } from './config'

const CACHE_PREFIX = 'policy-treasury.events.'
const SNAPSHOT_PREFIX = 'policy-treasury.snapshot.'
const CREATED_TX_PREFIX = 'policy-treasury.createdTx.'
const PAGE = 100
const MAX_PAGES = 8

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

function forBoard(events: BoardEvent[], treasuryId?: string): BoardEvent[] {
  if (!treasuryId) return events
  return events.filter((event) => event.treasuryId === treasuryId)
}

export async function lookupBoardEvents(
  treasuryId?: string,
  opts?: { txid?: string; pages?: number }
): Promise<{ events: BoardEvent[]; createdTxid?: string; error?: string }> {
  const createdTxid = resolveCreateTxid(treasuryId, opts?.txid)
  const found: BoardEvent[] = []
  let error: string | undefined

  if (createdTxid) {
    const byTx = await retryEmptyLookup(async () => {
      const answer = await queryAnytx(legalAnytxQuery({ txid: createdTxid }), 20000)
      return forBoard(answer.events, treasuryId)
    }, { delayMs: 350 })
    found.push(...byTx.items)
    if (byTx.failed) error = byTx.error
  }

  for (const txid of relatedTxids(treasuryId, createdTxid)) {
    try {
      const extra = await queryAnytx(legalAnytxQuery({ txid }), 20000)
      found.push(...forBoard(extra.events, treasuryId))
    } catch (err) {
      error = error || (err instanceof Error ? err.message : String(err))
    }
  }

  if (found.some((event) => event.kind === 'created')) {
    try {
      const created = found.find((event) => event.kind === 'created')
      const start = created ? new Date(created.at) : new Date(Date.now() - 14 * 86_400_000)
      const windowed = await queryAnytx(legalAnytxQuery({
        limit: 50,
        skip: 0,
        startDate: new Date(start.getTime() - 60_000).toISOString(),
        endDate: new Date().toISOString()
      }), 20000)
      found.push(...forBoard(windowed.events, treasuryId))
    } catch (err) {
      error = error || (err instanceof Error ? err.message : String(err))
    }
    return { events: found, createdTxid, error }
  }

  const pages = opts?.pages ?? MAX_PAGES
  try {
    for (let page = 0; page < pages; page++) {
      const answer = await queryAnytx(legalAnytxQuery({
        limit: PAGE,
        skip: page * PAGE
      }))
      found.push(...forBoard(answer.events, treasuryId))
      if (shortPageIsEof(answer.outputCount, PAGE)) break
      if (found.some((event) => event.kind === 'created')) break
    }
  } catch (err) {
    error = error || (err instanceof Error ? err.message : String(err))
  }

  return { events: found, createdTxid, error }
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
  const cachedTx = resolveCreateTxid(treasuryId, opts?.txid || readCreatedTxid(treasuryId))

  let looked: { events: BoardEvent[]; createdTxid?: string; error?: string }
  try {
    looked = await lookupBoardEvents(treasuryId, { txid: cachedTx })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      treasury: cached,
      status: 'failed',
      usedCache: Boolean(cached),
      createdTxid: cachedTx,
      error: message
    }
  }

  if (looked.events.length > 0) {
    const events = rememberEvents(treasuryId, looked.events)
    const live = reconstructTreasury(looked.events)
    const treasury = reconstructTreasury(events) ?? cached
    if (treasury) writeCachedTreasury(treasuryId, treasury)
    const createdTxid = looked.createdTxid
      || cachedTx
      || (typeof looked.events.find((event) => event.kind === 'created')?.payload.announceTxid === 'string'
        ? String(looked.events.find((event) => event.kind === 'created')?.payload.announceTxid)
        : undefined)
    if (createdTxid) writeCreatedTxid(treasuryId, createdTxid)
    return {
      treasury,
      status: live ? 'online' : looked.error ? 'failed' : 'online',
      usedCache: !live && Boolean(cached),
      createdTxid,
      error: looked.error
    }
  }

  if (cached) {
    return {
      treasury: cached,
      status: looked.error ? 'failed' : 'online',
      usedCache: true,
      createdTxid: cachedTx,
      error: looked.error
    }
  }

  return {
    treasury: null,
    status: looked.error ? 'failed' : 'online',
    usedCache: false,
    createdTxid: cachedTx,
    error: looked.error
  }
}
