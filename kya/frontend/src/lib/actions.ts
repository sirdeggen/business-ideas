import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  BIND_SATS,
  CREDENTIAL_SATS,
  DEFAULT_VERIFY_SATS,
  PROTOCOL_ID,
  RECEIPT_SATS,
  assertName,
  assertVerifySats,
  canIssue,
  canVerify,
  encodeBindFields,
  encodeCredentialFields,
  encodeReceiptFields,
  isOwner,
  kyaStatus,
  makeCredentialId,
  newAgentId,
  nowIso,
  protocolFeeSats
} from '../../../protocol/kya'
import { originator } from './config'
import { NO_CREDENTIAL, NOT_OWNER } from './copy'
import { nudgeKya } from './messagebox'
import { submitKyaTx, type OverlayBind, type OverlayCredential } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface RegisterInput {
  agentName: string
  ownerName: string
}

export interface RegisterResult {
  agentId: string
  txid: string
  overlayError?: string
}

export interface IssueResult {
  agentId: string
  credentialId: string
  txid: string
  overlayError?: string
}

export interface VerifyInput {
  feeSats: number
  verifierName: string
}

export interface VerifyResult {
  agentId: string
  txid: string
  feeSats: number
  protocolFeeSats: number
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function randomNonce(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toHex(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

export function assertCanRegister(input: RegisterInput): RegisterInput {
  return {
    agentName: assertName(input.agentName, 'Agent name'),
    ownerName: assertName(input.ownerName, 'Owner name')
  }
}

export function assertCanIssue(bind: OverlayBind, identityKey: string): void {
  const status = kyaStatus({ bind })
  if (!canIssue(status)) throw new Error('This agent already has a credential.')
  if (!isOwner(bind, identityKey)) throw new Error(NOT_OWNER)
}

export function assertCanVerify(
  bind: OverlayBind,
  credential: OverlayCredential | null,
  input: VerifyInput
): { feeSats: number, protocolFeeSats: number, verifierName: string } {
  const status = kyaStatus({ bind, credential: credential ?? undefined })
  if (!canVerify(status) || !credential) throw new Error(NO_CREDENTIAL)
  assertVerifySats(input.feeSats)
  return {
    feeSats: input.feeSats,
    protocolFeeSats: protocolFeeSats(input.feeSats),
    verifierName: input.verifierName.trim()
  }
}

async function finishAction(
  wallet: WalletClient,
  response: Awaited<ReturnType<WalletClient['createAction']>>
): Promise<{ txid: string, tx: number[] }> {
  let txid = response.txid
  let tx = response.tx as number[] | undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
    tx = signed.tx as number[] | undefined
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a transaction'), { cause: response })
  }
  return { txid, tx }
}

async function overlayOrError(
  overlayUrl: string,
  tx: number[],
  agentId: string,
  txid: string,
  extra: Record<string, unknown> = {}
): Promise<RegisterResult & IssueResult & VerifyResult> {
  try {
    await submitKyaTx(overlayUrl, tx)
    return { agentId, txid, credentialId: '', feeSats: 0, protocolFeeSats: 0, ...extra }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      agentId,
      txid,
      credentialId: '',
      feeSats: 0,
      protocolFeeSats: 0,
      overlayError: detail.trim() || 'overlay submit failed with no message',
      ...extra
    }
  }
}

export async function registerAgent(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: RegisterInput
): Promise<RegisterResult> {
  const ready = assertCanRegister(input)
  const agentId = newAgentId()
  const createdAt = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeBindFields({
        agentId,
        agentName: ready.agentName,
        ownerName: ready.ownerName,
        ownerIdentity: identityKey,
        createdAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Register agent: ${ready.agentName}`,
    outputs: [{
      satoshis: BIND_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: ready.agentName,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        agentId
      }),
      tags: [BASKET, 'bind', agentId]
    }],
    labels: [BASKET, 'register'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  return overlayOrError(overlayUrl, tx, agentId, txid)
}

export async function issueCredential(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  bind: OverlayBind
): Promise<IssueResult> {
  assertCanIssue(bind, identityKey)
  const issuedAt = nowIso()
  const credentialId = makeCredentialId(bind.agentId, identityKey, issuedAt, randomNonce())
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeCredentialFields({
        agentId: bind.agentId,
        credentialId,
        ownerIdentity: identityKey,
        issuedAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Issue KYA: ${bind.agentName}`,
    outputs: [{
      satoshis: CREDENTIAL_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Credential ${bind.agentName}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        agentId: bind.agentId,
        credentialId
      }),
      tags: [BASKET, 'credential', bind.agentId]
    }],
    labels: [BASKET, 'issue'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  await nudgeKya(wallet, identityKey, bind.ownerIdentity, {
    kind: 'credential',
    agentId: bind.agentId,
    txid
  })
  return overlayOrError(overlayUrl, tx, bind.agentId, txid, { credentialId })
}

export async function verifyAgent(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  bind: OverlayBind,
  credential: OverlayCredential,
  input: VerifyInput = { feeSats: DEFAULT_VERIFY_SATS, verifierName: '' }
): Promise<VerifyResult> {
  const ready = assertCanVerify(bind, credential, input)
  const verifiedAt = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeReceiptFields({
        agentId: bind.agentId,
        credentialId: credential.credentialId,
        verifierIdentity: identityKey,
        verifierName: ready.verifierName,
        feeSats: ready.feeSats,
        protocolFeeSats: ready.protocolFeeSats,
        verifiedAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Verify agent: ${bind.agentName}`,
    outputs: [
      {
        satoshis: ready.feeSats,
        lockingScript: p2pkhFromPublicKey(identityKey),
        outputDescription: `Verify fee for ${bind.agentName}`
      },
      {
        satoshis: ready.protocolFeeSats,
        lockingScript: p2pkhFromPublicKey(identityKey),
        outputDescription: `KYA protocol fee for ${bind.agentName}`
      },
      {
        satoshis: RECEIPT_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `KYA receipt ${bind.agentName}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          agentId: bind.agentId,
          credentialId: credential.credentialId
        }),
        tags: [BASKET, 'receipt', bind.agentId]
      }
    ],
    labels: [BASKET, 'verify'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  await nudgeKya(wallet, identityKey, bind.ownerIdentity, {
    kind: 'receipt',
    agentId: bind.agentId,
    txid
  })
  return overlayOrError(overlayUrl, tx, bind.agentId, txid, {
    feeSats: ready.feeSats,
    protocolFeeSats: ready.protocolFeeSats
  })
}
