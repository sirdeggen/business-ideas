import { MAGIC, type RecordPayload } from '../../../protocol/record'
import type { OverlayRecord } from './overlay'

export const RECORD_STORE_KEY = 'record-desk.listed'

function isListedRow(value: unknown): value is OverlayRecord {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<OverlayRecord>
  return (
    row.magic === MAGIC &&
    typeof row.hash === 'string' &&
    typeof row.name === 'string' &&
    typeof row.kind === 'string' &&
    typeof row.time === 'string' &&
    typeof row.txid === 'string' &&
    typeof row.outputIndex === 'number'
  )
}

export function loadListedRows(): OverlayRecord[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECORD_STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isListedRow)
  } catch {
    return []
  }
}

export function saveListedRows(rows: OverlayRecord[]): void {
  if (typeof window === 'undefined') return
  const byKey = new Map<string, OverlayRecord>()
  for (const row of rows) {
    byKey.set(`${row.txid}.${row.outputIndex}`, row)
  }
  window.localStorage.setItem(RECORD_STORE_KEY, JSON.stringify([...byKey.values()]))
}

export function rememberListedRow(row: OverlayRecord): OverlayRecord[] {
  const next = [...loadListedRows(), row]
  saveListedRows(next)
  return loadListedRows()
}

export function listedRowFromPost(
  item: RecordPayload,
  txid: string,
  outputIndex = 0
): OverlayRecord {
  return { ...item, txid, outputIndex }
}
