export const TITLE = 'Keepsake Desk'
export const EYEBROW = 'Keepsake'
export const LEDE = 'Mint a numbered keepsake. Send it to someone. They can keep it, show it, give it, or resell it.'
export const PRODUCT = 'Keepsake Desk'
export const OPEN_BUTTON = 'Open the edition'
export const MINT_BUTTON = 'Mint the next piece'
export const SEND_BUTTON = 'Send'
export const GIFT_BUTTON = 'Gift it on'
export const SHOW_BUTTON = 'Show on a profile'
export const RESALE_BUTTON = 'Resell'
export const RECORD_BUTTON = 'Record on the public book'
export const RECORDING_BUTTON = 'Recording…'
export const REFRESH_BUTTON = 'Refresh the book'
export const OPEN_JOB = 'Name the org and the keepsake. Set the edition size, the mint fee, and the issuer royalty. The desk cut stays under 5%. No wallet yet.'
export const MINT_JOB = 'Mint the next number. The edition size is fixed. Minting stops when the count is full.'
export const SEND_JOB = 'Send this piece to a recipient identity key. Message Box delivery happens when you record.'
export const HOLDER_JOB = 'The holder can keep the piece and mark it for a public profile.'
export const GIFT_JOB = 'Give it to another identity key. A gift has no price, so the royalty on that transfer is zero.'
export const RESALE_JOB = 'Set a price. The desk computes the issuer royalty and the desk cut, then records that split.'
export const RECORD_JOB = 'The walkthrough is done here. A wallet only writes the public record and sends the Message Box note.'
export const RECEIPT_NOTE = 'The desk computes and records the royalty and the desk cut. Who holds the piece stays in this browser until you record, and this demo does not move the sale sats.'
export const FEE_HELPER = 'The mint fee is sats per piece. The issuer royalty and the desk cut are basis points of the resale price. 500 is 5%. The desk cut stays under 5%.'
export const LOCAL_NOTE = 'The walkthrough keeps the edition in this browser. Message Box delivery, the holder, and the profile flag are desk state until you record. The public book is the overlay record of the fixed edition. v0 does not move resale sats and does not add pieces past the edition count. There are no packs and no random upgrades.'
export const STRANGER_LINE = 'Anyone with this link can see the edition count and the numbered piece. No wallet to look.'
export const FOOTER = 'Not a grant, access key, ticket, vault claim, raffle, or name. One numbered piece from a fixed edition.'
export const BOOK_EMPTY = 'No editions on the public book yet.'
export const BOOK_HEADING = 'Public book'
export const ORG_LABEL = 'Org'
export const TITLE_LABEL = 'Keepsake'
export const SIZE_LABEL = 'Edition size'
export const MINT_FEE_LABEL = 'Mint fee (sats per piece)'
export const ROYALTY_LABEL = 'Issuer royalty (basis points)'
export const DESK_LABEL = 'Desk cut (basis points)'
export const RECIPIENT_LABEL = 'Recipient (identity key)'
export const BUYER_LABEL = 'Buyer identity key'
export const PRICE_LABEL = 'Price (sats)'
export const LINE_PRICE = 'Price'
export const LINE_ROYALTY = 'Issuer royalty'
export const LINE_DESK = 'Desk cut'
export const LINE_SELLER = 'Seller receives'
export const LINE_MINT_FEE = 'Mint fee'
export const SCENE_ALT = 'A blonde woman hands a phone showing Keepsake #1/500 to a male colleague at a modern venue, with a train and electric cars visible through the glass.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'An org mints a fixed number of keepsakes: a volunteer award, a service year, an opening night, or a donor thank-you. The holder can keep it, show it, give it on, or resell it. The edition is fixed: no packs and no random upgrades.'

export const BUSINESS_CASE_WHO =
  'The org pays a mint fee per piece: companies, campuses, venues, and volunteer groups. On a resale, the buyer pays the price. The desk records a cut under 5% and an issuer royalty.'

export const BUSINESS_CASE_MARKET =
  'Fragment, Telegram\'s marketplace on TON (DefiLlama, 2026-10-13): ~$32.2M user fees / 30d across Stars, Ads, Premium, usernames and Gifts; the Gifts-only share is unknown. Fragment takes 5% on collectible sales; Telegram\'s own gift market keeps 20% of a Stars price. Telegram Gifts on X: 604 posts / 7d.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Fragment fees across all products (DefiLlama, 2026-10-13): ~$32.2M user fees / 30d. Fragment takes 5% on collectible sales.'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: service-year awards, donor thank-you plaques, opening-night programs, and volunteer certificates — orgs already pay to issue a scarce numbered thank-you.'

export const BUSINESS_CASE_PROOF = `${BUSINESS_CASE_PROOF_CHAIN} ${BUSINESS_CASE_PROOF_FIAT}`

export const BUSINESS_CASE_DEMO =
  'An org opens a fixed edition, mints a numbered keepsake, and sends it to a recipient, who can see it. A resale shows the issuer royalty and the desk cut. v0 computes and records the royalty and publishes the edition count; it does not run checkout for the sale.'

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
  OPEN_BUTTON,
  OPEN_JOB,
  MINT_JOB,
  SEND_JOB,
  HOLDER_JOB,
  GIFT_JOB,
  RESALE_JOB,
  RECORD_JOB,
  STRANGER_LINE,
  FOOTER,
  RECEIPT_NOTE
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

export function pieceLabel(serial: number, editionSize: number): string {
  return `#${serial}/${editionSize}`
}
