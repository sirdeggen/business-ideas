export const EYEBROW = 'Trace'
export const DEFAULT_TITLE = 'Register a receipt.'
export const LEDE = 'Pay a little to register. Look it up.'
export const LOOKUP_BUTTON = 'Look up'
export const REGISTER_BUTTON = 'Register'
export const LOOKING = 'Looking up…'
export const EMPTY = 'Look up a receipt.'
export const COPY_LINK = 'Copy link'
export const AMOUNT_IN_ADVANCED = 'Amount in Advanced'
export const FOOTER = 'Not a dataset stall. Not a signed record desk.'
export const WHAT_LABEL = 'What'
export const WHO_LABEL = 'Who'
export const RIGHTS_LABEL = 'Rights'
export const PAID_LABEL = 'Paid'
export const REGISTER_JOB = 'What. Who. Rights. Then pay to post.'

export function sheetTitle(what?: string | null): string {
  const trimmed = what?.trim() ?? ''
  return trimmed || DEFAULT_TITLE
}

export function notFoundLine(query: string): string {
  return `No receipt for ${query}.`
}

export function foundLine(what: string): string {
  return what
}

export function registeredStatus(what: string): string {
  return `Registered ${what}.`
}

export const PRIMARY_COPY = [
  EYEBROW,
  DEFAULT_TITLE,
  LEDE,
  LOOKUP_BUTTON,
  REGISTER_BUTTON,
  EMPTY,
  COPY_LINK,
  AMOUNT_IN_ADVANCED,
  FOOTER,
  WHAT_LABEL,
  WHO_LABEL,
  RIGHTS_LABEL,
  PAID_LABEL,
  REGISTER_JOB
] as const
