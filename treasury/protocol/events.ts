/**
 * Public board events on tm_anytx / ls_anytx.
 *
 * tm_anytx admits valid PushDrop outputs only. The P2MS vault UTXO is not a
 * PushDrop, so each board action publishes a 1-sat announcement token. The
 * frontend reconstructs Treasury state by filtering PushDrop field 0 === tag.
 */

import { Utils } from '@bsv/sdk'
import {
  PROTOCOL_ID,
  ROLE_LABEL,
  p2msLock,
  requiredRoles,
  shortKey,
  thresholdMet,
  uniqueApprovers,
  type Role
} from './treasury.js'

export const EVENT_TAG = 'policy treasury'
export const ANNOUNCE_PROTOCOL_ID: [0, string] = [0, 'policy treasury']
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const OVERLAY_HOST = 'https://overlay-us-1.bsvb.tech'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const MESSAGE_BOX = 'policy treasury'

export const EVENT_KINDS = ['created', 'joined', 'funded', 'proposed', 'approved', 'paid'] as const
export type EventKind = (typeof EVENT_KINDS)[number]

export interface BoardEvent {
  treasuryId: string
  kind: EventKind
  at: string
  payload: Record<string, unknown>
}

export interface Signer {
  role: Role
  identityKey: string
  derivedPubkey?: string
  joinedAt?: string
}

export interface VaultUtxo {
  txid: string
  vout: number
  satoshis: number
  beef: number[]
}

export interface Approval {
  identityKey: string
  role: Role
  derivedPubkey: string
  signature: number[]
  at: string
}

export interface P2msSig {
  identityKey: string
  role: Role
  derivedPubkey: string
  signature: number[]
  at: string
}

export interface Proposal {
  id: string
  amountSats: number
  payeeIdentityKey: string
  memo: string
  payeeLockingScriptHex: string
  vaultTxid: string
  vaultVout: number
  vaultSatoshis: number
  feeSats: number
  changeSats: number
  createdAt: string
  createdBy: string
  approvals: Approval[]
  p2msSigs: P2msSig[]
  status: 'open' | 'approved' | 'paid'
  txid?: string
}

export interface FeedEvent {
  id: string
  at: string
  kind: EventKind
  text: string
}

export interface Treasury {
  id: string
  name: string
  threshold: number
  signers: Signer[]
  lockingScriptHex?: string
  vault: VaultUtxo[]
  proposals: Proposal[]
  feed: FeedEvent[]
  createdAt: string
  protocolID: [1, string]
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value)
}

function asRole(value: unknown): Role | null {
  if (value === 'treasurer' || value === 'chair' || value === 'bookkeeper') return value
  return null
}

function asNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) return value.map((item) => Number(item)).filter((item) => Number.isFinite(item))
  if (typeof value === 'string' && /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
    return Utils.toArray(value, 'hex') as number[]
  }
  return []
}

export function makeEvent(
  treasuryId: string,
  kind: EventKind,
  payload: Record<string, unknown>,
  at = new Date().toISOString()
): BoardEvent {
  return { treasuryId, kind, at, payload }
}

export function encodeEventFields(event: BoardEvent): number[][] {
  const body = {
    at: event.at,
    ...event.payload
  }
  return [
    Utils.toArray(EVENT_TAG, 'utf8') as number[],
    Utils.toArray(event.treasuryId, 'utf8') as number[],
    Utils.toArray(event.kind, 'utf8') as number[],
    Utils.toArray(JSON.stringify(body), 'utf8') as number[]
  ]
}

export function parseEventFields(fields: Array<number[] | Uint8Array>): BoardEvent | null {
  if (fields.length < 4) return null
  try {
    const tag = Utils.toUTF8(Array.from(fields[0]))
    if (tag !== EVENT_TAG) return null
    const treasuryId = Utils.toUTF8(Array.from(fields[1])).trim()
    const kind = Utils.toUTF8(Array.from(fields[2])).trim() as EventKind
    if (!EVENT_KINDS.includes(kind) || !treasuryId) return null
    const parsed = JSON.parse(Utils.toUTF8(Array.from(fields[3]))) as Record<string, unknown>
    const at = asString(parsed.at) || new Date(0).toISOString()
    const { at: _dropped, ...payload } = parsed
    return { treasuryId, kind, at, payload }
  } catch {
    return null
  }
}

function feedLine(event: BoardEvent): string {
  const role = asRole(event.payload.role)
  const who = role ? ROLE_LABEL[role] : 'Someone'
  switch (event.kind) {
    case 'created':
      return `${asString(event.payload.name) || 'Treasury'} opened as a 2-of-${asNumber(event.payload.signerCount) || 3} board.`
    case 'joined':
      return `${who} joined (${shortKey(asString(event.payload.identityKey), 10)}).`
    case 'funded':
      return `Treasury received ${asNumber(event.payload.satoshis).toLocaleString()} sats.`
    case 'proposed':
      return `${who} proposed ${asNumber(event.payload.amountSats).toLocaleString()} sats to ${shortKey(asString(event.payload.payeeIdentityKey), 10)} — ${asString(event.payload.memo)}`
    case 'approved':
      if (event.payload.p2msSignature) {
        return `${who} signed the vault spend for “${asString(event.payload.memo) || 'a payment'}”.`
      }
      return `${who} approved “${asString(event.payload.memo) || 'a payment'}”.`
    case 'paid':
      return `Paid ${asNumber(event.payload.amountSats).toLocaleString()} sats for “${asString(event.payload.memo)}”. txid ${asString(event.payload.txid).slice(0, 12)}…`
    default:
      return event.kind
  }
}

function maybeLockingScript(signers: Signer[], threshold: number): string | undefined {
  if (!signers.every((signer) => signer.derivedPubkey) || signers.length < 2) return undefined
  return p2msLock(signers.map((signer) => signer.derivedPubkey as string), threshold).toHex()
}

function findProposal(treasury: Treasury, proposalId: string): Proposal | undefined {
  return treasury.proposals.find((proposal) => proposal.id === proposalId)
}

export function reconstructTreasury(events: BoardEvent[]): Treasury | null {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at))
  let treasury: Treasury | null = null

  for (const event of ordered) {
    if (treasury && event.treasuryId !== treasury.id) continue

    if (event.kind === 'created') {
      const signerCount = asNumber(event.payload.signerCount) === 2 ? 2 : 3
      const invited = Array.isArray(event.payload.signers)
        ? event.payload.signers as Array<{ role?: unknown; identityKey?: unknown }>
        : []
      const signers: Signer[] = requiredRoles(signerCount).map((role) => {
        const match = invited.find((row) => row.role === role)
        return {
          role,
          identityKey: asString(match?.identityKey).toLowerCase()
        }
      })
      treasury = {
        id: event.treasuryId,
        name: asString(event.payload.name) || 'Treasury',
        threshold: 2,
        signers,
        vault: [],
        proposals: [],
        feed: [],
        createdAt: event.at,
        protocolID: PROTOCOL_ID
      }
    }

    if (!treasury) continue

    if (event.kind === 'joined') {
      const role = asRole(event.payload.role)
      if (role) {
        const slot = treasury.signers.find((signer) => signer.role === role)
        if (slot) {
          slot.identityKey = asString(event.payload.identityKey).toLowerCase()
          slot.derivedPubkey = asString(event.payload.derivedPubkey).toLowerCase()
          slot.joinedAt = event.at
        }
        treasury.lockingScriptHex = maybeLockingScript(treasury.signers, treasury.threshold)
      }
    }

    if (event.kind === 'funded') {
      const txid = asString(event.payload.txid).toLowerCase()
      const vout = asNumber(event.payload.vout)
      const satoshis = asNumber(event.payload.satoshis ?? event.payload.amountSats)
      const beef = asNumberArray(event.payload.beef ?? event.payload.beefHex)
      if (txid && Number.isInteger(vout) && satoshis > 0) {
        if (!treasury.vault.some((utxo) => utxo.txid === txid && utxo.vout === vout)) {
          treasury.vault.push({ txid, vout, satoshis, beef })
        }
      }
    }

    if (event.kind === 'proposed') {
      const id = asString(event.payload.proposalId)
      if (id && !findProposal(treasury, id)) {
        const identityKey = asString(event.payload.identityKey).toLowerCase()
        const role = asRole(event.payload.role) ?? 'treasurer'
        const proposal: Proposal = {
          id,
          amountSats: asNumber(event.payload.amountSats),
          payeeIdentityKey: asString(event.payload.payeeIdentityKey).toLowerCase(),
          memo: asString(event.payload.memo),
          payeeLockingScriptHex: asString(event.payload.payeeLockingScriptHex).toLowerCase(),
          vaultTxid: asString(event.payload.vaultTxid).toLowerCase(),
          vaultVout: asNumber(event.payload.vaultVout),
          vaultSatoshis: asNumber(event.payload.vaultSatoshis),
          feeSats: asNumber(event.payload.feeSats) || 100,
          changeSats: asNumber(event.payload.changeSats),
          createdAt: event.at,
          createdBy: identityKey,
          approvals: identityKey
            ? [{
              identityKey,
              role,
              derivedPubkey: asString(event.payload.derivedPubkey).toLowerCase(),
              signature: asNumberArray(event.payload.signature),
              at: event.at
            }]
            : [],
          p2msSigs: [],
          status: 'open'
        }
        if (thresholdMet(uniqueApprovers(proposal.approvals).length, treasury.threshold)) {
          proposal.status = 'approved'
        }
        treasury.proposals.unshift(proposal)
      }
    }

    if (event.kind === 'approved') {
      const proposal = findProposal(treasury, asString(event.payload.proposalId))
      const identityKey = asString(event.payload.identityKey).toLowerCase()
      const role = asRole(event.payload.role) ?? 'chair'
      const derivedPubkey = asString(event.payload.derivedPubkey).toLowerCase()
      if (proposal && identityKey) {
        if (event.payload.p2msSignature) {
          if (!proposal.p2msSigs.some((row) => row.identityKey === identityKey)) {
            proposal.p2msSigs.push({
              identityKey,
              role,
              derivedPubkey,
              signature: asNumberArray(event.payload.p2msSignature),
              at: event.at
            })
          }
        } else if (!proposal.approvals.some((row) => row.identityKey === identityKey)) {
          proposal.approvals.push({
            identityKey,
            role,
            derivedPubkey,
            signature: asNumberArray(event.payload.signature),
            at: event.at
          })
        }
        if (proposal.status !== 'paid' && thresholdMet(uniqueApprovers(proposal.approvals).length, treasury.threshold)) {
          proposal.status = 'approved'
        }
      }
    }

    if (event.kind === 'paid') {
      const proposal = findProposal(treasury, asString(event.payload.proposalId))
      if (proposal) {
        proposal.status = 'paid'
        proposal.txid = asString(event.payload.txid).toLowerCase()
        treasury.vault = treasury.vault.filter(
          (utxo) => !(utxo.txid === proposal.vaultTxid && utxo.vout === proposal.vaultVout)
        )
        const changeVout = event.payload.changeVout == null ? NaN : asNumber(event.payload.changeVout)
        const changeSats = asNumber(event.payload.changeSatoshis ?? event.payload.changeSats ?? proposal.changeSats)
        const beef = asNumberArray(event.payload.beef ?? event.payload.beefHex)
        if (proposal.txid && Number.isInteger(changeVout) && changeSats > 0) {
          treasury.vault.push({
            txid: proposal.txid,
            vout: changeVout,
            satoshis: changeSats,
            beef
          })
        }
      }
    }

    treasury.feed.unshift({
      id: `${event.kind}:${event.at}:${asString(event.payload.proposalId) || asString(event.payload.identityKey) || asString(event.payload.txid)}`,
      at: event.at,
      kind: event.kind,
      text: feedLine(event)
    })
  }

  return treasury
}

export function mergeEvents(existing: BoardEvent[], incoming: BoardEvent[]): BoardEvent[] {
  const seen = new Set<string>()
  const out: BoardEvent[] = []
  for (const event of [...existing, ...incoming]) {
    const key = `${event.treasuryId}:${event.kind}:${event.at}:${JSON.stringify(event.payload)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(event)
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}
