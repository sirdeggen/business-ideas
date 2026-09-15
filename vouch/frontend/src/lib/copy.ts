export const TITLE = 'Vouch Desk'
export const EYEBROW = 'Vouch'
export const LEDE = 'Stake a slashable vouch. Attest. Slash on bad faith.'
export const LIST_HEADING = 'Vouches'
export const EMPTY_LIST = 'No vouches yet.'
export const LOOKUP_BUTTON = 'Look up'
export const LOOKING = 'Looking up…'
export const EMPTY = 'Look up a vouch.'
export const COPY_LINK = 'Copy link'
export const VOUCH_BUTTON = 'Vouch'
export const ATTEST_BUTTON = 'Attest'
export const SLASH_BUTTON = 'Slash'
export const RELEASE_BUTTON = 'Release'
export const VOUCH_HEADING = 'Stake a vouch'
export const VOUCH_JOB = 'A label, the supplier, and a bond.'
export const ATTEST_HEADING = 'Attest'
export const ATTEST_JOB = 'What was checked. Then pay to post.'
export const AMOUNT_IN_ADVANCED = 'Amount in Advanced'
export const FOOTER = 'Not a name lease. Not a title. Not a membership. Not a provenance receipt. Not a trading market.'
export const SUBJECT_LABEL = 'Supplier'
export const BOND_LABEL = 'Bond'
export const NOTE_LABEL = 'What was checked'
export const REASON_LABEL = 'Reason'
export const PAID_LABEL = 'Paid'
export const NOT_SLASHER = 'You cannot slash this vouch.'
export const NOT_VOUCHER = 'You cannot release this vouch.'
export const BOND_NOT_LIVE = 'That bond is no longer live.'
export const SLASHED = 'Slashed.'
export const RELEASED = 'Released.'
export const VOUCHED = 'Vouched.'
export const ATTESTED = 'Posted.'

export function sheetTitle(subject?: string | null): string {
  const trimmed = subject?.trim() ?? ''
  return trimmed || TITLE
}

export function notFoundLine(query: string): string {
  return `No vouch for ${query}.`
}

export function vouchedStatus(subject: string): string {
  return `Vouched ${subject}.`
}

export function attestedStatus(note: string): string {
  return `Posted ${note}.`
}

export const PRIMARY_COPY = [
  TITLE,
  EYEBROW,
  LEDE,
  LIST_HEADING,
  EMPTY_LIST,
  LOOKUP_BUTTON,
  EMPTY,
  COPY_LINK,
  VOUCH_BUTTON,
  ATTEST_BUTTON,
  SLASH_BUTTON,
  RELEASE_BUTTON,
  VOUCH_HEADING,
  VOUCH_JOB,
  ATTEST_HEADING,
  ATTEST_JOB,
  AMOUNT_IN_ADVANCED,
  FOOTER,
  SUBJECT_LABEL,
  BOND_LABEL,
  NOTE_LABEL,
  REASON_LABEL,
  PAID_LABEL
] as const
