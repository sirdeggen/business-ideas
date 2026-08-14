const INVOICE_ID = /^[0-9a-f]{32}$/i
const TXID = /^[0-9a-f]{64}$/i

export function isCreateTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

export function parseInvoiceLocation(
  pathname: string,
  search: string,
  hash: string
): { invoiceId: string | null, createTxid: string | null } {
  let invoiceId: string | null = null
  let createTxid: string | null = null

  const pathMatch = pathname.match(/\/i\/([0-9a-f]{32})\/?$/i)
  if (pathMatch && INVOICE_ID.test(pathMatch[1])) invoiceId = pathMatch[1].toLowerCase()

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = searchParams.get('i')
  if (!invoiceId && queryId && INVOICE_ID.test(queryId)) invoiceId = queryId.toLowerCase()
  const queryTx = searchParams.get('tx')
  if (queryTx && TXID.test(queryTx)) createTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const [hashPath, hashQuery = ''] = hashBody.split('?')
  const hashMatch = hashPath.match(/\/?i\/([0-9a-f]{32})/i)
  if (!invoiceId && hashMatch && INVOICE_ID.test(hashMatch[1])) {
    invoiceId = hashMatch[1].toLowerCase()
  }
  if (!createTxid) {
    const hashTx = new URLSearchParams(hashQuery).get('tx')
    if (hashTx && TXID.test(hashTx)) createTxid = hashTx.toLowerCase()
  }

  return { invoiceId, createTxid }
}

export function invoiceHref(invoiceId: string, createTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const path = `${normalized}i/${invoiceId}`
  if (isCreateTxid(createTxid)) return `${path}?tx=${createTxid.toLowerCase()}`
  return path
}

export function invoicePublicUrl(invoiceId: string, createTxid?: string | null): string {
  if (typeof window === 'undefined') return invoiceHref(invoiceId, createTxid)
  return `${window.location.origin}${invoiceHref(invoiceId, createTxid)}`
}

export function readInvoiceIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return parseInvoiceLocation(
    window.location.pathname,
    window.location.search,
    window.location.hash
  ).invoiceId
}

export function readCreateTxidFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  return parseInvoiceLocation(
    window.location.pathname,
    window.location.search,
    window.location.hash
  ).createTxid
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToInvoice(invoiceId: string, createTxid?: string | null): void {
  window.history.pushState({ invoiceId, createTxid }, '', invoiceHref(invoiceId, createTxid))
}

export function goHome(): void {
  window.history.pushState({}, '', homeHref())
}
