const STREAM_ID = /^[0-9a-f]{32}$/i
const TXID = /^[0-9a-f]{64}$/i

export function isCreateTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

export function parseStreamLocation(
  pathname: string,
  search: string,
  hash: string
): { streamId: string | null, createTxid: string | null } {
  let streamId: string | null = null
  let createTxid: string | null = null

  const pathMatch = pathname.match(/\/s\/([0-9a-f]{32})\/?$/i)
  if (pathMatch && STREAM_ID.test(pathMatch[1])) streamId = pathMatch[1].toLowerCase()

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = searchParams.get('s')
  if (!streamId && queryId && STREAM_ID.test(queryId)) streamId = queryId.toLowerCase()
  const queryTx = searchParams.get('tx')
  if (queryTx && TXID.test(queryTx)) createTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const [hashPath, hashQuery = ''] = hashBody.split('?')
  const hashMatch = hashPath.match(/\/?s\/([0-9a-f]{32})/i)
  if (!streamId && hashMatch && STREAM_ID.test(hashMatch[1])) {
    streamId = hashMatch[1].toLowerCase()
  }
  if (!createTxid) {
    const hashTx = new URLSearchParams(hashQuery).get('tx')
    if (hashTx && TXID.test(hashTx)) createTxid = hashTx.toLowerCase()
  }

  return { streamId, createTxid }
}

export function streamHref(streamId: string, createTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const query = `?s=${streamId.toLowerCase()}`
  if (isCreateTxid(createTxid)) return `${normalized}${query}&tx=${createTxid.toLowerCase()}`
  return `${normalized}${query}`
}

export function streamPublicUrl(streamId: string, createTxid?: string | null): string {
  if (typeof window === 'undefined') return streamHref(streamId, createTxid)
  return `${window.location.origin}${streamHref(streamId, createTxid)}`
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToStream(streamId: string, createTxid?: string | null): void {
  window.history.pushState({ streamId, createTxid }, '', streamHref(streamId, createTxid))
}

export function goHome(): void {
  window.history.pushState({}, '', homeHref())
}
