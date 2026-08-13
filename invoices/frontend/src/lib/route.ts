const INVOICE_ID = /^[0-9a-f]{32}$/i

export function invoiceHref(invoiceId: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  return `${normalized}i/${invoiceId}`
}

export function invoicePublicUrl(invoiceId: string): string {
  if (typeof window === 'undefined') return invoiceHref(invoiceId)
  return `${window.location.origin}${invoiceHref(invoiceId)}`
}

export function readInvoiceIdFromLocation(): string | null {
  if (typeof window === 'undefined') return null

  const pathMatch = window.location.pathname.match(/\/i\/([0-9a-f]{32})\/?$/i)
  if (pathMatch && INVOICE_ID.test(pathMatch[1])) return pathMatch[1].toLowerCase()

  const hashMatch = window.location.hash.match(/#\/?i\/([0-9a-f]{32})/i)
  if (hashMatch && INVOICE_ID.test(hashMatch[1])) return hashMatch[1].toLowerCase()

  const query = new URLSearchParams(window.location.search).get('i')
  if (query && INVOICE_ID.test(query)) return query.toLowerCase()

  return null
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToInvoice(invoiceId: string): void {
  window.history.pushState({ invoiceId }, '', invoiceHref(invoiceId))
}

export function goHome(): void {
  window.history.pushState({}, '', homeHref())
}
