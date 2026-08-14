/** What a stranger may see on `?treasury=` before opening Treasurer tools. */

export const STRANGER_BOARD_FIRST = ['name', 'minutes', 'proposals'] as const

export const STRANGER_BOARD_HIDDEN = [
  'fund',
  'vault-sats',
  'propose',
  'identity-key',
  'connect-wallet'
] as const

const FORBIDDEN = [
  /\b0\s*sats\b/i,
  /\bcurrent vault:\s*/i,
  /\bfund the vault\b/i,
  /\bfund from this wallet\b/i,
  /\bpropose a payment\b/i,
  /\bidentity key\b/i,
  /\bconnect bsv wallet\b/i
]

export function isStrangerBoardForbidden(text: string): boolean {
  return FORBIDDEN.some((pattern) => pattern.test(text))
}

export function strangerBoardPanels(name: string): {
  title: string
  first: typeof STRANGER_BOARD_FIRST
  hidden: typeof STRANGER_BOARD_HIDDEN
} {
  return {
    title: name,
    first: STRANGER_BOARD_FIRST,
    hidden: STRANGER_BOARD_HIDDEN
  }
}

export function vaultBalanceCopy(usd: string | null, hasFunds: boolean): string {
  if (usd) return `Current vault: ${usd}.`
  if (hasFunds) return 'Vault has funds.'
  return 'Vault is empty.'
}
