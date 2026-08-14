/**
 * Public board API. Shared state is overlay-us-1 (tm_anytx / ls_anytx).
 * Propose / approve also go through Message Box at gmb.bsvblockchain.tech.
 * Express is not on this path.
 */
import { Utils, type WalletClient } from '@bsv/sdk'
import {
  makeEvent,
  reconstructTreasury,
  type Approval,
  type BoardEvent,
  type FeedEvent,
  type P2msSig,
  type Proposal,
  type Treasury
} from '../../../protocol/events'
import { FEE_SATS, PROTOCOL_ID, planSpend, type Role } from '../../../protocol/treasury'
import { notifySigners } from './messagebox'
import { loadTreasury, pingOverlay as pingOverlayHost, publishBoardEvent, rememberEvents } from './overlay'

export type { Approval, FeedEvent, P2msSig, Proposal, Treasury }
export { pingOverlayHost as pingOverlay }

function beefHex(bytes: number[]): string {
  return Utils.toHex(bytes)
}

function signerRole(treasury: Treasury, identityKey: string): Role {
  const seat = treasury.signers.find(
    (signer) => signer.identityKey && signer.identityKey.toLowerCase() === identityKey.toLowerCase()
  )
  if (!seat) throw new Error('Only a joined signer can do that')
  return seat.role
}

function pickVault(treasury: Treasury, amountSats: number) {
  const need = amountSats + FEE_SATS
  const utxo = [...treasury.vault].reverse().find((item) => item.satoshis >= need)
  if (!utxo) {
    throw new Error(
      treasury.vault.length === 0
        ? 'Fund the vault before proposing a payment'
        : `No vault UTXO covers ${need.toLocaleString()} sats (amount + ${FEE_SATS} fee)`
    )
  }
  return utxo
}

async function applyEvent(
  wallet: WalletClient,
  treasury: Treasury,
  event: BoardEvent,
  notify: boolean
): Promise<Treasury> {
  await publishBoardEvent(wallet, event)
  const events = rememberEvents(treasury.id, [event])
  if (notify) {
    const self = typeof event.payload.identityKey === 'string' ? event.payload.identityKey : ''
    if (self) await notifySigners(wallet, treasury, self, event)
  }
  const next = reconstructTreasury(events)
  if (!next) throw new Error('failed to reconstruct treasury after overlay event')
  return next
}

export async function getTreasury(id: string): Promise<Treasury | null> {
  return loadTreasury(id)
}

export async function createTreasury(
  wallet: WalletClient,
  body: {
    name: string
    signerCount: 2 | 3
    treasurerIdentityKey: string
    signers: Array<{ role: Role; identityKey?: string }>
  }
): Promise<Treasury> {
  const treasuryId = crypto.randomUUID()
  const { publicKey } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: treasuryId,
    counterparty: 'self'
  })
  const created = makeEvent(treasuryId, 'created', {
    name: body.name,
    threshold: 2,
    signerCount: body.signerCount,
    identityKey: body.treasurerIdentityKey,
    derivedPubkey: publicKey,
    signers: body.signers
  })
  const joined = makeEvent(treasuryId, 'joined', {
    role: 'treasurer',
    identityKey: body.treasurerIdentityKey,
    derivedPubkey: publicKey
  })
  await publishBoardEvent(wallet, created)
  await publishBoardEvent(wallet, joined)
  const next = reconstructTreasury(rememberEvents(treasuryId, [created, joined]))
  if (!next) throw new Error('failed to reconstruct treasury after create')
  return next
}

export async function joinTreasury(
  wallet: WalletClient,
  treasury: Treasury,
  body: { role: Role; identityKey: string; derivedPubkey: string }
): Promise<Treasury> {
  return applyEvent(wallet, treasury, makeEvent(treasury.id, 'joined', { ...body }), false)
}

export async function recordFund(
  wallet: WalletClient,
  treasury: Treasury,
  funded: { satoshis: number; txid: string; vout: number; beef: number[]; lockingScriptHex: string }
): Promise<Treasury> {
  return applyEvent(wallet, treasury, makeEvent(treasury.id, 'funded', {
    satoshis: funded.satoshis,
    amountSats: funded.satoshis,
    txid: funded.txid,
    vout: funded.vout,
    lockingScriptHex: funded.lockingScriptHex,
    beefHex: beefHex(funded.beef)
  }), false)
}

export async function postProposal(
  wallet: WalletClient,
  treasury: Treasury,
  body: {
    proposalId: string
    amountSats: number
    payeeIdentityKey: string
    memo: string
    payeeLockingScriptHex: string
    identityKey: string
    derivedPubkey: string
    signature: number[]
  }
): Promise<Treasury> {
  const role = signerRole(treasury, body.identityKey)
  const utxo = pickVault(treasury, body.amountSats)
  const planned = planSpend({ vaultSatoshis: utxo.satoshis, amountSats: body.amountSats })
  return applyEvent(wallet, treasury, makeEvent(treasury.id, 'proposed', {
    ...body,
    role,
    vaultTxid: utxo.txid,
    vaultVout: utxo.vout,
    vaultSatoshis: utxo.satoshis,
    feeSats: planned.feeSats,
    changeSats: planned.changeSats
  }), true)
}

export async function postApproval(
  wallet: WalletClient,
  treasury: Treasury,
  body: {
    proposalId: string
    identityKey: string
    derivedPubkey: string
    signature: number[]
    memo?: string
  }
): Promise<Treasury> {
  return applyEvent(wallet, treasury, makeEvent(treasury.id, 'approved', {
    ...body,
    role: signerRole(treasury, body.identityKey)
  }), true)
}

export async function postP2msSig(
  wallet: WalletClient,
  treasury: Treasury,
  body: {
    proposalId: string
    identityKey: string
    derivedPubkey: string
    signature: number[]
    memo?: string
  }
): Promise<Treasury> {
  return applyEvent(wallet, treasury, makeEvent(treasury.id, 'approved', {
    proposalId: body.proposalId,
    identityKey: body.identityKey,
    derivedPubkey: body.derivedPubkey,
    role: signerRole(treasury, body.identityKey),
    p2msSignature: body.signature,
    memo: body.memo
  }), true)
}

export async function postPaid(
  wallet: WalletClient,
  treasury: Treasury,
  body: { proposalId: string; txid: string; changeVout?: number; beef: number[] }
): Promise<Treasury> {
  const proposal = treasury.proposals.find((item) => item.id === body.proposalId)
  return applyEvent(wallet, treasury, makeEvent(treasury.id, 'paid', {
    proposalId: body.proposalId,
    txid: body.txid,
    amountSats: proposal?.amountSats,
    memo: proposal?.memo,
    changeVout: body.changeVout,
    changeSatoshis: proposal?.changeSats,
    changeSats: proposal?.changeSats,
    beefHex: beefHex(body.beef)
  }), false)
}
