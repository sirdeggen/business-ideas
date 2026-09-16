import { formatSats, formatUsd } from './money'

/** First-paint Payer is a person, not an account slot. */
export const PAYER_NAME_PLACEHOLDER = 'Alex'

export const FIRST_PAINT = {
  eyebrow: 'Session AP',
  deskTitle: 'Close this session.',
  payerLabel: 'Payer',
  payerPlaceholder: PAYER_NAME_PLACEHOLDER
} as const

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Bookkeepers collect many tiny spends — receipts, card swipes, small payables — and need one payable the treasurer can approve once. Rolling lines into a single session invoice closes the books without a dozen one-shot payments or a spreadsheet chase.'

export const BUSINESS_CASE_WHO =
  'Finance ops and bookkeepers who already buy expense / AP tools; grassroots treasurers who batch a trip or project’s small spends. Payers settle one total; the buyer of the product is the team that closes sessions.'

export const BUSINESS_CASE_MARKET =
  'Expensify FY2025: $142.1M revenue (+2% YoY); Expensify Card interchange $21.3M (+24%); ~650K paid members (Q4 2025). Habit signal: roll many expenses → one report / one pay. Broader “session close-out” share of AP automation GMV is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Request Finance Expenses — Web3 teams submit, approve, and mass-pay reimbursements in crypto/fiat; platform reported >$1.3B all-time payment volume by Jan 2026 (processing volume, not product ARR).'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Expensify, Ramp, and Concur — companies pay to capture many receipts and close them as one reimbursable or payable batch; corporate card statement close-out is the same habit without crypto.'

export const BUSINESS_CASE_DEMO =
  'Open a session → attach many small lines → close books → treasurer reads one invoice → approve → pay once → export lines.'

export const BUSINESS_CASE_CITATIONS = [
  { href: 'https://investor.wedbush.com/wedbush/article/bizwire-2026-2-26-expensify-announces-q4-and-full-year-fiscal-2025-results', label: 'Expensify FY2025' },
  { href: 'https://www.request.finance/post/introducing-an-expenses-app-for-crypto', label: 'Request Finance' }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

/** One title: session label, or the desk line. Never a second Session AP. */
export function sheetTitle(label?: string): string {
  const trimmed = (label ?? '').trim()
  return trimmed || FIRST_PAINT.deskTitle
}

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
