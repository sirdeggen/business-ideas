export const TITLE = 'Mandate Desk'
export const EYEBROW = 'Mandate'
export const LEDE = 'Hire a manager without handing over the keys. A whitelist, a period cap, and a fee by formula. The owner can always pull the balance back.'
export const PRODUCT = 'Mandate Desk'
export const OPEN_BUTTON = 'Open the mandate'
export const FUND_BUTTON = 'Record a fund'
export const GAIN_BUTTON = 'Mark the period gain'
export const SEND_BUTTON = 'Send under the mandate'
export const RECALL_BUTTON = 'Pull everything back'
export const CHANGE_BUTTON = 'Propose the change'
export const RECORD_BUTTON = 'Record on the public book'
export const RECORDING_BUTTON = 'Recording…'
export const REFRESH_BUTTON = 'Refresh the book'
export const OPEN_JOB = 'Name the org. Name the outside manager, the whitelist, the per-period cap, and the performance fee. The fee stays between 5% and 10%. No wallet yet.'
export const FUND_JOB = 'Record the sats the mandate covers. The receipt does not move them into the lock.'
export const GAIN_JOB = 'Mark this period’s gain. The manager fee accrues by formula from that gain.'
export const SEND_JOB = 'The manager may send only to a whitelisted destination, and only inside the remaining cap for this period.'
export const RECALL_JOB = 'The owner pulls the whole recorded balance back. No notice period on a recall.'
export const CHANGE_JOB = 'A change needs the owner’s signature and waits out the notice period. Until then the current rules stay.'
export const RECORD_JOB = 'The walkthrough is done here. A wallet only writes the public record.'
export const RECEIPT_NOTE = 'The script enforces one thing: the mandate output locks to the owner key and OP_CHECKSIG, so only the owner can spend it and the owner can always pull those sats back. This page computes and records the whitelist, the per-period cap, the performance fee, and the notice period. The locking script does not read them. OP_PUSH_TX enforcement is v1. The public record is a 1-sat receipt. It does not move the org balance into the lock, and it does not pay the fee out.'
export const DESK_NOTE = 'A send outside the whitelist or over the remaining cap is refused before the wallet opens. That refusal is a desk check. It is not in the script.'
export const FEE_HELPER = 'Performance fee is a percent of the marked gain, from 5% to 10%. 800 basis points is 8%. 50,000 sats of gain at 800 accrues 4,000 sats. v0 records that number.'
export const LOCAL_NOTE = 'The walkthrough keeps the mandate in this browser until you record. Whitelist, cap, fee, and notice are desk rules until a later version puts them in the script. v0 does not move the balance and does not pay the accrued fee. A manager send counts on the public book only when the manager key signed it.'
export const STRANGER_LINE = 'Anyone with this link can read the mandate, the cap still left, and the accrued fee. No wallet to look.'
export const FOOTER = 'Not a board vault, a spend policy, or a credit facility. The owner keeps the lock. A hired manager works inside recorded rules.'
export const BOOK_EMPTY = 'No mandates on the public book yet.'
export const BOOK_HEADING = 'Public book'
export const ORG_LABEL = 'Org'
export const MANAGER_LABEL = 'Manager (identity key)'
export const WHITELIST_LABEL = 'Whitelist (identity keys)'
export const CAP_LABEL = 'Per-period cap (sats)'
export const PERIOD_LABEL = 'Period (days)'
export const FEE_LABEL = 'Performance fee (basis points)'
export const NOTICE_LABEL = 'Notice period (days)'
export const FUND_LABEL = 'Fund (sats)'
export const GAIN_LABEL = 'Period gain (sats)'
export const DESTINATION_LABEL = 'Destination (identity key)'
export const AMOUNT_LABEL = 'Amount (sats)'
export const CHANGE_FIELD_LABEL = 'Rule to change'
export const CHANGE_VALUE_LABEL = 'New rule'
export const LINE_BALANCE = 'Recorded balance'
export const LINE_CAP = 'Remaining this period'
export const LINE_FEE = 'Accrued fee'
export const LINE_WHITELIST = 'Whitelist'
export const LINE_LOCK = 'Owner lock'
export const SCENE_ALT = 'A blonde treasurer at a bright desk reviews a teal mandate card with a whitelist and a period cap, while an outside manager in a navy jacket sits beside her without the keys, and a train is visible through the glass.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'An endowment, an HOA reserve, or a club treasury hires an outside manager without handing over its keys. The manager can move funds only inside rules the org set. The org can always take the funds back.'

export const BUSINESS_CASE_TAM =
  'Morpho vault risk curators are the analog. On DefiLlama, fetched 20 Oct 2026, Sentora Curator revenue was $742,612 over 30 days and Steakhouse Financial revenue was $448,341 over 30 days. DefiLlama counts the fees the curator keeps, not depositor yield. The share an endowment, HOA reserve, or club treasury would pay here is unknown.'

export const BUSINESS_CASE_BUYER =
  'The org pays to run the mandate: an endowment, an HOA, or a club. The manager is paid the performance fee the formula records, in the 5% to 10% band. The org does not hand over its keys.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Sentora Curator revenue on DefiLlama, fetched 20 Oct 2026, was $742,612 over 30 days. Steakhouse Financial curator revenue was $448,341 over 30 days. Morpho documents the curator performance fee as a percent of yield. Listed Sentora vaults show 0%, 10%, and 15%; one Steakhouse high-yield vault shows 25%.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: endowments, HOA reserves, and club treasuries already pay an outside manager or advisor while the institution keeps custody of the funds.'

export const BUSINESS_CASE_PROOF = `${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`

export const BUSINESS_CASE_DEMO =
  'An org names an outside manager, a whitelist, a per-period cap, and a performance fee. A send outside the whitelist or over the cap is refused. The fee line shows the formula. The owner pulls the balance back. A change waits out the notice period.'

export const BUSINESS_CASE_FIELDS = [
  'Why it exists',
  'TAM',
  'Buyer',
  'Analog proof',
  'Demo goal'
] as const

export const PRIMARY_COPY = [
  TITLE,
  EYEBROW,
  LEDE,
  OPEN_BUTTON,
  OPEN_JOB,
  FUND_JOB,
  GAIN_JOB,
  SEND_JOB,
  RECALL_JOB,
  CHANGE_JOB,
  RECORD_JOB,
  STRANGER_LINE,
  FOOTER,
  RECEIPT_NOTE,
  DESK_NOTE
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
