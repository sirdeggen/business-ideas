import { MAGIC, type ReceivablePayload } from '../../../protocol/receivable'
import type { ChaseRow } from './basket'

export const CHASE_STORE_KEY = 'receivable-desk.chase'

function isChaseRow(value: unknown): value is ChaseRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<ChaseRow>
  return (
    row.magic === MAGIC &&
    typeof row.invoiceId === 'string' &&
    typeof row.txid === 'string' &&
    typeof row.outputIndex === 'number' &&
    typeof row.amountSats === 'number' &&
    typeof row.dueDate === 'string' &&
    (row.status === 'open' || row.status === 'approved' || row.status === 'paid')
  )
}

export function loadChaseRows(): ChaseRow[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(CHASE_STORE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isChaseRow).filter((row) => row.status !== 'paid')
  } catch {
    return []
  }
}

export function saveChaseRows(rows: ChaseRow[]): void {
  if (typeof window === 'undefined') return
  const unpaid = rows.filter((row) => row.status !== 'paid')
  const byKey = new Map<string, ChaseRow>()
  for (const row of unpaid) {
    byKey.set(`${row.txid}.${row.outputIndex}`, row)
  }
  window.localStorage.setItem(CHASE_STORE_KEY, JSON.stringify([...byKey.values()]))
}

export function rememberChaseRow(row: ChaseRow): ChaseRow[] {
  const next = [...loadChaseRows(), row]
  saveChaseRows(next)
  return loadChaseRows()
}

export function chaseRowFromRegister(
  item: ReceivablePayload,
  txid: string,
  outputIndex = 0
): ChaseRow {
  return { ...item, txid, outputIndex }
}
