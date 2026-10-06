export const TITLE = 'Scrip Desk'
export const EYEBROW = 'Scrip'
export const LEDE = 'Issue a branded balance. Post the reserve that backs it. Redeem on demand.'
export const PRODUCT = 'Scrip Desk'
export const ISSUE_BUTTON = 'Issue the brand'
export const MINT_BUTTON = 'Mint'
export const ATTEST_BUTTON = 'Attest the reserve'
export const REDEEM_BUTTON = 'Redeem'
export const RECORD_BUTTON = 'Record on the public book'
export const RECORDING_BUTTON = 'Recording…'
export const REFRESH_BUTTON = 'Refresh the book'
export const ISSUE_JOB = 'Name the org, the brand, the ticker, and the unit. The setup fee is in sats. No wallet yet.'
export const MINT_JOB = 'Name the holder and how many units to mint. Outstanding liability goes up. The mint fee is taken from the sats paid.'
export const ATTEST_JOB = 'Post the reserve that backs what is outstanding. Anyone can compare that claim with the liability.'
export const REDEEM_JOB = 'The holder burns units on demand. Redeem stays blocked until a reserve attestation covers the outstanding liability.'
export const RECORD_JOB = 'The walkthrough is done here. A wallet only writes the public record.'
export const RECEIPT_NOTE = 'This demo records mint and redeem receipts and a reserve attestation the issuer posts. It does not hold custody or move reserves.'
export const YIELD_SHARE_LINE = 'Simulated yield share: a small share of reserve yield is desk economics copy only. This desk does not compute yield and has no yield oracle.'
export const FEE_HELPER = 'The setup fee is a flat amount in sats. Mint and redeem fees are basis points taken from the sats on the receipt. 50 is 0.5%.'
export const LOCAL_NOTE = 'The walkthrough keeps the brand in this browser. The public book is the overlay receipts. The reserve attestation is a hashed claim the org posts, not a bank API. v0 does not hold custody and does not move reserves. v0 is not a bank-grade custodian, not FDIC insurance, and not a licensed trust.'
export const STRANGER_LINE = 'Anyone with this link can check the reserve against what is outstanding. No wallet to look.'
export const FOOTER = 'Not dual-control spending. Not a timed access key. Not a continuous payment. One branded balance with a public reserve attestation.'
export const BOOK_EMPTY = 'No brands on the public book yet.'
export const BOOK_HEADING = 'Public book'
export const SETUP_LABEL = 'Setup fee (sats)'
export const MINT_BPS_LABEL = 'Mint fee (basis points)'
export const REDEEM_BPS_LABEL = 'Redeem fee (basis points)'
export const UNIT_RATE_LABEL = 'Sats per unit'
export const ORG_LABEL = 'Org'
export const BRAND_LABEL = 'Brand'
export const TICKER_LABEL = 'Ticker'
export const UNIT_LABEL = 'Unit label'
export const HOLDER_LABEL = 'Holder'
export const UNITS_LABEL = 'Units'
export const RESERVE_LABEL = 'Reserve (sats)'
export const LINE_SETUP = 'Setup fee'
export const LINE_PAID = 'Sats paid'
export const LINE_GROSS = 'Gross sats'
export const LINE_FEE = 'Fee sats'
export const LINE_NET = 'Net sats'
export const LINE_LIABILITY = 'Outstanding liability'
export const LINE_RESERVE = 'Attested reserve'
export const STAMP_MISSING = 'No attestation'
export const STAMP_UNDER = 'Under collateral'
export const STAMP_COVERED = 'Covered'
export const STAMP_OVER = 'Over collateral'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'Festival organizers, co-ops, schools, and campuses already run branded balances, but members cannot see whether the float is backed and redeem is often a phone call. Issuers need a public reserve attestation tied to mint and redeem so a holder can check coverage and cash out on demand.'

export const BUSINESS_CASE_WHO =
  'Credit unions, festivals, co-ops, schools, and enterprise campuses that already issue branded stored value. Holders spend the balance; the buyer is the issuer that pays setup plus mint/redeem fees or a small share of reserve yield.'

export const BUSINESS_CASE_MARKET =
  'Paxos issuer (DefiLlama, 2026-10-06): ~$9.21M retained / 30d from reserve yield on issued dollars (white-label PYUSD / USDG partner economics). Ethena Whitelabel (jupUSD, USDm, ether.fi USD): partner keeps most reserve yield. Proof-of-reserves on X ~1.6k posts / 7d. Share that is grassroots festival / campus scrip vs dollar issuers is unknown.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Paxos / Ethena Whitelabel — partners already share reserve-yield economics on branded dollars with public reserve attestation.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: campus cash, festival scrip, co-op gift cards, credit-union prepaid — orgs already issue branded stored value and take float or reload fees.'

export const BUSINESS_CASE_PROOF = `${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`

export const BUSINESS_CASE_DEMO =
  'Issuer posts a reserve attestation, mints branded balances, shows coverage after mints, and redeems on demand with a receipt. v0 attests and records mint/redeem; it is not a bank-grade custodian.'

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
  ISSUE_BUTTON,
  ISSUE_JOB,
  MINT_JOB,
  ATTEST_JOB,
  REDEEM_JOB,
  RECORD_JOB,
  STRANGER_LINE,
  FOOTER,
  RECEIPT_NOTE,
  YIELD_SHARE_LINE
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

export function coverageLine(
  flag: 'missing' | 'under' | 'covered' | 'over',
  reserve: number | null,
  liability: number
): string {
  if (flag === 'missing') return 'No reserve attestation yet.'
  const reserveText = formatAmount(reserve ?? 0)
  const liabilityText = formatAmount(liability)
  if (flag === 'under') {
    return `Under-collateralized. Attested reserve ${reserveText} is below outstanding liability ${liabilityText}.`
  }
  if (flag === 'over') {
    return `Over-collateralized. Attested reserve ${reserveText} is above outstanding liability ${liabilityText}.`
  }
  return `Covered. Attested reserve matches outstanding liability ${liabilityText}.`
}
