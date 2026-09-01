import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  MAGIC,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  assertName,
  assertPeriodDays,
  decideLease,
  encodeLeaseFields,
  extendExpiry,
  leasePriceSats,
  type PeriodDays
} from '../../../protocol/namelease'
import { originator } from './config'
import { nudgeLease } from './messagebox'
import { lookupName, submitLeaseTx, type OverlayLease } from './overlay'
import { cacheLease } from './persist'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface LeaseInput {
  name: string
  periodDays: number
}

export interface LeaseResult {
  name: string
  kind: 'register' | 'renew'
  txid: string
  expiresAt: string
  amountSats: number
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function nowIso(now = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

export function assertCanLease(input: LeaseInput): { name: string, periodDays: PeriodDays } {
  return {
    name: assertName(input.name),
    periodDays: assertPeriodDays(input.periodDays)
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
    throw Object.assign(new Error('Wallet did not return a lease transaction'), { cause: response })
  }
  return { txid, tx }
}

export async function leaseName(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: LeaseInput,
  known: OverlayLease | null = null,
  now = new Date()
): Promise<LeaseResult> {
  const { name, periodDays } = assertCanLease(input)
  const live = await lookupName(overlayUrl, name, now).catch(() => ({
    name,
    lease: known,
    fromCache: Boolean(known)
  }))
  const current = live.lease
  const decision = decideLease({
    current,
    lessee: identityKey,
    now
  })
  if (!decision.ok) throw new Error(decision.reason)

  const amountSats = leasePriceSats(name, periodDays)
  const registeredAt = nowIso(now)
  const expiresAt = extendExpiry(
    decision.kind === 'renew' ? decision.previousExpiry : null,
    periodDays,
    now
  )
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeLeaseFields({
        kind: decision.kind,
        name,
        lessee: identityKey,
        registeredAt,
        expiresAt,
        periodDays,
        amountSats,
        previousExpiry: decision.kind === 'renew' ? decision.previousExpiry : undefined
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
    description: decision.kind === 'renew'
      ? `Renew ${name} for ${periodDays} days`
      : `Lease ${name} for ${periodDays} days`,
    outputs: [
      {
        satoshis: amountSats,
        lockingScript: p2pkhFromPublicKey(identityKey),
        outputDescription: `Lease fee for ${name}`
      },
      {
        satoshis: 1,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Name lease ${name}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          name
        }),
        tags: [BASKET, decision.kind, name]
      }
    ],
    labels: [BASKET, decision.kind],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  const published: OverlayLease = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: decision.kind,
    name,
    lessee: identityKey,
    registeredAt,
    expiresAt,
    periodDays,
    amountSats,
    previousExpiry: decision.kind === 'renew' ? decision.previousExpiry : undefined,
    txid,
    outputIndex: 1
  }
  cacheLease(published)
  await nudgeLease(wallet, identityKey, identityKey, {
    kind: decision.kind,
    name,
    expiresAt,
    txid
  })

  try {
    await submitLeaseTx(overlayUrl, tx)
    return { name, kind: decision.kind, txid, expiresAt, amountSats }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      name,
      kind: decision.kind,
      txid,
      expiresAt,
      amountSats,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}
