import {
  HTTPSOverlayBroadcastFacilitator,
  LookupResolver,
  PushDrop,
  Transaction,
  type LookupAnswer
} from '@bsv/sdk'
import {
  LOOKUP_SERVICE,
  TAG,
  TOPIC,
  joinStreamRecords,
  parseStreamFields,
  type JoinedStream
} from '../../../protocol/stream'
import { PUBLIC_LOOKUP, PUBLIC_TOPIC } from './config'

export interface OverlayStream extends JoinedStream {}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
}

export interface StreamLookupQuery {
  streamId?: string
  txid?: string
}

function overlayUrl(base: string): string {
  return base.replace(/\/$/, '')
}

export function overlayTopic(_base: string): string {
  return PUBLIC_TOPIC || TOPIC
}

export function overlayLookupService(_base: string): string {
  return PUBLIC_LOOKUP || LOOKUP_SERVICE
}

function createResolver(host: string, service: string): LookupResolver {
  const allowHTTP = host.startsWith('http://')
  return new LookupResolver({
    networkPreset: allowHTTP ? 'local' : 'mainnet',
    hostOverrides: { [service]: [host] }
  })
}

export function txFromWalletBeef(beef: number[]): Transaction {
  try {
    return Transaction.fromAtomicBEEF(beef)
  } catch {
    return Transaction.fromBEEF(beef)
  }
}

function standardBeef(tx: Transaction): number[] {
  try {
    return tx.toBEEF()
  } catch {
    return tx.toBEEF(true)
  }
}

export function steakOutputsToAdmit(raw: unknown, topic: string): number[] | null {
  if (!raw || typeof raw !== 'object') return null
  const topicResult = (raw as Record<string, { outputsToAdmit?: unknown }>)[topic]
  if (!topicResult || !Array.isArray(topicResult.outputsToAdmit)) return null
  const admitted = topicResult.outputsToAdmit.filter((index): index is number => Number.isInteger(index))
  return admitted
}

function overlaySubmitError(): Error {
  return new Error('overlay submit failed')
}

async function submitBeefFallback(host: string, topic: string, beef: number[]): Promise<SubmitResult> {
  const response = await fetch(`${host}/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-topics': JSON.stringify([topic])
    },
    body: Uint8Array.from(beef)
  })
  const text = await response.text()
  let raw: unknown = text
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    // Overlay may return empty or non-JSON on failure.
  }
  if (!response.ok) throw overlaySubmitError()
  const admitted = steakOutputsToAdmit(raw, topic)
  if (!admitted || admitted.length === 0) throw overlaySubmitError()
  return { admitted, raw }
}

export async function submitStreamTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  let tx: Transaction
  let beefBytes: number[]
  try {
    tx = txFromWalletBeef(beef)
    beefBytes = standardBeef(tx)
  } catch {
    throw overlaySubmitError()
  }

  try {
    const steak = await new HTTPSOverlayBroadcastFacilitator(undefined, host.startsWith('http://')).send(host, {
      beef: beefBytes,
      topics: [topic]
    })
    const admitted = steakOutputsToAdmit(steak, topic)
    if (admitted && admitted.length > 0) return { admitted, raw: steak }
  } catch {
    // Direct /submit is the path that admitted on overlay-us-1.
  }

  try {
    return await submitBeefFallback(host, topic, beefBytes)
  } catch {
    throw overlaySubmitError()
  }
}

export async function lookupStreams(
  base: string,
  query: StreamLookupQuery = {}
): Promise<OverlayStream[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const resolver = createResolver(host, service)
  const indexed = collectIndexed(await queryAnytx(resolver, service, query), query)
  const joined = joinStreamRecords(indexed)
  if (query.streamId) {
    return joined.filter((row): row is OverlayStream => row.streamId === query.streamId)
  }
  return joined
}

async function queryAnytx(
  resolver: LookupResolver,
  service: string,
  query: StreamLookupQuery
): Promise<LookupAnswer[]> {
  const answers: LookupAnswer[] = []
  if (query.txid) {
    answers.push(await resolver.query({ service, query: { txid: query.txid } }, 20000))
  }

  const pageSize = 100
  for (let page = 0; page < 5; page++) {
    const answer = await resolver.query({
      service,
      query: { limit: pageSize, skip: page * pageSize, sortOrder: 'desc' }
    }, 20000)
    answers.push(answer)
    const count = answer.type === 'output-list' ? answer.outputs.length : 0
    if (count < pageSize) break
  }
  return answers
}

function collectIndexed(
  answers: LookupAnswer[],
  query: StreamLookupQuery = {}
): Parameters<typeof joinStreamRecords>[0] {
  const rows: Parameters<typeof joinStreamRecords>[0] = []
  const seen = new Set<string>()
  // ls_anytx findByTxid returns one arbitrary vout (often change). When the
  // caller asked for a txid, scan every BEEF output for TAG streampay.
  const scanAll = Boolean(query.txid)

  for (const answer of answers) {
    if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) continue
    for (const output of answer.outputs) {
      const decodedRows = scanAll
        ? decodeBeefStreampayOutputs(output.beef, output.txid)
        : [decodeBeefOutput(output.beef, output.outputIndex, output.txid)]
      for (const decoded of decodedRows) {
        if (!decoded) continue
        const key = `${decoded.txid}.${decoded.outputIndex}`
        if (seen.has(key)) continue
        seen.add(key)
        rows.push(decoded)
      }
    }
  }

  return rows
}

type IndexedRow = Parameters<typeof joinStreamRecords>[0][number]

function parseLockingScript(
  lockingScript: Transaction['outputs'][number]['lockingScript'],
  txid: string,
  outputIndex: number
): IndexedRow | null {
  try {
    const fields = PushDrop.decode(lockingScript).fields
    const tag = fields[0] ? new TextDecoder().decode(Uint8Array.from(fields[0])) : ''
    if (tag !== TAG) return null
    const stream = parseStreamFields(fields)
    if (!stream) return null
    return { stream, txid, outputIndex }
  } catch {
    return null
  }
}

function decodeBeefOutput(
  beef: number[] | undefined,
  outputIndex: number,
  txidHint?: string
): IndexedRow | null {
  if (!beef || beef.length === 0) return null
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    return parseLockingScript(output.lockingScript, txidHint || tx.id('hex'), outputIndex)
  } catch {
    return null
  }
}

function decodeBeefStreampayOutputs(
  beef: number[] | undefined,
  txidHint?: string
): IndexedRow[] {
  if (!beef || beef.length === 0) return []
  try {
    const tx = Transaction.fromBEEF(beef)
    const txid = txidHint || tx.id('hex')
    const rows: IndexedRow[] = []
    for (const [outputIndex, output] of tx.outputs.entries()) {
      const decoded = parseLockingScript(output.lockingScript, txid, outputIndex)
      if (decoded) rows.push(decoded)
    }
    return rows
  } catch {
    return []
  }
}

export function streamOutputIndex(tx: Transaction): number {
  for (const [index, output] of tx.outputs.entries()) {
    try {
      const decoded = PushDrop.decode(output.lockingScript)
      if (parseStreamFields(decoded.fields)) return index
    } catch {
      // Change and BRC-29 payment outputs are ignored.
    }
  }
  return 0
}

export async function pingOverlay(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${overlayUrl(base)}/version`)
    if (response.ok) return true
    const health = await fetch(`${overlayUrl(base)}/health/live`)
    return health.ok
  } catch {
    return false
  }
}
