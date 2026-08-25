export function sessionIdFromUrl(search = typeof window === 'undefined' ? '' : window.location.search): string {
  return (new URLSearchParams(search).get('session') ?? '').trim()
}

export function sessionShareUrl(sessionId: string): string {
  if (typeof window === 'undefined') return `?session=${sessionId}`
  const url = new URL(window.location.href)
  url.search = `?session=${sessionId}`
  return url.toString()
}

export function goToSession(sessionId: string): void {
  const url = sessionShareUrl(sessionId)
  window.history.replaceState({}, '', url)
}

export function goHome(): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.search = ''
  window.history.replaceState({}, '', url.toString())
}
