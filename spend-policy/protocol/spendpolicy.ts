/**
 * Spend Policy protocol (PushDrop / BRC-48 fields).
 *
 * A treasurer writes a live policy (allowed payees, daily cap in sats,
 * expiry). A spender pays a listed payee only if that policy allows.
 * Spend announcements are tagged to the policy so later spends see the cap.
 *
 * Public Pages uses tm_anytx / ls_anytx. Client filters on MAGIC.
 * Not a card product. Not a 402 handshake. Not treasury / StreamPay.
 */

export const PROTOCOL_ID: [0, string] = [0, 'spendpolicy']
export const BASKET = 'spendpolicy'
export const MAGIC = 'spendpolicy'
export const SCHEMA_VERSION = '1'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']

export const NAME_MAX = 80
export const MIN_AMOUNT_SATS = 1
export const MAX_AMOUNT_SATS = 1_000_000_000_000
export const MIN_DAILY_CAP_SATS = 1
export const DEFAULT_DAILY_CAP_SATS = 100_000
export const DEFAULT_EXPIRY_DAYS = 14

export const KINDS = ['policy', 'spend'] as const
export type SpendPolicyKind = (typeof KINDS)[number]

export interface AllowedPayee {
  identityKey?: string
  name?: string
}

export interface PolicyPayload {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'policy'
  policyId: string
  treasurer: string
  dailyCapSats: number
  expiry: string
  payees: AllowedPayee[]
  createdAt: string
}

export interface SpendPayload {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'spend'
  policyId: string
  spender: string
  payee: string
  amountSats: number
  spentAt: string
  payeeName?: string
}

export type SpendPolicyPayload = PolicyPayload | SpendPayload

export type SpendDecision =
  | { ok: true }
  | { ok: false, reason: string }

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const POLICY_ID = /^[0-9a-f]{32}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isPolicyId(value: string): boolean {
  return POLICY_ID.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function newPolicyId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function assertAmountSats(amountSats: number): void {
  if (!Number.isInteger(amountSats) || amountSats < MIN_AMOUNT_SATS || amountSats > MAX_AMOUNT_SATS) {
    throw new Error(`Amount must be an integer between ${MIN_AMOUNT_SATS} and ${MAX_AMOUNT_SATS} sats`)
  }
}

export function assertDailyCap(dailyCapSats: number): void {
  if (!Number.isInteger(dailyCapSats) || dailyCapSats < MIN_DAILY_CAP_SATS || dailyCapSats > MAX_AMOUNT_SATS) {
    throw new Error(`Daily cap must be an integer between ${MIN_DAILY_CAP_SATS} and ${MAX_AMOUNT_SATS} sats`)
  }
}

function isPrintableUtf8(bytes: number[]): boolean {
  return bytes.length > 0 && bytes.every((byte) => byte >= 0x09 && byte <= 0x7e)
}

function looksLikeLockPadding(field: number[] | Uint8Array): boolean {
  const bytes = Array.from(field)
  if (isPrintableUtf8(bytes)) return false
  if (bytes.length === 33 && (bytes[0] === 2 || bytes[0] === 3)) return true
  if (bytes.length >= 64 && bytes.length <= 80) return true
  return false
}

function semanticFields(fields: Array<number[] | Uint8Array>): Array<number[] | Uint8Array> {
  return fields.filter((field) => !looksLikeLockPadding(field))
}

function magicIndex(fields: Array<number[] | Uint8Array>): number {
  return fields.findIndex((field) => {
    try {
      return fieldUtf8(field) === MAGIC
    } catch {
      return false
    }
  })
}

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

export function normalizePayee(payee: AllowedPayee): AllowedPayee | null {
  const identityKey = payee.identityKey?.trim() ?? ''
  const name = payee.name?.trim() ?? ''
  if (identityKey && !isIdentityKey(identityKey)) return null
  if (name.length > NAME_MAX) return null
  if (!identityKey && !name) return null
  const out: AllowedPayee = {}
  if (identityKey) out.identityKey = identityKey
  if (name) out.name = name
  return out
}

export function parsePayees(raw: string): AllowedPayee[] | null {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const payees: AllowedPayee[] = []
    for (const row of parsed) {
      if (!row || typeof row !== 'object') return null
      const item = row as { identityKey?: unknown, name?: unknown }
      const normalized = normalizePayee({
        identityKey: typeof item.identityKey === 'string' ? item.identityKey : undefined,
        name: typeof item.name === 'string' ? item.name : undefined
      })
      if (!normalized) return null
      payees.push(normalized)
    }
    return payees
  } catch {
    return null
  }
}

export function encodePayees(payees: AllowedPayee[]): string {
  return JSON.stringify(payees.map((payee) => {
    const row: AllowedPayee = {}
    if (payee.identityKey) row.identityKey = payee.identityKey.trim()
    if (payee.name) row.name = payee.name.trim()
    return row
  }))
}

export function validatePolicy(policy: PolicyPayload): string | null {
  if (policy.magic !== MAGIC) return 'Not a spend policy.'
  if (policy.kind !== 'policy') return 'Not a policy record.'
  if (!isPolicyId(policy.policyId)) return 'Policy id is missing.'
  if (!isIdentityKey(policy.treasurer)) return 'Treasurer identity is missing.'
  try {
    assertDailyCap(policy.dailyCapSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Daily cap is invalid.'
  }
  if (!isIsoDateTime(policy.expiry)) return 'Expiry must be a date and time.'
  if (!isIsoDateTime(policy.createdAt)) return 'Created time is missing.'
  if (!policy.payees.length) return 'Add at least one allowed payee.'
  for (const payee of policy.payees) {
    if (!normalizePayee(payee)) return 'Each payee needs a name or an identity key.'
  }
  if (!policy.payees.some((payee) => payee.identityKey && isIdentityKey(payee.identityKey))) {
    return 'At least one allowed payee needs an identity key so a spend can be paid.'
  }
  return null
}

export function validateSpend(spend: SpendPayload): string | null {
  if (spend.magic !== MAGIC) return 'Not a spend policy.'
  if (spend.kind !== 'spend') return 'Not a spend record.'
  if (!isPolicyId(spend.policyId)) return 'Policy id is missing.'
  if (!isIdentityKey(spend.spender)) return 'Spender identity is missing.'
  if (!isIdentityKey(spend.payee)) return 'Payee identity is missing.'
  try {
    assertAmountSats(spend.amountSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  if (!isIsoDateTime(spend.spentAt)) return 'Spend time is missing.'
  if (spend.payeeName && spend.payeeName.length > NAME_MAX) return 'Payee name is too long.'
  return null
}

export function encodePolicyFields(policy: Omit<PolicyPayload, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: PolicyPayload = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'policy',
    ...policy
  }
  const invalid = validatePolicy(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('policy'),
    stringToUtf8Bytes(policy.policyId),
    stringToUtf8Bytes(policy.treasurer),
    stringToUtf8Bytes(String(policy.dailyCapSats)),
    stringToUtf8Bytes(policy.expiry),
    stringToUtf8Bytes(encodePayees(policy.payees)),
    stringToUtf8Bytes(policy.createdAt)
  ]
}

export function encodeSpendFields(spend: Omit<SpendPayload, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: SpendPayload = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'spend',
    ...spend
  }
  const invalid = validateSpend(payload)
  if (invalid) throw new Error(invalid)
  const fields = [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('spend'),
    stringToUtf8Bytes(spend.policyId),
    stringToUtf8Bytes(spend.spender),
    stringToUtf8Bytes(spend.payee),
    stringToUtf8Bytes(String(spend.amountSats)),
    stringToUtf8Bytes(spend.spentAt)
  ]
  if (spend.payeeName) fields.push(stringToUtf8Bytes(spend.payeeName))
  return fields
}

function policyFromParts(parts: {
  policyId: string
  treasurer: string
  dailyCapSats: number
  expiry: string
  payees: AllowedPayee[]
  createdAt: string
}): PolicyPayload | null {
  const policy: PolicyPayload = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'policy',
    ...parts
  }
  return validatePolicy(policy) ? null : policy
}

function spendFromParts(parts: {
  policyId: string
  spender: string
  payee: string
  amountSats: number
  spentAt: string
  payeeName?: string
}): SpendPayload | null {
  const spend: SpendPayload = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'spend',
    ...parts
  }
  return validateSpend(spend) ? null : spend
}

export function parseSpendPolicyFields(fields: Array<number[] | Uint8Array>): SpendPolicyPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION) return null
  if (kind === 'policy') {
    if (rest.length < 8) return null
    const dailyCapSats = Number(rest[4])
    if (!Number.isInteger(dailyCapSats)) return null
    const payees = parsePayees(rest[6])
    if (!payees) return null
    return policyFromParts({
      policyId: rest[2],
      treasurer: rest[3],
      dailyCapSats,
      expiry: rest[5],
      payees,
      createdAt: rest[7]
    })
  }
  if (kind === 'spend') {
    if (rest.length < 7) return null
    const amountSats = Number(rest[5])
    if (!Number.isInteger(amountSats)) return null
    return spendFromParts({
      policyId: rest[2],
      spender: rest[3],
      payee: rest[4],
      amountSats,
      spentAt: rest[6],
      payeeName: rest[7] || undefined
    })
  }
  return null
}

export function utcDay(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

export function spentOnDay(spends: Array<Pick<SpendPayload, 'spentAt' | 'amountSats'>>, day: string): number {
  return spends.reduce((sum, spend) => {
    return utcDay(spend.spentAt) === day ? sum + spend.amountSats : sum
  }, 0)
}

export function remainingDailyCap(
  policy: Pick<PolicyPayload, 'dailyCapSats'>,
  spends: Array<Pick<SpendPayload, 'spentAt' | 'amountSats'>>,
  now: Date
): number {
  const used = spentOnDay(spends, utcDay(now))
  return Math.max(0, policy.dailyCapSats - used)
}

export function payeeAllowed(
  policy: Pick<PolicyPayload, 'payees'>,
  payeeIdentity: string,
  payeeName?: string
): boolean {
  const key = normalizeIdentity(payeeIdentity)
  const name = payeeName ? normalizeName(payeeName) : ''
  if (!isIdentityKey(key)) return false
  return policy.payees.some((payee) => {
    const listedKey = payee.identityKey ? normalizeIdentity(payee.identityKey) : ''
    const listedName = payee.name ? normalizeName(payee.name) : ''
    if (listedKey && listedKey === key) return true
    if (!listedKey && listedName && name && listedName === name) return true
    return false
  })
}

export function formatExpirySentence(expiry: string): string {
  const date = new Date(expiry)
  if (Number.isNaN(date.getTime())) return expiry
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function formatSats(amount: number): string {
  return `${amount.toLocaleString('en-US')} sats`
}

export function decideSpend(input: {
  policy: PolicyPayload
  payeeIdentity: string
  amountSats: number
  now: Date
  spends: Array<Pick<SpendPayload, 'spentAt' | 'amountSats' | 'payee'>>
  payeeName?: string
}): SpendDecision {
  if (input.now.getTime() >= new Date(input.policy.expiry).getTime()) {
    return { ok: false, reason: `This policy expired on ${formatExpirySentence(input.policy.expiry)}.` }
  }
  if (!Number.isInteger(input.amountSats) || input.amountSats < MIN_AMOUNT_SATS) {
    return { ok: false, reason: 'Enter an amount in sats.' }
  }
  if (!payeeAllowed(input.policy, input.payeeIdentity, input.payeeName)) {
    return { ok: false, reason: 'This policy does not allow a spend to that payee.' }
  }
  const remaining = remainingDailyCap(input.policy, input.spends, input.now)
  if (remaining <= 0) {
    return { ok: false, reason: 'This policy’s daily cap is already used.' }
  }
  if (input.amountSats > remaining) {
    return {
      ok: false,
      reason: `This spend is ${formatSats(input.amountSats)}. Only ${formatSats(remaining)} remain on today’s cap.`
    }
  }
  return { ok: true }
}

export function defaultExpiryIso(from = new Date(), days = DEFAULT_EXPIRY_DAYS): string {
  const expiry = new Date(from.getTime())
  expiry.setUTCDate(expiry.getUTCDate() + days)
  return expiry.toISOString().replace(/\.\d{3}Z$/, 'Z')
}
