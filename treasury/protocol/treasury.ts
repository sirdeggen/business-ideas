/**
 * Grassroots 2-of-3 (or 2-of-2) BSV policy treasury.
 *
 * On-chain vault: BRC-47 bare P2MS (`OP_M <pks> OP_N OP_CHECKMULTISIG`).
 * Keys in the script are BRC-42 children of each signer's identity
 * (`protocolID [1, "policy treasury"]`, `counterparty: "self"`, `keyID: treasuryId`
 * when each seat is a different identity; `${treasuryId}:${role}` for extra seats
 * held by the same identity). That matches how ts-stack P2MSKH talks to a
 * BRC-100 wallet: `getPublicKey` + `createSignature`. It is not an EVM Safe
 * account and not FROST/MuSig.
 *
 * Board policy: BRC-100 `createSignature` over a canonical proposal
 * (amount, payee identity key, memo). Announcements live on tm_anytx;
 * this module does not custody keys.
 *
 * Spend: once two signers have approved, they each sign the same vault spend
 * sighash. The last signer (or any signer after two P2MS signatures) submits
 * one `createAction` with the assembled unlocking script.
 */

import {
  Hash,
  LockingScript,
  OP,
  PublicKey,
  Signature,
  Transaction,
  TransactionSignature,
  UnlockingScript,
  Utils,
  ECDSA,
  BigNumber
} from '@bsv/sdk'

export const PROTOCOL_ID: [1, string] = [1, 'policy treasury']
export const BASKET = 'treasury'
export const FEE_SATS = 100
export const SIG_HASH_SCOPE =
  TransactionSignature.SIGHASH_FORKID | TransactionSignature.SIGHASH_ALL

export const ROLES = ['treasurer', 'chair', 'bookkeeper'] as const
export type Role = (typeof ROLES)[number]

export const ROLE_LABEL: Record<Role, string> = {
  treasurer: 'Treasurer',
  chair: 'Chair',
  bookkeeper: 'Bookkeeper'
}

export function isIdentityKey(value: string): boolean {
  return /^(02|03)[0-9a-fA-F]{64}$/.test(value.trim())
}

export function isDerivedPubkey(value: string): boolean {
  return isIdentityKey(value)
}

export function shortKey(key: string, size = 8): string {
  const trimmed = key.trim()
  if (trimmed.length <= size * 2) return trimmed
  return `${trimmed.slice(0, size)}…${trimmed.slice(-6)}`
}

export function utf8(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

export function hexToBytes(hex: string): number[] {
  return Utils.toArray(hex.replace(/^0x/i, ''), 'hex') as number[]
}

export function bytesToHex(bytes: number[]): string {
  return Utils.toHex(bytes)
}

/** BRC-47 bare M-of-N locking script. Pubkeys are compressed 33-byte hex. */
export function p2msLock(pubkeys: string[], threshold: number): LockingScript {
  if (threshold < 1 || threshold > pubkeys.length) {
    throw new Error(`threshold must be 1..${pubkeys.length}`)
  }
  if (pubkeys.length < 2 || pubkeys.length > 3) {
    throw new Error('treasury vault is 2-of-2 or 2-of-3')
  }
  for (const key of pubkeys) {
    if (!isDerivedPubkey(key)) throw new Error(`not a compressed pubkey: ${key}`)
  }
  const script = new LockingScript()
  script.writeNumber(threshold)
  for (const key of pubkeys) {
    script.writeBin(hexToBytes(key))
  }
  script.writeNumber(pubkeys.length)
  script.writeOpCode(OP.OP_CHECKMULTISIG)
  return script
}

/**
 * Unlocking script: OP_0 (CHECKMULTISIG dummy) then signatures in pubkey order.
 * Each signature is already in Bitcoin checksig format (DER + sighash byte).
 */
export function p2msUnlock(checksigSignatures: number[][]): UnlockingScript {
  const script = new UnlockingScript()
  script.writeOpCode(OP.OP_0)
  for (const signature of checksigSignatures) {
    script.writeBin(signature)
  }
  return script
}

export function unlockingScriptLength(threshold: number): number {
  // OP_0 + (push opcode + ~73-byte checksig) * threshold
  return 1 + threshold * 74
}

export function derToChecksig(der: number[]): number[] {
  const parsed = Signature.fromDER(der)
  const txSig = new TransactionSignature(parsed.r, parsed.s, SIG_HASH_SCOPE)
  return txSig.toChecksigFormat()
}

export interface CanonicalProposal {
  v: 1
  treasuryId: string
  proposalId: string
  amountSats: number
  payeeIdentityKey: string
  memo: string
  payeeLockingScriptHex: string
}

export function canonicalProposalBytes(proposal: CanonicalProposal): number[] {
  if (!Number.isInteger(proposal.amountSats) || proposal.amountSats < 1) {
    throw new Error('amountSats must be a positive integer')
  }
  if (!isIdentityKey(proposal.payeeIdentityKey)) {
    throw new Error('payee must be a 66-hex compressed identity key')
  }
  const memo = proposal.memo.trim()
  if (!memo) throw new Error('memo is required')
  const body = JSON.stringify({
    v: 1,
    treasuryId: proposal.treasuryId,
    proposalId: proposal.proposalId,
    amountSats: proposal.amountSats,
    payeeIdentityKey: proposal.payeeIdentityKey.trim().toLowerCase(),
    memo,
    payeeLockingScriptHex: proposal.payeeLockingScriptHex.toLowerCase()
  })
  return utf8(body)
}

/** BRC-100 createSignature({ data }) hashes once with SHA-256 before ECDSA. */
export function verifyWalletDataSignature(
  derivedPubkey: string,
  data: number[],
  derSignature: number[]
): boolean {
  const hash = Hash.sha256(data)
  const key = PublicKey.fromString(derivedPubkey)
  const signature = Signature.fromDER(derSignature)
  return ECDSA.verify(new BigNumber(hash), signature, key)
}

export interface SpendPlan {
  sourceTXID: string
  sourceOutputIndex: number
  sourceSatoshis: number
  vaultLockingScriptHex: string
  payeeLockingScriptHex: string
  amountSats: number
  changeSats: number
  feeSats: number
}

export function planSpend(args: {
  vaultSatoshis: number
  amountSats: number
  feeSats?: number
}): { amountSats: number; feeSats: number; changeSats: number } {
  const feeSats = args.feeSats ?? FEE_SATS
  if (args.amountSats < 1) throw new Error('amount must be at least 1 sat')
  if (args.vaultSatoshis < args.amountSats + feeSats) {
    throw new Error(
      `vault has ${args.vaultSatoshis} sats; need ${args.amountSats + feeSats} (amount + ${feeSats} fee)`
    )
  }
  return {
    amountSats: args.amountSats,
    feeSats,
    changeSats: args.vaultSatoshis - args.amountSats - feeSats
  }
}

export function buildSpendTransaction(plan: SpendPlan): Transaction {
  const tx = new Transaction()
  tx.version = 1
  tx.lockTime = 0
  tx.addInput({
    sourceTXID: plan.sourceTXID,
    sourceOutputIndex: plan.sourceOutputIndex,
    sequence: 0xffffffff
  })
  tx.addOutput({
    satoshis: plan.amountSats,
    lockingScript: LockingScript.fromHex(plan.payeeLockingScriptHex)
  })
  if (plan.changeSats > 0) {
    tx.addOutput({
      satoshis: plan.changeSats,
      lockingScript: LockingScript.fromHex(plan.vaultLockingScriptHex)
    })
  }
  return tx
}

/**
 * Bytes passed as `data` to BRC-100 createSignature so the wallet's extra
 * SHA-256 yields HASH256(preimage) — same trick PushDrop uses.
 */
export function p2msSignData(plan: SpendPlan): number[] {
  const tx = buildSpendTransaction(plan)
  const preimage = TransactionSignature.format({
    sourceTXID: plan.sourceTXID,
    sourceOutputIndex: plan.sourceOutputIndex,
    sourceSatoshis: plan.sourceSatoshis,
    transactionVersion: tx.version,
    otherInputs: [],
    allInputs: tx.inputs,
    inputIndex: 0,
    outputs: tx.outputs,
    inputSequence: 0xffffffff,
    subscript: LockingScript.fromHex(plan.vaultLockingScriptHex),
    lockTime: tx.lockTime,
    scope: SIG_HASH_SCOPE
  })
  return Hash.sha256(preimage)
}

export function assembleP2msUnlockingScript(args: {
  pubkeys: string[]
  signaturesByPubkey: Record<string, number[]>
  threshold: number
}): UnlockingScript {
  const ordered: number[][] = []
  for (const pubkey of args.pubkeys) {
    const der = args.signaturesByPubkey[pubkey]
    if (!der) continue
    ordered.push(derToChecksig(der))
  }
  if (ordered.length < args.threshold) {
    throw new Error(`need ${args.threshold} vault signatures, have ${ordered.length}`)
  }
  return p2msUnlock(ordered.slice(0, args.threshold))
}

export function uniqueApprovers<T extends { role: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const row of rows) {
    const key = row.role.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

export function seatsForIdentity<T extends { role: Role; identityKey?: string }>(
  signers: T[],
  identityKey: string | null | undefined
): T[] {
  if (!identityKey) return []
  const id = identityKey.trim().toLowerCase()
  return signers.filter((signer) => signer.identityKey && signer.identityKey.toLowerCase() === id)
}

export function heldRoles(
  signers: Array<{ role: Role; identityKey?: string }>,
  identityKey: string | null | undefined
): Role[] {
  return seatsForIdentity(signers, identityKey).map((signer) => signer.role)
}

export function nextOpenRole(
  held: Role[],
  used: Array<{ role: Role }>
): Role | undefined {
  const taken = new Set(used.map((row) => row.role))
  return held.find((role) => !taken.has(role))
}

/**
 * Classic single-person-per-seat treasuries keep `keyID: treasuryId`.
 * Extra seats held by the same identity use `${treasuryId}:${role}` so P2MS
 * can collect two distinct pubkeys / signatures from one wallet.
 */
export function vaultKeyID(
  treasuryId: string,
  role: Role,
  identityKey: string,
  signers: Array<{ role: Role; identityKey?: string; derivedPubkey?: string; joinedAt?: string }>
): string {
  const mine = seatsForIdentity(signers, identityKey)
  const othersJoined = mine.filter((signer) => signer.role !== role && signer.derivedPubkey)
  if (othersJoined.length === 0) return treasuryId
  const first = [...mine.filter((signer) => signer.derivedPubkey)].sort((a, b) => {
    const byTime = (a.joinedAt || '').localeCompare(b.joinedAt || '')
    if (byTime !== 0) return byTime
    return ROLES.indexOf(a.role) - ROLES.indexOf(b.role)
  })[0]
  if (first?.role === role) return treasuryId
  return `${treasuryId}:${role}`
}

export function thresholdMet(approvalCount: number, threshold: number): boolean {
  return approvalCount >= threshold
}

export function requiredRoles(signerCount: 2 | 3): Role[] {
  return signerCount === 2 ? ['treasurer', 'chair'] : ['treasurer', 'chair', 'bookkeeper']
}

export interface VaultInstructions {
  type: 'p2ms'
  protocolID: [1, string]
  keyID: string
  pubkeys: string[]
  threshold: number
  counterparty: 'self'
}

export function vaultInstructions(treasuryId: string, pubkeys: string[], threshold: number): VaultInstructions {
  return {
    type: 'p2ms',
    protocolID: PROTOCOL_ID,
    keyID: treasuryId,
    pubkeys,
    threshold,
    counterparty: 'self'
  }
}

export function payeeMemoField(memo: string): number[] {
  return utf8(memo.slice(0, 80))
}
