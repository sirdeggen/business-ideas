import { formatSats, formatUsd } from './money'

/** First-paint Payer is a person, not an account slot. */
export const PAYER_NAME_PLACEHOLDER = 'Alex'

export const FIRST_PAINT = {
  payerLabel: 'Payer',
  payerPlaceholder: PAYER_NAME_PLACEHOLDER
} as const

export function isHexIdentity(value: string): boolean {
  return /^(02|03)[0-9a-fA-F]{64}$/.test(value.trim())
}

export function looksLikeShortKey(value: string): boolean {
  return /…/.test(value) && /[0-9a-fA-F]{4,}/.test(value)
}

/** Book-sheet party: a name only. Never shortKey hex. */
export function partyFaceName(name: string | undefined): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed || isHexIdentity(trimmed) || looksLikeShortKey(trimmed)) return ''
  return trimmed
}

export function lineFaceAmount(amountUsd: string | undefined): string {
  const trimmed = (amountUsd ?? '').trim()
  if (!trimmed) return ''
  const formatted = formatUsd(trimmed)
  if (!formatted || /billed/i.test(formatted)) return ''
  return formatted
}

export function lineFace(line: { label: string, amountUsd?: string, receiptHash?: string }): {
  label: string
  amount: string
} {
  return {
    label: line.label,
    amount: lineFaceAmount(line.amountUsd)
  }
}

export function moneyActionLabel(verb: 'Pay' | 'Send', usd: string | number): string {
  if (usd === '' || usd == null) return verb
  const dollars = formatUsd(usd)
  if (!dollars) return verb
  return `${verb} ${dollars}`
}

export function advancedSatsLine(sats: number | undefined): string {
  if (sats == null || !Number.isInteger(sats) || sats < 1) return ''
  return formatSats(sats)
}
