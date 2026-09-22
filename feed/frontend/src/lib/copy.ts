import type { MetricType } from '../../../protocol/feed'

export const TITLE = 'Feed Desk'
export const EYEBROW = 'Desk'
export const LEDE = 'Sell a feed. Buy a fresh signed reading.'
export const LIST_HEADING = 'Feeds'
export const EMPTY_LIST = 'No feeds yet.'
export const QUERY_BUTTON = 'Query'
export const SUBSCRIBE_BUTTON = 'Subscribe'
export const QUERYING_BUTTON = 'Querying…'
export const SUBSCRIBING_BUTTON = 'Subscribing…'
export const POST_HEADING = 'Publish a feed'
export const POST_JOB = 'A label, a metric, a fresh reading, and a price.'
export const POST_BUTTON = 'Publish'
export const PUBLISHING_BUTTON = 'Publishing…'
export const UPDATE_HEADING = 'Post a fresh reading'
export const UPDATE_JOB = 'Replace the current reading on a feed you publish.'
export const UPDATE_BUTTON = 'Post reading'
export const POSTING_BUTTON = 'Posting…'
export const RECEIPT_HEADING = 'Receipt'
export const PAID_LINE = 'Paid'
export const INCLUDED_LINE = 'Included'
export const PAID_WAIT = 'Paid. The publisher sends the reading.'
export const SUB_WAIT = 'Subscribed. The publisher sends the reading.'
export const PUBLISHED_STATUS = 'Published.'
export const UPDATED_STATUS = 'Reading posted.'
export const STRANGER_LINE = 'Anyone can read the feed list. No wallet until you publish, query, or subscribe.'
export const FOOTER = 'Not a registration receipt. Not a dump export.'
export const AMOUNTS_LINE = 'Amounts are in sats.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Apps and finance teams need a fresh attested number — a price, an index, or a business metric — metered by request. A publisher sells the feed. A buyer pays per query or opens a short subscription and receives a signed reading. This is not a provenance registration and not a paid dump of an old note.'

export const BUSINESS_CASE_WHO =
  'Buyers: apps and finance teams that need a fresh attested reading. Publishers: desks that sell prices, indexes, and custom business metrics. Buyers pay per query or for a short subscription. Publishers are paid on each query and when a subscription opens.'

export const BUSINESS_CASE_MARKET =
  'Pyth Pro (DefiLlama, research anchor 2026-09-22): about $434k in 30d fees. Community posts claim about $10.4M combined ARR for Pro and Indices as of early September — project-reported, separate from that fee figure.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Pyth Pro — paid market-data and index subscriptions, with the DefiLlama research anchor about $434k in 30d fees.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: exchange and terminal market-data subscriptions — finance teams already pay for fresh prices and indexes rather than a one-time file.'

export const BUSINESS_CASE_DEMO =
  'Publish a feed. A guest reads the list with no wallet. Pay per query or subscribe. The receipt names the reading.'

export const BUSINESS_CASE_CITATIONS = [
  {
    href: 'https://defillama.com/protocol/pyth-pro',
    label: 'DefiLlama Pyth Pro'
  },
  {
    href: 'https://www.pyth.network/',
    label: 'Pyth'
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
  QUERY_BUTTON,
  SUBSCRIBE_BUTTON,
  POST_HEADING,
  POST_JOB,
  POST_BUTTON,
  UPDATE_HEADING,
  UPDATE_JOB,
  UPDATE_BUTTON,
  RECEIPT_HEADING,
  PAID_LINE,
  INCLUDED_LINE,
  PAID_WAIT,
  STRANGER_LINE,
  FOOTER
] as const

export function metricLabel(type: MetricType): string {
  if (type === 'price') return 'Price'
  if (type === 'index') return 'Index'
  return 'Business metric'
}

export function formatPrice(amount: number): string {
  return amount.toLocaleString('en-US')
}

export function valueLine(value: string, unit: string): string {
  const unitText = unit.trim()
  return unitText ? `${value} ${unitText}` : value
}

export function receiptFace(input: {
  label: string
  value: string
  unit: string
  covered: boolean
}): string {
  return `${input.label}\n${valueLine(input.value, input.unit)}\n${input.covered ? INCLUDED_LINE : PAID_LINE}`
}

export function formatWhen(value: string): string {
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
