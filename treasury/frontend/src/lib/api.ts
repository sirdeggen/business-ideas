import type { Role } from '../../../protocol/treasury'

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
  kind: string
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

function feedUrl(base: string): string {
  return base.replace(/\/$/, '')
}

async function parse<T>(response: Response): Promise<T> {
  const raw: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = (raw as { error?: string } | undefined)?.error
    throw new Error(message || `Feed request failed (${response.status})`)
  }
  return raw as T
}

export async function pingFeed(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${feedUrl(base)}/health`)
    return response.ok
  } catch {
    return false
  }
}

export async function createTreasury(
  base: string,
  body: {
    name: string
    signerCount: 2 | 3
    signers: Array<{ role: Role; identityKey?: string }>
  }
): Promise<Treasury> {
  const response = await fetch(`${feedUrl(base)}/treasuries`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parse<Treasury>(response)
}

export async function getTreasury(base: string, id: string): Promise<Treasury> {
  const response = await fetch(`${feedUrl(base)}/treasuries/${id}`)
  return parse<Treasury>(response)
}

export async function joinTreasury(
  base: string,
  id: string,
  body: { role: Role; identityKey: string; derivedPubkey: string }
): Promise<Treasury> {
  const response = await fetch(`${feedUrl(base)}/treasuries/${id}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parse<Treasury>(response)
}

export async function recordFund(
  base: string,
  id: string,
  body: { txid: string; vout: number; satoshis: number; beef: number[] }
): Promise<Treasury> {
  const response = await fetch(`${feedUrl(base)}/treasuries/${id}/fund`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parse<Treasury>(response)
}

export async function postProposal(
  base: string,
  id: string,
  body: Record<string, unknown>
): Promise<Treasury> {
  const response = await fetch(`${feedUrl(base)}/treasuries/${id}/proposals`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parse<Treasury>(response)
}

export async function postApproval(
  base: string,
  id: string,
  proposalId: string,
  body: { identityKey: string; derivedPubkey: string; signature: number[] }
): Promise<Treasury> {
  const response = await fetch(`${feedUrl(base)}/treasuries/${id}/proposals/${proposalId}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parse<Treasury>(response)
}

export async function postP2msSig(
  base: string,
  id: string,
  proposalId: string,
  body: { identityKey: string; derivedPubkey: string; signature: number[] }
): Promise<Treasury> {
  const response = await fetch(`${feedUrl(base)}/treasuries/${id}/proposals/${proposalId}/p2ms-sig`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parse<Treasury>(response)
}

export async function postPaid(
  base: string,
  id: string,
  proposalId: string,
  body: { txid: string; changeVout?: number; beef?: number[] }
): Promise<Treasury> {
  const response = await fetch(`${feedUrl(base)}/treasuries/${id}/proposals/${proposalId}/paid`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return parse<Treasury>(response)
}

export function exportCsvUrl(base: string, id: string, month: string): string {
  return `${feedUrl(base)}/treasuries/${id}/export.csv?month=${month}`
}

export function exportPdfUrl(base: string, id: string, month: string): string {
  return `${feedUrl(base)}/treasuries/${id}/export.pdf?month=${month}`
}
