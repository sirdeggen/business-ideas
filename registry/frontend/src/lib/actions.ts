import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  ATTEST_SATS,
  BASKET,
  ISSUE_SATS,
  PROTOCOL_ID,
  REGISTER_SATS,
  TRANSFER_FEE_SATS,
  assertName,
  assertNote,
  assertUnitLabel,
  buildReading,
  encodeIssueFields,
  encodeRegisterFields,
  encodeTransferFields,
  foldRegister,
  holderBalance,
  isAdmin,
  makeIssueId,
  makeTransferId,
  newRegisterId,
  nowIso,
  parseTotalUnits,
  parseUnits,
  readingSlug,
  resolveHolderRef,
  type HoldingLine,
  type RegisterReading,
  type RegisterRecord
} from '../../../protocol/registry'
import { originator } from './config'
import { NEED_HOLDER, NOT_ADMIN, NOT_ENOUGH } from './copy'
import { nudgeRegistry } from './messagebox'
import { submitRegistryTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface CreateInput {
  name: string
  unitLabel: string
  totalUnits: string
  aumNote: string
}

export interface IssueInput {
  holder: string
  units: string
}

export interface TransferInput {
  from: string
  to: string
  units: string
}

export interface PreparedCreate {
  name: string
  unitLabel: string
  totalUnits: number | null
  aumNote: string
}

export interface PreparedIssue {
  holder: string
  units: number
}

export interface PreparedTransfer {
  from: string
  to: string
  units: number
  protocolFeeSats: number
}

export interface CreateResult {
  registerId: string
  txid: string
  overlayError?: string
}

export interface IssueResult {
  registerId: string
  issueId: string
  txid: string
  overlayError?: string
}

export interface TransferResult {
  registerId: string
  transferId: string
  txid: string
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

export function assertCanCreate(input: CreateInput): PreparedCreate {
  return {
    name: assertName(input.name, 'Register name'),
    unitLabel: assertUnitLabel(input.unitLabel),
    totalUnits: parseTotalUnits(input.totalUnits),
    aumNote: assertNote(input.aumNote)
  }
}

export function assertCanIssue(
  register: Pick<RegisterRecord, 'admin' | 'totalUnits'>,
  identityKey: string,
  input: IssueInput,
  issuedUnits: number
): PreparedIssue {
  if (!isAdmin(register, identityKey)) throw new Error(NOT_ADMIN)
  const holder = resolveHolderRef(input.holder)
  if (!holder) throw new Error(NEED_HOLDER)
  const units = parseUnits(input.units)
  if (units === null) throw new Error('Units must be a whole number.')
  if (register.totalUnits !== null && issuedUnits + units > register.totalUnits) {
    throw new Error('That issue would pass the register total.')
  }
  return { holder, units }
}

export function assertCanTransfer(
  register: Pick<RegisterRecord, 'admin'>,
  holdings: HoldingLine[],
  actor: string,
  input: TransferInput
): PreparedTransfer {
  const units = parseUnits(input.units)
  if (units === null) throw new Error('Units must be a whole number.')
  const from = input.from.trim() ? resolveHolderRef(input.from) : actor
  if (!from) throw new Error(NEED_HOLDER)
  const to = resolveHolderRef(input.to)
  if (!to) throw new Error(NEED_HOLDER)
  if (from.toLowerCase() === to.toLowerCase()) throw new Error('Pick a different holder.')
  if (from.toLowerCase() !== actor.toLowerCase() && !isAdmin(register, actor)) {
    throw new Error('Only the admin can move another holder’s units.')
  }
  if (holderBalance(holdings, from) < units) throw new Error(NOT_ENOUGH)
  return {
    from,
    to,
    units,
    protocolFeeSats: TRANSFER_FEE_SATS
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

export async function createRegister(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: CreateInput
): Promise<CreateResult> {
  const ready = assertCanCreate(input)
  const createdAt = nowIso()
  const registerId = newRegisterId()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeRegisterFields({
        registerId,
        name: ready.name,
        unitLabel: ready.unitLabel,
        totalUnits: ready.totalUnits,
        aumNote: ready.aumNote,
        admin: identityKey,
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
    description: `Create register: ${ready.name}`,
    outputs: [{
      satoshis: REGISTER_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: ready.name,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        registerId
      }),
      tags: [BASKET, 'register', registerId]
    }],
    labels: [BASKET, 'create'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  try {
    await submitRegistryTx(overlayUrl, tx)
    return { registerId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      registerId,
      txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function issueUnits(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  register: RegisterRecord,
  input: IssueInput,
  issuedUnits: number
): Promise<IssueResult> {
  const ready = assertCanIssue(register, identityKey, input, issuedUnits)
  const issuedAt = nowIso()
  const issueId = makeIssueId(register.registerId, ready.holder, ready.units, issuedAt, randomNonce())
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeIssueFields({
        registerId: register.registerId,
        issueId,
        holder: ready.holder,
        units: ready.units,
        admin: identityKey,
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
    description: `Issue units: ${register.name}`,
    outputs: [{
      satoshis: ISSUE_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Issue ${ready.units} ${register.unitLabel}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        registerId: register.registerId,
        issueId
      }),
      tags: [BASKET, 'issue', register.registerId]
    }],
    labels: [BASKET, 'issue'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  await nudgeRegistry(wallet, identityKey, ready.holder, {
    kind: 'issue',
    registerId: register.registerId,
    txid
  })
  try {
    await submitRegistryTx(overlayUrl, tx)
    return { registerId: register.registerId, issueId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      registerId: register.registerId,
      issueId,
      txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function transferUnits(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  register: RegisterRecord,
  holdings: HoldingLine[],
  input: TransferInput
): Promise<TransferResult> {
  const ready = assertCanTransfer(register, holdings, identityKey, input)
  const transferredAt = nowIso()
  const transferId = makeTransferId(
    register.registerId,
    ready.from,
    ready.to,
    ready.units,
    transferredAt,
    randomNonce()
  )
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeTransferFields({
        registerId: register.registerId,
        transferId,
        from: ready.from,
        to: ready.to,
        units: ready.units,
        feeSats: ready.protocolFeeSats,
        protocolFeeSats: ready.protocolFeeSats,
        actor: identityKey,
        transferredAt
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
    description: `Transfer units: ${register.name}`,
    outputs: [
      {
        satoshis: ready.protocolFeeSats,
        lockingScript: p2pkhFromPublicKey(register.admin),
        outputDescription: `Registry protocol fee for ${register.name}`
      },
      {
        satoshis: ATTEST_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Transfer attestation ${register.name}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          registerId: register.registerId,
          transferId
        }),
        tags: [BASKET, 'transfer', register.registerId]
      }
    ],
    labels: [BASKET, 'transfer'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  await nudgeRegistry(wallet, identityKey, ready.to, {
    kind: 'transfer',
    registerId: register.registerId,
    txid
  })
  try {
    await submitRegistryTx(overlayUrl, tx)
    return {
      registerId: register.registerId,
      transferId,
      txid,
      protocolFeeSats: ready.protocolFeeSats
    }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      registerId: register.registerId,
      transferId,
      txid,
      protocolFeeSats: ready.protocolFeeSats,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export function downloadReading(register: RegisterRecord, holdings: HoldingLine[], issuedUnits: number, transferCount: number): RegisterReading {
  const reading = buildReading(
    register,
    {
      holdings,
      issuedUnits,
      acceptedTransfers: transferCount,
      skippedIssues: 0,
      skippedTransfers: 0
    },
    nowIso()
  )
  const body = JSON.stringify(reading, null, 2)
  const blob = new Blob([body], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `${readingSlug(register.name)}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
  return reading
}

export { foldRegister }
