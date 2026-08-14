import { Beef, LockingScript, PushDrop, Transaction } from '@bsv/sdk'
import {
  BASKET,
  explainReceivableParse,
  isIdentityKey,
  parseReceivableFields,
  type ReceivablePayload
} from '../../../protocol/receivable'

export type ChaseRow = ReceivablePayload & { txid: string, outputIndex: number }

export interface HeldReceivable {
  outpoint: string
  satoshis: number
  item: ReceivablePayload
  customInstructions: string
  beef?: number[]
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
  held: HeldReceivable[]
  primary: BasketSlice
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
  if (bytes === 34 && hex.startsWith('21')) return `${bytes}-byte pubkey push (not an invoice)`
  if (bytes === 33) return '33-byte pubkey (not an invoice)'
  return `${bytes}-byte script`
}

export function fieldsFromScript(script: LockingScript): { fields: Array<number[] | Uint8Array>, note?: string } {
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
): { held: HeldReceivable[], slice: BasketSlice } {
  const held: HeldReceivable[] = []
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
      const item = parseReceivableFields(decoded.fields)
      if (!item) {
        const why = explainReceivableParse(decoded.fields)
        unparsed.push({
          outpoint,
          scriptBytes,
          spendable: output.spendable,
          reason: `${describeScript(resolved.hex)}: ${decoded.note ? `${why} (${decoded.note})` : why}`
        })
        continue
      }
      held.push({
        outpoint,
        satoshis: Number(output.satoshis ?? 1),
        item,
        customInstructions: output.customInstructions ?? '',
        beef: beefForOutpoint(bytesOf(output.BEEF ?? output.beef) ?? listedBeef, outpoint)
      })
    } catch (error) {
      const detail = error instanceof Error && error.message.trim()
        ? error.message
        : 'lockingScript is not a PushDrop invoice'
      unparsed.push({
        outpoint,
        scriptBytes,
        spendable: output.spendable,
        reason: `${describeScript(resolved.hex)}: ${detail}`
      })
    }
  }

  return {
    held,
    slice: {
      basket,
      listed: outputs.length,
      totalOutputs: outputs.length,
      spendable: outputs.filter((item) => item.spendable !== false).length,
      parsed: held.length,
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
  if (primaryListed.error && primary.held.length === 0 && primary.slice.listed === 0) {
    primary.slice.unparsed.push({ outpoint: '(listOutputs)', reason: primaryListed.error })
  }

  return {
    held: primary.held,
    primary: primary.slice
  }
}

function formatUnparsed(item: UnparsedOutput): string {
  const spendable = item.spendable === false ? 'unspendable' : item.spendable === true ? 'spendable' : undefined
  const size = item.scriptBytes != null ? `${item.scriptBytes}B` : undefined
  const prefix = [spendable, size].filter(Boolean).join(' ')
  return prefix ? `${item.outpoint} ${prefix}: ${item.reason}` : `${item.outpoint}: ${item.reason}`
}

export function formatBasketDiagnostic(inspection: BasketInspection): string {
  const { primary, held } = inspection
  if (held.length > 0) return ''

  if (primary.listed > 0) {
    const shown = primary.unparsed.slice(0, 2)
    const detail = shown.map(formatUnparsed).join('; ')
    return (
      `listed ${primary.listed}, none parsed as invoices` +
      (primary.spendable ? ` (${primary.spendable} spendable)` : '') +
      (detail ? ` (${detail})` : '')
    )
  }
  if (primary.totalOutputs > 0) {
    return `listOutputs(${BASKET}) reported totalOutputs=${primary.totalOutputs} but returned 0 output rows`
  }
  if (primary.unparsed[0]) return primary.unparsed[0].reason
  return ''
}

export function heldToOverlayRow(held: HeldReceivable): ChaseRow {
  const parsed = splitOutpoint(held.outpoint)
  return {
    ...held.item,
    txid: parsed?.txid ?? held.outpoint,
    outputIndex: parsed?.vout ?? 0
  }
}

export function chaseOutpointKey(row: Pick<ChaseRow, 'txid' | 'outputIndex'>): string {
  return `${row.txid}.${row.outputIndex}`
}

export function chaseIdentityKey(row: Pick<ChaseRow, 'invoiceId' | 'creditor' | 'debtor' | 'amountSats' | 'dueDate'>): string {
  return [row.invoiceId, row.creditor, row.debtor, String(row.amountSats), row.dueDate].join('\0')
}

function preferParty(primary: string, other: string): string {
  if (isIdentityKey(primary) && other.trim() && !isIdentityKey(other)) return other
  return primary
}

function preferAmount(primary: number, other: number): number {
  if (primary <= 1 && other > 1) return other
  return primary
}

export function mergeChaseRow(primary: ChaseRow, other: ChaseRow): ChaseRow {
  return {
    ...primary,
    creditor: preferParty(primary.creditor, other.creditor),
    debtor: preferParty(primary.debtor, other.debtor),
    amountSats: preferAmount(primary.amountSats, other.amountSats),
    memo: primary.memo || other.memo
  }
}

function findChaseIndex(rows: ChaseRow[], row: ChaseRow): number {
  const outpoint = chaseOutpointKey(row)
  const identity = chaseIdentityKey(row)
  return rows.findIndex((existing) => (
    chaseOutpointKey(existing) === outpoint
    || chaseIdentityKey(existing) === identity
    || existing.invoiceId === row.invoiceId
  ))
}

export function unionChaseRows(
  overlayRows: ChaseRow[],
  held: HeldReceivable[],
  remembered: ChaseRow[] = []
): ChaseRow[] {
  const rows: ChaseRow[] = []
  const add = (row: ChaseRow): void => {
    if (row.status === 'paid') return
    const index = findChaseIndex(rows, row)
    if (index >= 0) {
      rows[index] = mergeChaseRow(rows[index], row)
      return
    }
    rows.push(row)
  }
  for (const row of overlayRows) add(row)
  for (const item of held) add(heldToOverlayRow(item))
  for (const row of remembered) add(row)
  return rows
}
