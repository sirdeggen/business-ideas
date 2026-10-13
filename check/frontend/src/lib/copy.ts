export const TITLE = 'Check Desk'
export const EYEBROW = 'Check'
export const LEDE = 'Enterprise AP teams subscribe to screen a vendor file before a batch payment. One payee is a small fee.'
export const PRODUCT = 'Check Desk'
export const CHECK_BUTTON = 'Check this payee'
export const BATCH_BUTTON = 'Check the vendor file'
export const CANCEL_BUTTON = 'Cancel the payment'
export const RECORD_RECEIPT_BUTTON = 'Record the receipt'
export const RECORD_FLAG_BUTTON = 'Record the flag'
export const FILE_BUTTON = 'Add the flag locally'
export const RECORDING_BUTTON = 'Recording…'
export const REFRESH_BUTTON = 'Refresh the book'
export const CHECK_JOB = 'Paste the payee and the amount. The payer’s prior payees are already listed. No wallet yet.'
export const BATCH_JOB = 'Paste or upload a vendor file. Each row gets its own verdict. The subscription is a quote only.'
export const FLAG_JOB = 'A reporter files a flag on a key, paymail, or script. The stake stays a local simulation until you record it.'
export const RECORD_JOB = 'The check is done here. A wallet only records a flag, a receipt, or the check fee.'
export const RECEIPT_NOTE = 'v0 is a shared risk lookup plus receipts. It does not move or hold the payment.'
export const LOCAL_NOTE = 'v0 is a shared risk lookup plus receipts. It does not move or hold the payment, and it does not promise that a payee is safe. Reporter stakes and slashing are a local simulation unless they are actually recorded. Seed flags are demo data.'
export const COVER_NOTE = 'Coverage is not part of this desk.'
export const COVER_LINK_LABEL = 'Cover Desk'
export const COVER_HREF = 'https://sirdeggen.github.io/business-ideas/cover/'
export const BATCH_QUOTE = 'Enterprise batch subscription quote: 50,000 sats a month. Quote only. This page does not charge it.'
export const FEE_HELPER = 'The check fee is a flat amount in sats, default 10. The reporter share is a percent of that fee, default 50, and it is floored. It is credited only when you cancel after a flag.'
export const DEMO_NOTE = 'Seed flags are demo data. The names are fictional.'
export const STRANGER_LINE = 'Anyone can run a check, screen a file, or read the flags. No wallet to look.'
export const FOOTER = 'Not a payee bound inside one closing. Not who runs an agent. Not a general staked attestation. Not an insurance payout. Not an internal spend rule. A shared lookup before any payment.'
export const BOOK_EMPTY = 'No check receipts on the public book yet.'
export const BOOK_HEADING = 'Public book'
export const FLAGS_HEADING = 'Flags'
export const PAYEE_LABEL = 'Proposed payee'
export const AMOUNT_LABEL = 'Amount (sats)'
export const REF_LABEL = 'Payer ref'
export const PRIORS_LABEL = 'Prior payees'
export const FEE_LABEL = 'Check fee (sats)'
export const SHARE_LABEL = 'Reporter share (percent)'
export const THRESHOLD_LABEL = 'First-time threshold (sats)'
export const CSV_LABEL = 'Vendor file'
export const LINE_FEE = 'Check fee'
export const LINE_SHARE = 'Reporter share'
export const STAMP_PASS = 'Pass'
export const STAMP_WARN = 'Warn'
export const STAMP_BLOCK = 'Block'
export const DEMO_BADGE = 'Demo data'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Money sent to the wrong payee rarely comes back: a swapped vendor bank detail, a lookalike address copied from history, or a first-time payee that turns out to be a scammer. Payers need a quick check before they sign, plus a receipt that shows the check happened.'

export const BUSINESS_CASE_WHO =
  'Enterprise AP teams that screen vendor bank changes and batch payments, and wallets that want a warning before a send; grassroots treasurers and older users who want a warning before money leaves. Payers pay a small fee per check; enterprises subscribe for batch screening; reporters whose flag stops a payment earn a share.'

export const BUSINESS_CASE_MARKET =
  'Pocket Universe / Kerberus (DefiLlama, Oct 2026): ~$31k / 30d, ~$361k over a year; claims 200k+ users and 3M+ transactions analyzed a week. Drainer and address-poisoning talk on X ~3.4k posts a week. AP payee-verification market size is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Pocket Universe / Kerberus — 200k+ users and a live fee on covered swaps (their fee bundles loss coverage; this desk does not).'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: bank Positive Pay and vendor bank-detail verification tools that AP teams already buy to stop payment-change fraud.'

export const BUSINESS_CASE_PROOF = `${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`

export const BUSINESS_CASE_DEMO =
  'A flagged lookalike payee gets a warning, a clean payee passes, and each check returns a receipt tied to the payment for a per-check fee. v0 is a risk lookup with receipts; it does not guarantee payments or cover losses.'

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
  CHECK_BUTTON,
  CHECK_JOB,
  BATCH_JOB,
  FLAG_JOB,
  RECORD_JOB,
  STRANGER_LINE,
  FOOTER,
  RECEIPT_NOTE,
  BATCH_QUOTE,
  DEMO_NOTE
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

export function stampFor(verdict: 'pass' | 'warn' | 'block'): string {
  if (verdict === 'block') return STAMP_BLOCK
  if (verdict === 'warn') return STAMP_WARN
  return STAMP_PASS
}
