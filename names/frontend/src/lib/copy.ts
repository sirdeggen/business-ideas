export const EYEBROW = 'Names'
export const DEFAULT_TITLE = 'Lease a name.'
export const LEDE = 'A name for a while. Look it up. Renew before it ends.'
export const LOOKUP_BUTTON = 'Look up'
export const REGISTER_BUTTON = 'Register'
export const RENEW_BUTTON = 'Renew'
export const LOOKING = 'Looking up…'
export const EMPTY = 'Look up a name.'
export const COPY_LINK = 'Copy link'
export const FOOTER = 'Not a contacts list. Not invoices.'

export function sheetTitle(name?: string | null): string {
  const trimmed = name?.trim() ?? ''
  return trimmed || DEFAULT_TITLE
}

export function notFoundLine(name: string): string {
  return `${name} is free.`
}

export function leasedLine(name: string): string {
  return `${name} is leased.`
}

export function registeredStatus(name: string): string {
  return `Leased ${name}.`
}

export function renewedStatus(name: string): string {
  return `Renewed ${name}.`
}

export const PRIMARY_COPY = [
  EYEBROW,
  DEFAULT_TITLE,
  LEDE,
  LOOKUP_BUTTON,
  REGISTER_BUTTON,
  RENEW_BUTTON,
  EMPTY,
  COPY_LINK,
  FOOTER
] as const
