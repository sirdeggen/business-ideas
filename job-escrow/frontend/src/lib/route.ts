import { isJobId } from '../../../protocol/jobescrow'

const TXID = /^[0-9a-f]{64}$/i

export function isFundTxid(value: string | null | undefined): value is string {
  return typeof value === 'string' && TXID.test(value)
}

/**
 * Deep links are query params only (`?j=` / `?tx=`).
 * GitHub Pages 404s path routes like `/j/:id`.
 */
export function parseJobLocation(
  search: string,
  hash = ''
): { jobId: string | null, fundTxid: string | null } {
  let jobId: string | null = null
  let fundTxid: string | null = null

  const searchParams = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const queryId = (searchParams.get('j') ?? '').trim()
  if (isJobId(queryId)) jobId = queryId.toLowerCase()
  const queryTx = (searchParams.get('tx') ?? '').trim()
  if (isFundTxid(queryTx)) fundTxid = queryTx.toLowerCase()

  const hashBody = hash.startsWith('#') ? hash.slice(1) : hash
  const hashQuery = hashBody.includes('?') ? hashBody.slice(hashBody.indexOf('?') + 1) : hashBody.replace(/^#/, '')
  const hashParams = new URLSearchParams(hashQuery)
  const hashId = (hashParams.get('j') ?? '').trim()
  if (!jobId && isJobId(hashId)) jobId = hashId.toLowerCase()
  const hashTx = (hashParams.get('tx') ?? '').trim()
  if (!fundTxid && isFundTxid(hashTx)) fundTxid = hashTx.toLowerCase()

  return { jobId, fundTxid }
}

export function jobHref(jobId: string, fundTxid?: string | null): string {
  const base = import.meta.env.BASE_URL || '/'
  const normalized = base.endsWith('/') ? base : `${base}/`
  const params = new URLSearchParams()
  params.set('j', jobId)
  if (isFundTxid(fundTxid)) params.set('tx', fundTxid.toLowerCase())
  return `${normalized}?${params.toString()}`
}

export function jobPublicUrl(jobId: string, fundTxid?: string | null): string {
  if (typeof window === 'undefined') return jobHref(jobId, fundTxid)
  return `${window.location.origin}${jobHref(jobId, fundTxid)}`
}

export function readJobFromLocation(): { jobId: string | null, fundTxid: string | null } {
  if (typeof window === 'undefined') return { jobId: null, fundTxid: null }
  return parseJobLocation(window.location.search, window.location.hash)
}

export function homeHref(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}

export function goToJob(jobId: string, fundTxid?: string | null): void {
  window.history.replaceState({ jobId, fundTxid }, '', jobHref(jobId, fundTxid))
}

export function goHome(): void {
  window.history.replaceState({}, '', homeHref())
}
