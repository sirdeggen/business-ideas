import { Beef, LockingScript, PushDrop, Transaction } from '@bsv/sdk'
import {
  BASKET,
  LEGACY_BASKET,
  explainTicketParse,
  parseTicketFields,
  type TicketPayload
} from '../../../protocol/ticket'

export interface HeldTicket {
  outpoint: string
  satoshis: number
  ticket: TicketPayload
  customInstructions: string
  beef?: number[]
  basket: string
}

export interface UnparsedOutput {
  outpoint: string
  reason: string
  scriptBytes?: number
  spendable?: boolean
}

export interface BasketSlice {
  basket: string
  listed: number
  totalOutputs: number
  spendable: number
  parsed: number
  unparsed: UnparsedOutput[]
}

export interface BasketInspection {
  tickets: HeldTicket[]
  primary: BasketSlice
  legacy: BasketSlice
}

export interface ListedOutput {
  outpoint: string
  satoshis?: number | string
  lockingScript?: unknown
  customInstructions?: string
  spendable?: boolean
  beef?: unknown
  BEEF?: unknown
}

export interface ListOutputsResult {
  outputs?: ListedOutput[]
  totalOutputs?: number
  BEEF?: unknown
  beef?: unknown
}

export type ListOutputsFn = (args: {
  basket: string
  include?: 'entire transactions' | 'locking scripts'
  includeCustomInstructions?: boolean
  limit: number
}) => Promise<ListOutputsResult>

function bytesOf(raw: unknown): number[] | undefined {
  if (!raw) return undefined
  if (Array.isArray(raw) && raw.every((item) => typeof item === 'number')) {
    return raw as number[]
  }
  if (raw instanceof Uint8Array) return Array.from(raw)
  return undefined
}

function lockingScriptHex(raw: unknown): string | undefined {
  if (!raw) return undefined
  if (typeof raw === 'string') {
    const hex = raw.trim()
    return /^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0 ? hex : undefined
  }
  if (typeof raw === 'object' && raw !== null) {
    const record = raw as { toHex?: () => string, hex?: string }
    if (typeof record.toHex === 'function') {
      try {
        const hex = record.toHex()
        if (typeof hex === 'string' && hex.length > 0) return hex
      } catch {
        // Fall through.
      }
    }
    if (typeof record.hex === 'string') return lockingScriptHex(record.hex)
  }
  const asBytes = bytesOf(raw)
  if (!asBytes || asBytes.length === 0) return undefined
  return asBytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function splitOutpoint(outpoint: string): { txid: string, vout: number } | null {
  const parts = outpoint.includes('.') ? outpoint.split('.') : outpoint.split('_')
  if (parts.length < 2) return null
  const vout = Number(parts[parts.length - 1])
  const txid = parts.slice(0, -1).join('.')
  if (!txid || !Number.isInteger(vout) || vout < 0) return null
  return { txid, vout }
}

export function transactionFromBeef(listedBeef: number[] | undefined, txid: string): Transaction | null {
  if (!listedBeef || listedBeef.length === 0) return null
  try {
    const beef = new Beef()
    beef.mergeBeef(listedBeef)
    if (beef.findTxid(txid)) {
      return Transaction.fromBEEF(beef.toBinaryAtomic(txid))
    }
  } catch {
    // Combined BEEF may still be a single transaction.
  }
  try {
    const tx = Transaction.fromBEEF(listedBeef)
    if (tx.id('hex') === txid) return tx
  } catch {
    return null
  }
  return null
}

export function lockingScriptFromBeef(
  listedBeef: number[] | undefined,
  outpoint: string
): string | undefined {
  const parsed = splitOutpoint(outpoint)
  if (!parsed) return undefined
  const tx = transactionFromBeef(listedBeef, parsed.txid)
  if (!tx) return undefined
  return tx.outputs[parsed.vout]?.lockingScript?.toHex()
}

export function beefForOutpoint(listedBeef: number[] | undefined, outpoint: string): number[] | undefined {
  if (!listedBeef || listedBeef.length === 0) return listedBeef
  const parsed = splitOutpoint(outpoint)
  if (!parsed) return listedBeef
  try {
    const beef = new Beef()
    beef.mergeBeef(listedBeef)
    if (beef.findTxid(parsed.txid)) return beef.toBinaryAtomic(parsed.txid)
  } catch {
    return listedBeef
  }
  return listedBeef
}

function scriptByteLength(hex: string): number {
  return Math.floor(hex.length / 2)
}

function describeScript(hex: string): string {
  const bytes = scriptByteLength(hex)
  if (bytes === 34 && hex.startsWith('21')) return `${bytes}-byte pubkey push (not a ticket)`
  if (bytes === 33) return '33-byte pubkey (not a ticket)'
  return `${bytes}-byte script`
}

function fieldsFromScript(script: LockingScript): { fields: Array<number[] | Uint8Array>, note?: string } {
  const errors: string[] = []
  for (const position of ['before', 'after'] as const) {
    try {
      return { fields: PushDrop.decode(script, position).fields }
    } catch (error) {
      errors.push(`${position}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const chunks = (script as LockingScript & { chunks?: Array<{ data?: number[] }> }).chunks
  if (Array.isArray(chunks)) {
    const fields = chunks
      .filter((chunk) => Array.isArray(chunk.data) && chunk.data.length > 0)
      .map((chunk) => Array.from(chunk.data as number[]))
    if (fields.length > 0) {
      return { fields, note: `PushDrop.decode failed (${errors.join('; ')}); used raw pushdata` }
    }
  }
  throw new Error(errors[0] ?? 'PushDrop.decode failed')
}

function resolveLockingScript(output: ListedOutput, listedBeef?: number[]): {
  hex?: string
  source: 'lockingScript' | 'beef' | 'missing'
} {
  const direct = lockingScriptHex(output.lockingScript)
  if (direct) return { hex: direct, source: 'lockingScript' }
  const fromOwnBeef = lockingScriptFromBeef(bytesOf(output.BEEF ?? output.beef), output.outpoint)
  if (fromOwnBeef) return { hex: fromOwnBeef, source: 'beef' }
  const fromListed = lockingScriptFromBeef(listedBeef, output.outpoint)
  if (fromListed) return { hex: fromListed, source: 'beef' }
  return { source: 'missing' }
}

export function inspectListedOutputs(
  outputs: ListedOutput[],
  listedBeef: number[] | undefined,
  basket: string
): { tickets: HeldTicket[], slice: BasketSlice } {
  const tickets: HeldTicket[] = []
  const unparsed: UnparsedOutput[] = []

  for (const output of outputs) {
    const outpoint = output.outpoint || '(missing outpoint)'
    const resolved = resolveLockingScript(output, listedBeef)
    if (!resolved.hex) {
      unparsed.push({
        outpoint,
        spendable: output.spendable,
        reason: listedBeef && listedBeef.length > 0
          ? 'missing lockingScript and outpoint not in listed BEEF'
          : 'missing lockingScript (listOutputs did not include a script or BEEF)'
      })
      continue
    }
    const scriptBytes = scriptByteLength(resolved.hex)
    try {
      const decoded = fieldsFromScript(LockingScript.fromHex(resolved.hex))
      const ticket = parseTicketFields(decoded.fields)
      if (!ticket) {
        const why = explainTicketParse(decoded.fields)
        unparsed.push({
          outpoint,
          scriptBytes,
          spendable: output.spendable,
          reason: `${describeScript(resolved.hex)}: ${decoded.note ? `${why} (${decoded.note})` : why}`
        })
        continue
      }
      tickets.push({
        outpoint,
        satoshis: Number(output.satoshis ?? 1),
        ticket,
        customInstructions: output.customInstructions ?? '',
        beef: beefForOutpoint(bytesOf(output.BEEF ?? output.beef) ?? listedBeef, outpoint),
        basket
      })
    } catch (error) {
      const detail = error instanceof Error && error.message.trim()
        ? error.message
        : 'lockingScript is not a PushDrop ticket'
      unparsed.push({
        outpoint,
        scriptBytes,
        spendable: output.spendable,
        reason: `${describeScript(resolved.hex)}: ${detail}`
      })
    }
  }

  return {
    tickets,
    slice: {
      basket,
      listed: outputs.length,
      totalOutputs: outputs.length,
      spendable: outputs.filter((item) => item.spendable !== false).length,
      parsed: tickets.length,
      unparsed
    }
  }
}

function listFailure(basket: string, include: string, error: unknown): string {
  const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
  return detail.trim()
    ? `listOutputs(${basket}, include=${include}) failed: ${detail}`
    : `listOutputs(${basket}, include=${include}) failed with no message`
}

async function tryListOutputs(
  listOutputs: ListOutputsFn,
  basket: string,
  include?: 'entire transactions' | 'locking scripts',
  includeCustomInstructions = true
): Promise<{ outputs: ListedOutput[], beef?: number[], totalOutputs: number, error?: string }> {
  const label = include ?? 'default'
  try {
    const listed = await listOutputs({
      basket,
      ...(include ? { include } : {}),
      includeCustomInstructions,
      limit: 1000
    })
    if (!listed || !Array.isArray(listed.outputs)) {
      const keys = listed && typeof listed === 'object' ? Object.keys(listed).join(', ') : String(listed)
      return {
        outputs: [],
        totalOutputs: typeof listed?.totalOutputs === 'number' ? listed.totalOutputs : 0,
        error: `listOutputs(${basket}, include=${label}) did not return outputs (keys: ${keys})`
      }
    }
    return {
      outputs: listed.outputs.map((output) => ({ ...output })),
      beef: bytesOf(listed.BEEF ?? listed.beef),
      totalOutputs: typeof listed.totalOutputs === 'number' ? listed.totalOutputs : listed.outputs.length
    }
  } catch (error) {
    return { outputs: [], totalOutputs: 0, error: listFailure(basket, label, error) }
  }
}

function mergeListedOutputs(primary: ListedOutput[], extra: ListedOutput[]): ListedOutput[] {
  const byOutpoint = new Map<string, ListedOutput>()
  for (const output of [...primary, ...extra]) {
    const existing = byOutpoint.get(output.outpoint)
    if (!existing) {
      byOutpoint.set(output.outpoint, { ...output })
      continue
    }
    if (!lockingScriptHex(existing.lockingScript) && lockingScriptHex(output.lockingScript)) {
      existing.lockingScript = output.lockingScript
    }
    if (!existing.customInstructions && output.customInstructions) {
      existing.customInstructions = output.customInstructions
    }
    if (existing.spendable == null && output.spendable != null) {
      existing.spendable = output.spendable
    }
    if (!bytesOf(existing.BEEF ?? existing.beef)) {
      existing.BEEF = output.BEEF ?? output.beef
    }
  }
  return [...byOutpoint.values()]
}

async function listOneBasket(listOutputs: ListOutputsFn, basket: string): Promise<{
  outputs: ListedOutput[]
  beef?: number[]
  totalOutputs: number
  error?: string
}> {
  // Locking scripts first: Desktop already has the 144-byte ticket scripts.
  // `entire transactions` can throw while assembling BEEF and hide those rows.
  const scripts = await tryListOutputs(listOutputs, basket, 'locking scripts')
  const entire = await tryListOutputs(listOutputs, basket, 'entire transactions')
  let outputs = mergeListedOutputs(scripts.outputs, entire.outputs)
  if (outputs.length === 0) {
    const bare = await tryListOutputs(listOutputs, basket, undefined, false)
    outputs = mergeListedOutputs(outputs, bare.outputs)
    const totalOutputs = Math.max(scripts.totalOutputs, entire.totalOutputs, bare.totalOutputs, outputs.length)
    const error = [scripts.error, entire.error, bare.error].filter((item): item is string => Boolean(item)).join('; ') || undefined
    if (outputs.length === 0 && scripts.error && entire.error && bare.error) {
      throw new Error(error)
    }
    return { outputs, beef: entire.beef ?? scripts.beef ?? bare.beef, totalOutputs, error }
  }

  return {
    outputs,
    beef: entire.beef ?? scripts.beef,
    totalOutputs: Math.max(scripts.totalOutputs, entire.totalOutputs, outputs.length),
    error: undefined
  }
}

function emptySlice(basket: string): BasketSlice {
  return { basket, listed: 0, totalOutputs: 0, spendable: 0, parsed: 0, unparsed: [] }
}

async function listBasketMerged(listers: ListOutputsFn[], basket: string): Promise<{
  outputs: ListedOutput[]
  beef?: number[]
  totalOutputs: number
  error?: string
}> {
  const results = await Promise.all(listers.map(async (listOutputs) => {
    try {
      return await listOneBasket(listOutputs, basket)
    } catch (error) {
      return {
        outputs: [] as ListedOutput[],
        totalOutputs: 0,
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }))
  let outputs: ListedOutput[] = []
  let beef: number[] | undefined
  let totalOutputs = 0
  const errors: string[] = []
  for (const result of results) {
    outputs = mergeListedOutputs(outputs, result.outputs)
    if (!beef && result.beef) beef = result.beef
    totalOutputs = Math.max(totalOutputs, result.totalOutputs, result.outputs.length)
    if (result.error) errors.push(result.error)
  }
  return {
    outputs,
    beef,
    totalOutputs: Math.max(totalOutputs, outputs.length),
    error: outputs.length === 0 ? errors.join('; ') || undefined : undefined
  }
}

export async function inspectBaskets(listOutputs: ListOutputsFn | ListOutputsFn[]): Promise<BasketInspection> {
  const listers = Array.isArray(listOutputs) ? listOutputs : [listOutputs]
  const primaryListed = await listBasketMerged(listers, BASKET)
  const primary = inspectListedOutputs(primaryListed.outputs, primaryListed.beef, BASKET)
  primary.slice.totalOutputs = Math.max(primary.slice.totalOutputs, primaryListed.totalOutputs)
  if (primaryListed.error && primary.tickets.length === 0 && primary.slice.listed === 0) {
    primary.slice.unparsed.push({ outpoint: '(listOutputs)', reason: primaryListed.error })
  }

  let legacy = { tickets: [] as HeldTicket[], slice: emptySlice(LEGACY_BASKET) }
  try {
    const legacyListed = await listBasketMerged(listers, LEGACY_BASKET)
    legacy = inspectListedOutputs(legacyListed.outputs, legacyListed.beef, LEGACY_BASKET)
    legacy.slice.totalOutputs = Math.max(legacy.slice.totalOutputs, legacyListed.totalOutputs)
  } catch {
    // Two-word basket may not exist on this wallet. Do not make it the primary list.
  }

  return {
    tickets: [...primary.tickets, ...legacy.tickets],
    primary: primary.slice,
    legacy: legacy.slice
  }
}

function formatUnparsed(item: UnparsedOutput): string {
  const spendable = item.spendable === false ? 'unspendable' : item.spendable === true ? 'spendable' : undefined
  const size = item.scriptBytes != null ? `${item.scriptBytes}B` : undefined
  const prefix = [spendable, size].filter(Boolean).join(' ')
  return prefix ? `${item.outpoint} ${prefix}: ${item.reason}` : `${item.outpoint}: ${item.reason}`
}

export function formatBasketDiagnostic(inspection: BasketInspection): string {
  const { primary, legacy, tickets } = inspection
  if (tickets.length > 0) {
    return legacy.parsed > 0
      ? `Also found ${legacy.parsed} in “${LEGACY_BASKET}”.`
      : ''
  }

  const parts: string[] = []
  if (primary.listed > 0) {
    const fat = primary.unparsed.filter((item) => (item.scriptBytes ?? 0) >= 100)
    const shown = (fat.length > 0 ? fat : primary.unparsed).slice(0, 2)
    const detail = shown.map(formatUnparsed).join('; ')
    parts.push(
      `${BASKET} has ${primary.listed} outputs` +
      (primary.spendable ? ` (${primary.spendable} spendable)` : '') +
      `; none parsed as Demo Night tickets` +
      (detail ? ` (${detail})` : '')
    )
  } else if (primary.totalOutputs > 0) {
    parts.push(
      `listOutputs(${BASKET}) reported totalOutputs=${primary.totalOutputs} but returned 0 output rows`
    )
  } else if (primary.unparsed[0]) {
    parts.push(primary.unparsed[0].reason)
  } else {
    parts.push(`listOutputs('${BASKET}') returned 0 outputs`)
  }
  if (legacy.listed > 0) {
    parts.push(`also found ${legacy.listed} in older basket “${LEGACY_BASKET}”`)
  }
  return parts.join('. ')
}

