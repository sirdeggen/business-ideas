import { inspectHeldRecords } from './actions'
import { CHROME_ALLOW_HINT, isListOutputsFailure, isWalletMissingMessage } from './config'
import {
  formatLookupDiagnostic,
  inspectLookupRecords,
  usesPublicAnytx,
  type OverlayRecord,
  type RecordQuery
} from './overlay'

export interface RecordLoadResult {
  rows: OverlayRecord[]
  held: OverlayRecord[]
  error: string | null
  hint: string | null
}

export interface RecordLoadDeps {
  inspectLookup?: (base: string, query?: RecordQuery) => Promise<{
    rows: OverlayRecord[]
    listed: number
    parsed: number
    unparsed: Array<{ reason: string }>
  }>
  inspectHeld?: (wallet: object) => Promise<{ held: OverlayRecord[] }>
}

function overlayReadError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  const text = String(err ?? '').trim()
  return text || 'Overlay lookup failed'
}

function listReadError(notes: string[]): string | null {
  const kept = notes.filter((note) => {
    if (!note.trim()) return false
    if (note === CHROME_ALLOW_HINT) return false
    if (isWalletMissingMessage(note)) return false
    if (isListOutputsFailure(note)) return false
    return true
  })
  return kept[0] ?? null
}

export function recordOutpointKey(row: Pick<OverlayRecord, 'txid' | 'outputIndex'>): string {
  return `${row.txid}.${row.outputIndex}`
}

export function unionRecordRows(
  overlayRows: OverlayRecord[],
  held: OverlayRecord[] = [],
  remembered: OverlayRecord[] = []
): OverlayRecord[] {
  const rows: OverlayRecord[] = []
  const seen = new Set<string>()
  const add = (row: OverlayRecord): void => {
    const key = row.txid ? recordOutpointKey(row) : row.hash
    if (!key || seen.has(key)) return
    seen.add(key)
    rows.push(row)
  }
  // Overlay first — never hide those rows behind basket / remembered.
  for (const row of overlayRows) add(row)
  for (const row of held) add(row)
  for (const row of remembered) add(row)
  return rows
}

/**
 * Overlay-first Buy-a-dump read. Wallet basket inspect is optional enrichment
 * and runs only when a wallet is actually connected.
 */
export async function loadRecordsList(
  overlayUrl: string,
  wallet: object | null | undefined,
  remembered: OverlayRecord[] = [],
  deps: RecordLoadDeps = {}
): Promise<RecordLoadResult> {
  const inspectLookup = deps.inspectLookup ?? inspectLookupRecords
  const inspectHeld = deps.inspectHeld ?? inspectHeldRecords
  const notes: string[] = []
  let overlayRows: OverlayRecord[] = []
  let hint: string | null = null

  try {
    const lookup = await inspectLookup(overlayUrl)
    hint = formatLookupDiagnostic(lookup, usesPublicAnytx(overlayUrl)) || null
    overlayRows = lookup.rows
  } catch (err) {
    console.error('Record lookup failed', err)
    notes.push(overlayReadError(err))
  }

  let held: OverlayRecord[] = []
  if (wallet) {
    try {
      const inspection = await inspectHeld(wallet)
      held = inspection.held
    } catch (err) {
      console.error('Record basket list failed', err)
      held = []
    }
  }

  const rows = unionRecordRows(overlayRows, held, remembered)
  return { rows, held, error: listReadError(notes), hint }
}
