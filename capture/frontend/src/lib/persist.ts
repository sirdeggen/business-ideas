import { emptyDesk, type DeskState } from '../../../protocol/capture'

const STORAGE_KEY = 'capture.desk'
const TX_KEY = 'capture.fundTx'

export function saveDesk(requestId: string, desk: DeskState): void {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  const all = raw ? JSON.parse(raw) as Record<string, DeskState> : {}
  all[requestId] = desk
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

export function loadDesk(requestId: string): DeskState | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  try {
    const all = JSON.parse(raw) as Record<string, DeskState>
    const desk = all[requestId]
    if (!desk?.request || desk.request.requestId !== requestId) return null
    return {
      ...emptyDesk(),
      ...desk,
      submissions: desk.submissions ?? [],
      pendingSubmissions: desk.pendingSubmissions ?? [],
      lateSubmissions: desk.lateSubmissions ?? [],
      accept: desk.accept ?? null,
      refund: desk.refund ?? null,
      pendingRefund: desk.pendingRefund ?? null,
      earlyRefund: desk.earlyRefund ?? null
    }
  } catch {
    return null
  }
}

export function clearDesk(requestId?: string): void {
  if (typeof window === 'undefined') return
  if (!requestId) {
    window.sessionStorage.removeItem(STORAGE_KEY)
    window.sessionStorage.removeItem(TX_KEY)
    return
  }
  const raw = window.sessionStorage.getItem(STORAGE_KEY)
  if (raw) {
    try {
      const all = JSON.parse(raw) as Record<string, DeskState>
      delete all[requestId]
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(all))
    } catch {
      window.sessionStorage.removeItem(STORAGE_KEY)
    }
  }
  const txRaw = window.sessionStorage.getItem(TX_KEY)
  if (!txRaw) return
  try {
    const all = JSON.parse(txRaw) as Record<string, string>
    delete all[requestId]
    window.sessionStorage.setItem(TX_KEY, JSON.stringify(all))
  } catch {
    window.sessionStorage.removeItem(TX_KEY)
  }
}

export interface StoredFund {
  txid: string
  tx: number[]
  lockingScript: string
}

export function saveFundTx(requestId: string, fund: StoredFund): void {
  if (typeof window === 'undefined') return
  const raw = window.sessionStorage.getItem(TX_KEY)
  const all = raw ? JSON.parse(raw) as Record<string, { txid: string, tx: string, lockingScript: string }> : {}
  all[requestId] = {
    txid: fund.txid,
    lockingScript: fund.lockingScript,
    tx: fund.tx.map((byte) => byte.toString(16).padStart(2, '0')).join('')
  }
  window.sessionStorage.setItem(TX_KEY, JSON.stringify(all))
}

export function loadFundTx(requestId: string): StoredFund | null {
  if (typeof window === 'undefined') return null
  const raw = window.sessionStorage.getItem(TX_KEY)
  if (!raw) return null
  try {
    const all = JSON.parse(raw) as Record<string, { txid: string, tx: string, lockingScript: string }>
    const row = all[requestId]
    if (!row?.tx || row.tx.length % 2 !== 0 || !row.lockingScript || !row.txid) return null
    const bytes: number[] = []
    for (let index = 0; index < row.tx.length; index += 2) {
      bytes.push(Number.parseInt(row.tx.slice(index, index + 2), 16))
    }
    return { txid: row.txid, tx: bytes, lockingScript: row.lockingScript }
  } catch {
    return null
  }
}
