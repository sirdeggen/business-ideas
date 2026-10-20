export const TITLE = 'Capture Desk'
export const EYEBROW = 'Capture'
export const LEDE = 'Post a capture of one place. Lock the reward first. Accept a preview, or take the reward back after the deadline.'
export const PRODUCT = 'Capture Desk'
export const FUND_BUTTON = 'Fund'
export const SUBMIT_BUTTON = 'Submit'
export const ACCEPT_BUTTON = 'Accept'
export const REFUND_BUTTON = 'Refund'
export const FUNDING_BUTTON = 'Funding…'
export const SUBMITTING_BUTTON = 'Submitting…'
export const ACCEPTING_BUTTON = 'Accepting…'
export const REFUNDING_BUTTON = 'Refunding…'
export const REFRESH_BUTTON = 'Refresh the board'
export const DRAFT_JOB = 'Name the place, the brief, the reward, and the deadline. Drafting stays in this browser.'
export const FUND_JOB = 'Fund locks the reward before anyone films.'
export const SUBMIT_JOB = 'Hash the file here. The raw file stays on this device. Send a watermarked preview over Message Box.'
export const ACCEPT_JOB = 'Accept spends the locked reward once. The contributor, the desk fee, and the processing fee are paid together.'
export const REFUND_JOB = 'After the deadline, with no acceptance, refund returns the full reward. It stays pending until a block header times the spend.'
export const HASH_NOTE = 'Raw footage never goes on chain. It stays with the contributor until you accept. Only the hash and the receipt go on chain. The watermarked preview goes privately over Message Box.'
export const SCRIPT_NOTE = 'The script enforces one thing: the reward is locked to the requester\'s key. Readers check the contributor payment, the desk fee, and the processing fee. The script does not. OP_PUSH_TX is v1. The script does not read the deadline.'
export const DESK_NOTE = 'A refund counts only when a block header times the spend after the deadline. A capture counts only when a block header times it at or before the deadline. With no header time, those states stay pending. A host-asserted time is not that clock. v0 does not put the deadline in the locking script.'
export const HOST_ASSERTED_LABEL = 'host-asserted'
export const PENDING_CAPTURE = 'Pending. No block header times this capture yet, so it cannot be accepted.'
export const LATE_CAPTURE = 'This capture\'s block header is after the deadline.'
export const FEE_HELPER = 'The desk fee is 10% of the reward, rounded down. The processing fee is a fixed number of sats. Both go to the desk. The contributor receives the rest.'
export const LOCAL_NOTE = 'Fund broadcasts the locked reward. Accept or refund is a later spend of that same output. Both are submitted to the public book. The raw file is not in either transaction.'
export const STRANGER_LINE = 'Anyone with this link can read the request. No wallet to look.'
export const FOOTER = 'An open call for a photo or a video of one place.'
export const BOARD_EMPTY = 'No capture requests on this desk yet.'
export const BOARD_HEADING = 'Board'
export const BOARD_NOTE = 'Open, accepted, and refunded counts, the accept rate, and the median time to accept come from this desk’s records.'
export const LOCATION_LABEL = 'Place'
export const BRIEF_LABEL = 'Brief'
export const REWARD_LABEL = 'Reward (sats)'
export const PROCESSING_LABEL = 'Processing fee (sats)'
export const DEADLINE_LABEL = 'Deadline'
export const FILE_LABEL = 'Capture file'
export const GEOHASH_LABEL = 'Coarse location (geohash)'
export const PREVIEW_LABEL = 'Watermarked preview'
export const LINE_REWARD = 'Reward'
export const LINE_DESK = 'Desk fee'
export const LINE_PROCESSING = 'Processing fee'
export const LINE_CONTRIBUTOR = 'Contributor'
export const AGENT_402_TITLE = 'Agent payment'
export const AGENT_402_NOTE = 'Example only. v0 has no payment endpoint. An agent would post a funded request like this.'
export const AGENT_402_CURL = `curl -X POST https://example.invalid/capture/requests \\
  -H 'Content-Type: application/json' \\
  -H 'X-Payment: <402 payment>' \\
  -d '{"location":"12 Market Street","brief":"Film the storefront awning","rewardSats":100000,"deadline":"2026-10-21T18:00:00Z"}'`

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Insurers, property managers, retailers and robotics teams often need fresh photos or video of one specific place, quickly, without sending staff. A requester posts the job with the reward set aside up front, checks a watermarked preview before paying, and gets the money back if nobody delivers by the deadline.'

export const BUSINESS_CASE_WHO =
  'Requesters such as insurers, property managers, retailers, robotics teams and AI agents that pay per request. Local contributors earn the reward. The desk keeps about 10% on accepted captures plus a small processing fee.'

export const BUSINESS_CASE_MARKET =
  'Vangrid\'s public bounty board (self-reported, read Oct 2026): ~$620k in accepted bounties, a 97% accept rate and a ~6h median time to accept, with $385k accepted in September. It charges 10% plus ~$5 processing. Total market size for on-demand field capture is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Vangrid. Companies and AI agents fund capture bounties up front and pay a 10% fee on accept.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: shelf-audit and mystery-shopper gig apps already pay crowds per photo task.'

export const BUSINESS_CASE_PROOF = `${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`

export const BUSINESS_CASE_DEMO =
  'Post a funded request, receive a signed capture with a watermarked preview, accept it, and see one payment split between the contributor, the desk fee and the processing fee, or get a full refund after the deadline. Raw footage stays off-chain.'

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'Who pays',
  'Market signal',
  'Proof people pay',
  'Demo goal'
] as const

export const SCENE_ALT = 'A person filming a glass storefront with a phone, with a small receipt card in the foreground.'

export const PRIMARY_COPY = [
  TITLE,
  EYEBROW,
  LEDE,
  DRAFT_JOB,
  FUND_JOB,
  SUBMIT_JOB,
  ACCEPT_JOB,
  REFUND_JOB,
  STRANGER_LINE,
  FOOTER,
  HASH_NOTE,
  SCRIPT_NOTE,
  DESK_NOTE,
  AGENT_402_NOTE
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
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function formatRate(rate: number | null): string {
  if (rate == null) return '—'
  return `${rate}%`
}

export function formatMedian(ms: number | null): string {
  if (ms == null) return '—'
  const abs = Math.abs(ms)
  if (abs < 60_000) return `${Math.round(abs / 1000)}s`
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m`
  const hours = abs / 3_600_000
  const text = hours >= 10 ? `${Math.round(hours)}h` : `${Math.round(hours * 10) / 10}h`
  return ms < 0 ? `-${text}` : text
}

export function deadlineLocalValue(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function deadlineFromLocal(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
