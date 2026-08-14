import { sampleReceivables } from '../../../protocol/samples'
import { inspectHeldReceivables } from './actions'
import {
  unionChaseRows,
  type BasketInspection,
  type HeldReceivable
} from './basket'
import { CHROME_ALLOW_HINT, isListOutputsFailure, isWalletMissingMessage } from './config'
import {
  formatLookupDiagnostic,
  inspectLookupReceivables,
  usesPublicAnytx,
  type OverlayReceivable,
  type ReceivableQuery
} from './overlay'

export interface ChaseLoadResult {
  rows: OverlayReceivable[]
  held: HeldReceivable[]
  preview: boolean
  error: string | null
}

export interface ChaseLoadDeps {
  inspectLookup?: (base: string, query?: ReceivableQuery) => Promise<{
    rows: OverlayReceivable[]
    listed: number
    parsed: number
    unparsed: Array<{ reason: string }>
  }>
  inspectHeld?: (wallet: object) => Promise<BasketInspection>
}

function previewRows(): OverlayReceivable[] {
  return sampleReceivables()
    .filter((item) => item.status !== 'paid')
    .map((item, outputIndex) => ({ ...item, txid: 'sample', outputIndex }))
}

function overlayReadError(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message
  const text = String(err ?? '').trim()
  return text || 'Overlay lookup failed'
}

function chaseReadError(notes: string[]): string | null {
  const kept = notes.filter((note) => {
    if (!note.trim()) return false
    if (note === CHROME_ALLOW_HINT) return false
    if (isWalletMissingMessage(note)) return false
    if (isListOutputsFailure(note)) return false
    return true
  })
  return kept[0] ?? null
}

/**
 * Overlay-first Chase read. Wallet basket inspect is optional enrichment
 * (Mark paid / held outputs) and runs only when a wallet is actually connected.
 */
export async function loadChaseList(
  overlayUrl: string,
  wallet: object | null | undefined,
  remembered: OverlayReceivable[] = [],
  deps: ChaseLoadDeps = {}
): Promise<ChaseLoadResult> {
  const inspectLookup = deps.inspectLookup ?? inspectLookupReceivables
  const inspectHeld = deps.inspectHeld ?? inspectHeldReceivables
  const notes: string[] = []
  let overlayRows: OverlayReceivable[] = []
  let overlayFailed = false

  try {
    const lookup = await inspectLookup(overlayUrl, { status: 'unpaid' })
    const lookupNote = formatLookupDiagnostic(lookup, usesPublicAnytx(overlayUrl))
    if (lookupNote) notes.push(lookupNote)
    overlayRows = lookup.rows
  } catch (err) {
    console.error('Desk lookup failed', err)
    overlayFailed = true
    notes.push(overlayReadError(err))
  }

  let held: HeldReceivable[] = []
  if (wallet) {
    try {
      const inspection = await inspectHeld(wallet)
      held = inspection.held
    } catch (err) {
      console.error('Desk basket list failed', err)
      held = []
    }
  }

  const combined = unionChaseRows(overlayRows, held, remembered)
  const error = chaseReadError(notes)

  if (combined.length > 0) {
    return { rows: combined, held, preview: false, error }
  }

  if (overlayFailed && usesPublicAnytx(overlayUrl)) {
    return { rows: remembered, held, preview: false, error }
  }

  if (overlayFailed && !usesPublicAnytx(overlayUrl)) {
    return { rows: previewRows(), held, preview: true, error }
  }

  return { rows: combined, held, preview: false, error }
}
