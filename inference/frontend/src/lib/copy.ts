export const TITLE = 'Inference Desk'
export const EYEBROW = 'Desk'
export const LEDE = 'Pay per call. Get a hash-attested usage receipt.'
export const LIST_HEADING = 'Models'
export const EMPTY_LIST = 'No models yet.'
export const RUN_BUTTON = 'Run'
export const RUNNING_BUTTON = 'Running…'
export const VERIFY_BUTTON = 'Verify'
export const PAY_BUTTON = 'Pay per call'
export const PAYING_BUTTON = 'Paying…'
export const PACK_BUTTON = 'Buy pack'
export const PACKING_BUTTON = 'Buying…'
export const USE_BUTTON = 'Use pack'
export const USING_BUTTON = 'Using…'
export const POST_HEADING = 'List a model'
export const POST_JOB = 'A label, a model, and a price per call.'
export const POST_BUTTON = 'List model'
export const LISTING_BUTTON = 'Listing…'
export const TRY_HEADING = 'Try a call'
export const TRY_JOB = 'A prompt in the browser. The meter uses the same math as a paid pack.'
export const RECEIPT_HEADING = 'Usage receipt'
export const VERIFIED_LINE = 'Verified'
export const PAID_LINE = 'Paid'
export const PREVIEW_LINE = 'Preview'
export const METER_HEADING = 'Meter'
export const LISTED_STATUS = 'Listed.'
export const PAID_STATUS = 'Receipt published.'
export const PACK_STATUS = 'Pack purchased.'
export const STRANGER_LINE = 'Anyone can browse models and verify a receipt. No wallet until you pay.'
export const FOOTER = 'Not a signed reading. Not a file listing.'
export const AMOUNTS_LINE = 'Amounts are in sats.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Teams burn money on AI API calls and want to pay only for what they use — with a receipt that ties spend to an attested response, not a monthly mystery bill.'

export const BUSINESS_CASE_WHO =
  'Product teams, agent builders, and grassroots apps that meter AI usage; providers who want micropayments instead of invoice net-30.'

export const BUSINESS_CASE_MARKET =
  'Venice shows ~$825k/30d on-chain VVV buy-and-burn alone; DefiLlama notes subscription/API/credit revenue settles off-chain and is excluded (so real AI take is larger). Aethir GPU compute ~$915k/30d protocol revenue. X posts on AI inference / marketplace fees ~649/7d.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Venice AI subscriptions driving on-chain burns; Aethir developer GPU service fees.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: OpenAI / Anthropic / OpenRouter API credit packs and metered inference billing.'

export const BUSINESS_CASE_DEMO =
  'Pay for one inference (or a small credit pack), get an attested response hash + usage receipt, and see the meter decrement.'

export const BUSINESS_CASE_CITATIONS = [
  { href: 'https://venice.ai/', label: 'Venice' },
  { href: 'https://defillama.com/', label: 'DefiLlama' },
  { href: 'https://aethir.com/', label: 'Aethir' }
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
  RUN_BUTTON,
  VERIFY_BUTTON,
  PAY_BUTTON,
  PACK_BUTTON,
  USE_BUTTON,
  POST_HEADING,
  POST_JOB,
  POST_BUTTON,
  TRY_HEADING,
  TRY_JOB,
  RECEIPT_HEADING,
  VERIFIED_LINE,
  PAID_LINE,
  PREVIEW_LINE,
  METER_HEADING,
  STRANGER_LINE,
  FOOTER
] as const

export function formatPrice(amount: number): string {
  return amount.toLocaleString('en-US')
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

export function receiptFace(input: { responseHash: string, remaining: number, paid: boolean }): string {
  return `${input.responseHash}\n${formatPrice(input.remaining)}\n${input.paid ? PAID_LINE : PREVIEW_LINE}`
}
