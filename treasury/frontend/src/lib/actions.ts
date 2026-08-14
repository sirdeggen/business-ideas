import {
  PushDrop,
  Transaction,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  assembleP2msUnlockingScript,
  canonicalProposalBytes,
  isIdentityKey,
  payeeMemoField,
  p2msSignData,
  vaultInstructions
} from '../../../protocol/treasury'
import type { Proposal, Treasury } from '../../../protocol/events'
import { originator } from './config'

export async function derivedVaultKey(wallet: WalletClient, keyID: string): Promise<string> {
  const { publicKey } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID,
    counterparty: 'self'
  })
  return publicKey
}

export async function signProposal(
  wallet: WalletClient,
  proposal: Parameters<typeof canonicalProposalBytes>[0],
  keyID = proposal.treasuryId
): Promise<number[]> {
  const { signature } = await wallet.createSignature({
    data: canonicalProposalBytes(proposal),
    protocolID: PROTOCOL_ID,
    keyID,
    counterparty: 'self'
  })
  return signature
}

export async function lockPayeeOutput(
  wallet: WalletClient,
  payeeIdentityKey: string,
  proposalId: string,
  memo: string
): Promise<string> {
  if (!isIdentityKey(payeeIdentityKey)) {
    throw new Error('Payee must be a 66-hex compressed identity key')
  }
  const token = new PushDrop(wallet, originator())
  const script = await token.lock(
    [payeeMemoField(memo)],
    PROTOCOL_ID,
    proposalId,
    payeeIdentityKey.trim(),
    false,
    false
  )
  return script.toHex()
}

export async function fundVault(
  wallet: WalletClient,
  treasury: Treasury,
  satoshis: number
): Promise<{ txid: string; vout: number; beef: number[]; satoshis: number }> {
  if (!treasury.lockingScriptHex) throw new Error('Wait until every signer has joined')
  if (satoshis < 1) throw new Error('Fund at least 1 sat')
  const pubkeys = treasury.signers.map((signer) => {
    if (!signer.derivedPubkey) throw new Error(`${signer.role} has not joined`)
    return signer.derivedPubkey
  })
  const response = await wallet.createAction({
    description: `Fund ${treasury.name}`.slice(0, 50),
    outputs: [{
      satoshis,
      lockingScript: treasury.lockingScriptHex,
      outputDescription: '2-of-n treasury vault',
      basket: BASKET,
      customInstructions: JSON.stringify(
        vaultInstructions(treasury.id, pubkeys, treasury.threshold)
      ),
      tags: [BASKET, 'vault']
    }],
    labels: [BASKET, 'fund'],
    options: { randomizeOutputs: false }
  })
  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a funding transaction')
  }
  const tx = Transaction.fromBEEF(response.tx as number[])
  const vout = tx.outputs.findIndex(
    (output) => output.lockingScript.toHex() === treasury.lockingScriptHex
  )
  return {
    txid: response.txid,
    vout: vout >= 0 ? vout : 0,
    beef: response.tx as number[],
    satoshis
  }
}

function vaultFor(proposal: Proposal, treasury: Treasury) {
  const utxo = treasury.vault.find(
    (item) => item.txid === proposal.vaultTxid && item.vout === proposal.vaultVout
  )
  if (!utxo) throw new Error('Vault UTXO for this proposal is gone')
  if (!treasury.lockingScriptHex) throw new Error('Vault locking script missing')
  return utxo
}

export async function signVaultSpend(
  wallet: WalletClient,
  treasury: Treasury,
  proposal: Proposal,
  keyID = treasury.id
): Promise<number[]> {
  const plan = {
    sourceTXID: proposal.vaultTxid,
    sourceOutputIndex: proposal.vaultVout,
    sourceSatoshis: proposal.vaultSatoshis,
    vaultLockingScriptHex: treasury.lockingScriptHex as string,
    payeeLockingScriptHex: proposal.payeeLockingScriptHex,
    amountSats: proposal.amountSats,
    changeSats: proposal.changeSats,
    feeSats: proposal.feeSats
  }
  const { signature } = await wallet.createSignature({
    data: p2msSignData(plan),
    protocolID: PROTOCOL_ID,
    keyID,
    counterparty: 'self'
  })
  return signature
}

export async function broadcastVaultSpend(
  wallet: WalletClient,
  treasury: Treasury,
  proposal: Proposal
): Promise<{ txid: string; tx: number[]; changeVout?: number }> {
  const utxo = vaultFor(proposal, treasury)
  const pubkeys = treasury.signers.map((signer) => signer.derivedPubkey as string)
  const signaturesByPubkey: Record<string, number[]> = {}
  for (const row of proposal.p2msSigs) {
    signaturesByPubkey[row.derivedPubkey] = row.signature
  }
  const unlocking = assembleP2msUnlockingScript({
    pubkeys,
    signaturesByPubkey,
    threshold: treasury.threshold
  })
  const outputs: Array<{
    satoshis: number
    lockingScript: string
    outputDescription: string
    basket?: string
    customInstructions?: string
    tags?: string[]
  }> = [{
    satoshis: proposal.amountSats,
    lockingScript: proposal.payeeLockingScriptHex,
    outputDescription: proposal.memo.slice(0, 50)
  }]
  if (proposal.changeSats > 0 && treasury.lockingScriptHex) {
    outputs.push({
      satoshis: proposal.changeSats,
      lockingScript: treasury.lockingScriptHex,
      outputDescription: 'treasury change',
      basket: BASKET,
      customInstructions: JSON.stringify(
        vaultInstructions(treasury.id, pubkeys, treasury.threshold)
      ),
      tags: [BASKET, 'change']
    })
  }

  const response = await wallet.createAction({
    description: `Pay ${proposal.memo}`.slice(0, 50),
    inputBEEF: utxo.beef,
    inputs: [{
      outpoint: `${proposal.vaultTxid}.${proposal.vaultVout}`,
      unlockingScript: unlocking.toHex(),
      inputDescription: '2-of-n treasury vault'
    }],
    outputs,
    labels: [BASKET, 'pay'],
    options: { randomizeOutputs: false, signAndProcess: true }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a payment transaction')
  }

  const tx = Transaction.fromBEEF(response.tx as number[])
  const changeVout = proposal.changeSats > 0
    ? tx.outputs.findIndex((output) =>
      output.satoshis === proposal.changeSats &&
      output.lockingScript.toHex() === treasury.lockingScriptHex
    )
    : -1

  return {
    txid: response.txid,
    tx: response.tx as number[],
    changeVout: changeVout >= 0 ? changeVout : undefined
  }
}

export { isIdentityKey }
