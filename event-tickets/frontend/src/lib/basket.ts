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
}

export interface BasketSlice {
  basket: string
  listed: number
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
  beef?: unknown
  BEEF?: unknown
}

export interface ListOutputsResult {
  outputs?: ListedOutput[]
  BEEF?: unknown
  beef?: unknown
}

export type ListOutputsFn = (args: {
  basket: string
  include: 'entire transactions' | 'locking scripts'
  includeCustomInstructions: boolean
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
    try {
      const resolved = resolveLockingScript(output, listedBeef)
      if (!resolved.hex) {
        unparsed.push({
          outpoint,
          reason: listedBeef && listedBeef.length > 0
            ? 'missing lockingScript and outpoint not in listed BEEF'
            : 'missing lockingScript (listOutputs did not include a script or BEEF)'
        })
        continue
      }
      const decoded = fieldsFromScript(LockingScript.fromHex(resolved.hex))
      const ticket = parseTicketFields(decoded.fields)
      if (!ticket) {
        const why = explainTicketParse(decoded.fields)
        unparsed.push({
          outpoint,
          reason: decoded.note ? `${why} (${decoded.note})` : why
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
      unparsed.push({
        outpoint,
        reason: error instanceof Error && error.message.trim()
          ? error.message
          : 'lockingScript is not a PushDrop ticket'
      })
    }
  }

  return {
    tickets,
    slice: {
      basket,
      listed: outputs.length,
      parsed: tickets.length,
      unparsed
    }
  }
}

async function listOneBasket(listOutputs: ListOutputsFn, basket: string): Promise<{
  outputs: ListedOutput[]
  beef?: number[]
}> {
  let listed: ListOutputsResult
  try {
    listed = await listOutputs({
      basket,
      include: 'entire transactions',
      includeCustomInstructions: true,
      limit: 1000
    })
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    throw new Error(
      detail.trim()
        ? `listOutputs(${basket}) failed: ${detail}`
        : `listOutputs(${basket}) failed with no message`
    )
  }

  if (!listed || !Array.isArray(listed.outputs)) {
    const keys = listed && typeof listed === 'object' ? Object.keys(listed).join(', ') : String(listed)
    throw new Error(`listOutputs(${basket}) did not return outputs (keys: ${keys})`)
  }

  const outputs = listed.outputs.map((output) => ({ ...output }))
  const beef = bytesOf(listed.BEEF ?? listed.beef)
  const missing = outputs.filter((output) => !lockingScriptHex(output.lockingScript))
  if (missing.length > 0) {
    try {
      const withScripts = await listOutputs({
        basket,
        include: 'locking scripts',
        includeCustomInstructions: true,
        limit: 1000
      })
      const byOutpoint = new Map((withScripts.outputs ?? []).map((item) => [item.outpoint, item]))
      for (const output of outputs) {
        if (lockingScriptHex(output.lockingScript)) continue
        const extra = byOutpoint.get(output.outpoint)
        const hex = lockingScriptHex(extra?.lockingScript)
        if (hex) output.lockingScript = hex
      }
    } catch {
      // BEEF decode still runs for outputs that lack a script.
    }
  }
  return { outputs, beef }
}

export async function inspectBaskets(listOutputs: ListOutputsFn): Promise<BasketInspection> {
  const primaryListed = await listOneBasket(listOutputs, BASKET)
  const primary = inspectListedOutputs(primaryListed.outputs, primaryListed.beef, BASKET)

  let legacy = inspectListedOutputs([], undefined, LEGACY_BASKET)
  try {
    const legacyListed = await listOneBasket(listOutputs, LEGACY_BASKET)
    legacy = inspectListedOutputs(legacyListed.outputs, legacyListed.beef, LEGACY_BASKET)
  } catch {
    // Two-word basket may not exist on this wallet.
  }

  return {
    tickets: [...primary.tickets, ...legacy.tickets],
    primary: primary.slice,
    legacy: legacy.slice
  }
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
    const first = primary.unparsed[0]
    const extra = primary.unparsed.length > 1
      ? `; ${primary.unparsed[1].outpoint}: ${primary.unparsed[1].reason}`
      : ''
    parts.push(
      `${BASKET} has ${primary.listed} outputs; none parsed as Demo Night tickets` +
      (first ? ` (${first.outpoint}: ${first.reason}${extra})` : '')
    )
  }
  if (legacy.listed > 0) {
    const first = legacy.unparsed[0]
    parts.push(
      `also found ${legacy.listed} in “${LEGACY_BASKET}”` +
      (legacy.parsed === 0 && first ? ` (${first.outpoint}: ${first.reason})` : legacy.parsed > 0
        ? ` (${legacy.parsed} parsed)`
        : '')
    )
  }
  return parts.join('. ')
}

