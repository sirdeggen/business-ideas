export const TITLE = 'Vault Claim'
export const EYEBROW = 'Vault'
export const LEDE = 'Claim a vaulted item. Transfer the claim. Burn it to redeem.'
export const LIST_HEADING = 'Claims'
export const EMPTY_LIST = 'No claims yet.'
export const HOLDER_FALLBACK = 'Holder'
export const TRANSFER_BUTTON = 'Transfer'
export const REDEEM_BUTTON = 'Redeem'
export const MINT_HEADING = 'Mint a claim'
export const MINT_JOB = 'A label, the item, and a price.'
export const MINT_BUTTON = 'Mint a claim'
export const TO_LABEL = 'To'
export const HELD_BY = 'Held by'
export const NOT_HOLDER = 'You don’t hold this claim.'
export const REDEEMED = 'Redeemed. The vault can ship.'
export const SERIAL_TAKEN = 'That item already has a live claim.'
export const FOOTER = 'Not a titled document. Not a ticket. Not a pack.'

export const BUSINESS_CASE_TITLE = 'Business case'

export const BUSINESS_CASE_WHY =
  'A vault holds the physical thing; the claim is a transferable paper that says you can redeem it. Trade the claim; burn it to get the item shipped. Not a mystery pack and not a forever JPEG of a card you never touch.'

export const BUSINESS_CASE_WHO =
  'Collectors and ops desks that vault graded cards or similar assets (grassroots: collectors/clubs; enterprise: vault/logistics partners). Redeemers pay shipping (and occasional handling); claim transfers happen between holders.'

export const BUSINESS_CASE_MARKET =
  'Courtyard vaults graded cards with insured custody; redeem burns the digital claim and ships the identical physical (redeemer pays shipping/taxes; high-demand handling $2/card). Series A $30M closed Jul 2025 (DefiLlama / company raise tracking). DefiLlama also shows large marketplace volume on Polygon, but reported fees mix card-pack sales with marketplace — pure vault-claim / redeem take-rate is unknown; do not treat pack GNP as this desk’s TAM.'

export const BUSINESS_CASE_PROOF_CHAIN =
  'Other-chain analog: Courtyard — vaulted physical TCG claims that trade digitally and burn on redeem (no gacha framing for this desk).'

export const BUSINESS_CASE_PROOF_FIAT =
  'Non-chain analog: Warehouse receipts, pawn tickets, safe-deposit claim checks — people already pay for “I hold the claim, you hold the thing.”'

export const BUSINESS_CASE_DEMO =
  'Issue claim → transfer → burn to redeem (redeemer pays shipping), in English on one URL.'

export const BUSINESS_CASE_CITATIONS = [
  { href: 'https://docs.courtyard.io/courtyard/logistics-and-legal/asset-redemption-and-shipping', label: 'Courtyard redeem' },
  { href: 'https://defillama.com/protocol/courtyard', label: 'DefiLlama' },
  { href: 'https://help.courtyard.io/en/articles/9513558-how-to-ship-your-physical-collectibles', label: 'Courtyard help' }
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
  HOLDER_FALLBACK,
  TRANSFER_BUTTON,
  REDEEM_BUTTON,
  MINT_HEADING,
  MINT_JOB,
  MINT_BUTTON,
  TO_LABEL,
  HELD_BY,
  NOT_HOLDER,
  REDEEMED,
  SERIAL_TAKEN,
  FOOTER
] as const
