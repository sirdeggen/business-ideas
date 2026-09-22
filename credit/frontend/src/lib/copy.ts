import {
  DEFAULT_DESK_FEE_BPS,
  collateralLabel,
  type CollateralRef,
  type CreditStatus
} from '../../../protocol/credit'

export const TITLE = 'Credit Desk'
export const EYEBROW = 'Facility'
export const LEDE = 'Open a facility against an invoice or receivable. Draw. Repay. Flag default.'
export const PRODUCT = 'Credit Desk'
export const LIST_HEADING = 'Facilities'
export const EMPTY_LIST = 'No facilities yet.'
export const TERM_BUTTON = 'Term'
export const DRAW_BUTTON = 'Draw'
export const REPAY_BUTTON = 'Repay'
export const DEFAULT_BUTTON = 'Default'
export const CHECK_BUTTON = 'Check collateral'
export const TERMING_BUTTON = 'Recording…'
export const DRAWING_BUTTON = 'Drawing…'
export const REPAYING_BUTTON = 'Repaying…'
export const DEFAULTING_BUTTON = 'Flagging…'
export const TERM_JOB = 'Limit, maturity, and collateral already on the invoice or receivable desk.'
export const DRAW_JOB = 'Borrow against the open facility. The desk fee is charged on this draw.'
export const REPAY_JOB = 'Pay down what is outstanding.'
export const DEFAULT_JOB = 'Flag default when the term is breached and still unpaid.'
export const FEE_STORY = `Desk fee is ${DEFAULT_DESK_FEE_BPS} bps on each draw. Optional underwriting write fee when the facility is recorded.`
export const COLLATERAL_LINE = 'Collateral is an existing invoice, receivable, or receipt. This desk does not issue them.'
export const STRANGER_LINE = 'Anyone can read the facility. No wallet to look.'
export const FOOTER = 'Not a bank. Not a lending market. A private credit facility secured by invoices and receivables.'
export const NOT_LENDER = 'This wallet did not open the facility.'
export const STAMP_OPEN = 'Open'
export const STAMP_DRAWN = 'Drawn'
export const STAMP_REPAID = 'Repaid'
export const STAMP_DEFAULT = 'Default'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'A facility secured by invoices and receivables already on the books — term, draw, repay, and a default flag when the term is breached. Credit for seasonal cash needs, recorded against those artifacts.'

export const BUSINESS_CASE_WHO =
  'Enterprise finance teams and grassroots organizations with seasonal cash needs. The desk is paid in basis points on each draw, plus an optional underwriting write fee when the facility is recorded.'

export const BUSINESS_CASE_MARKET =
  'Maple private credit (DefiLlama, 30d retained fees on 2026-09-22): about $1.2M. Centrifuge Protocol: about $462k over the same window. About 321 English posts in 7 days on private credit. Analog context only — this desk is a BSV facility, not those rails.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Maple and Centrifuge charge ongoing fees on private credit facilities and trade-receivable pools.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: trade-receivables credit (Fasanara and similar lenders) — underwriting fees and a spread for advancing against invoices.'

export const BUSINESS_CASE_DEMO =
  'Open a facility against an existing invoice or receivable reference, draw, repay, and flag default on one URL.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://defillama.com/protocol/maple-finance',
    label: 'DefiLlama Maple'
  },
  {
    href: 'https://defillama.com/protocol/centrifuge-protocol',
    label: 'DefiLlama Centrifuge'
  }
] as const

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export const PRIMARY_COPY = [
  TITLE,
  EYEBROW,
  LEDE,
  LIST_HEADING,
  EMPTY_LIST,
  TERM_BUTTON,
  DRAW_BUTTON,
  REPAY_BUTTON,
  DEFAULT_BUTTON,
  TERM_JOB,
  DRAW_JOB,
  REPAY_JOB,
  DEFAULT_JOB,
  FEE_STORY,
  COLLATERAL_LINE,
  STRANGER_LINE,
  FOOTER
] as const

export function formatAmount(amount: number): string {
  return amount.toLocaleString('en-US')
}

export function formatWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function stampFor(status: CreditStatus): string {
  switch (status) {
    case 'drawn':
      return STAMP_DRAWN
    case 'repaid':
      return STAMP_REPAID
    case 'defaulted':
      return STAMP_DEFAULT
    default:
      return STAMP_OPEN
  }
}

export function collateralFace(ref: CollateralRef): string {
  const label = collateralLabel(ref)
  if (ref.kind === 'receivable') return `${label} ${ref.id}`
  const short = ref.id.length > 18 ? `${ref.id.slice(0, 8)}…${ref.id.slice(-6)}` : ref.id
  return `${label} ${short}`
}

export function foundLine(kind: 'invoice' | 'receipt' | 'receivable'): string {
  if (kind === 'invoice') return 'Invoice artifact on overlay.'
  if (kind === 'receipt') return 'Invoice receipt on overlay.'
  return 'Receivable artifact on overlay.'
}

export const COLLATERAL_UNSEEN = 'Reference noted. It is not in this overlay page.'
export const COLLATERAL_REFERENCE = 'Reference noted. Paste a receipt or overlay id to look the artifact up.'
