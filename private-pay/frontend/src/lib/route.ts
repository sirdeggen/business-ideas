import { isPaymentId } from '../../../protocol/private-pay'

const TXID = /^[0-9a-f]{64}$/i

export function isHintTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?p=` / `?tx=`).
 * GitHub Pages 404s path routes like `/p/:id`.
 */
export function parsePaymentLocation(
  search: string,
  hash = ''
): { paymentId: string | null, hintTxid: string | null } {
  let paymentId: string | null = null
  let hintTxid: string | null = null

  const read = (raw: string): void => {
    const searchParams = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
    const queryId = (searchParams.get('p') ?? '').trim()
    if (!paymentId && isPaymentId(queryId)) paymentId = queryId.toLowerCase()
    const queryTx = (searchParams.get('tx') ?? '').trim()
    if (!hintTxid && isHintTxid(queryTx)) hintTxid = queryTx.toLowerCase()
  }

  read(search.startsWith('?') ? search.slice(1) : search)
  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : ''
  if (hashQuery) read(hashQuery)

  return { paymentId, hintTxid }
}

export function parsePaymentLink(raw: string): { paymentId: string | null, hintTxid: string | null } {
  const trimmed = raw.trim()
  if (!trimmed) return { paymentId: null, hintTxid: null }
  if (isPaymentId(trimmed)) return { paymentId: trimmed.toLowerCase(), hintTxid: null }
  const queryIndex = trimmed.indexOf('?')
  const hashIndex = trimmed.indexOf('#')
  const search = queryIndex >= 0 ? trimmed.slice(queryIndex) : ''
  const hash = hashIndex >= 0 ? trimmed.slice(hashIndex) : ''
  return parsePaymentLocation(search, hash)
}

export function paymentHref(paymentId: string, hintTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('p', paymentId)
  if (isHintTxid(hintTxid)) params.set('tx', hintTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function paymentPublicUrl(paymentId: string, hintTxid?: string | null): string {
  if (typeof window === 'undefined') return paymentHref(paymentId, hintTxid)
  return `${window.location.origin}${paymentHref(paymentId, hintTxid)}`
}

export function readPaymentFromLocation(): { paymentId: string | null, hintTxid: string | null } {
  if (typeof window === 'undefined') return { paymentId: null, hintTxid: null }
  return parsePaymentLocation(window.location.search, window.location.hash)
}

export function goToPayment(paymentId: string, hintTxid?: string | null): void {
  window.history.replaceState({ paymentId, hintTxid }, '', paymentHref(paymentId, hintTxid))
}

export function goHome(): void {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  window.history.replaceState({}, '', normalized)
}
