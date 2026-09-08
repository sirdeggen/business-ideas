import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  FEE_SATS,
  MAGIC,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  assertRights,
  assertWhat,
  assertWho,
  encodeReceiptFields,
  makeToken,
  nowIso
} from '../../../protocol/trace'
import { originator } from './config'
import { nudgeReceipt } from './messagebox'
import { submitReceiptTx, type OverlayReceipt } from './overlay'
import { cacheReceipt } from './persist'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface RegisterInput {
  what: string
  who: string
  rights: string
}

export interface RegisterResult {
  token: string
  what: string
  who: string
  rights: string
  feePaid: number
  txid: string
  overlayError?: string
}

function randomNonce(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

export function assertCanRegister(input: RegisterInput): {
  what: string
  who: string
  rights: string
} {
  return {
    what: assertWhat(input.what),
    who: assertWho(input.who),
    rights: assertRights(input.rights)
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
    throw Object.assign(new Error('Wallet did not return a receipt transaction'), { cause: response })
  }
  return { txid, tx }
}

export async function registerReceipt(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: RegisterInput,
  now = new Date()
): Promise<RegisterResult> {
  const { what, who, rights } = assertCanRegister(input)
  const timestamp = nowIso(now)
  const token = makeToken({
    what,
    who,
    rights,
    timestamp,
    nonce: randomNonce()
  })
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeReceiptFields({
        token,
        what,
        who,
        rights,
        feePaid: FEE_SATS,
        timestamp
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
    description: `Register receipt ${what}`,
    outputs: [
      {
        satoshis: FEE_SATS,
        lockingScript: p2pkhFromPublicKey(identityKey),
        outputDescription: `Trace fee for ${what}`
      },
      {
        satoshis: 1,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Trace receipt ${what}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          token
        }),
        tags: [BASKET, 'register', token]
      }
    ],
    labels: [BASKET, 'register'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  const published: OverlayReceipt = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    token,
    what,
    who,
    rights,
    feePaid: FEE_SATS,
    timestamp,
    txid,
    outputIndex: 1
  }
  cacheReceipt(published)
  await nudgeReceipt(wallet, identityKey, identityKey, {
    kind: 'register',
    token,
    what,
    txid
  })

  try {
    await submitReceiptTx(overlayUrl, tx)
    return { token, what, who, rights, feePaid: FEE_SATS, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      token,
      what,
      who,
      rights,
      feePaid: FEE_SATS,
      txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}
