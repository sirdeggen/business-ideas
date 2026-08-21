/** Keepable clerk id. Not a 64-char hash as the headline. */
export function clerkReceiptId(source: string): string {
  const compact = source.replace(/[^0-9a-f]/gi, '').slice(0, 8).toUpperCase()
  if (compact.length < 8) return 'GR-0000-0000'
  return `GR-${compact.slice(0, 4)}-${compact.slice(4, 8)}`
}

export function formatWhen(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatWhenShort(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}
