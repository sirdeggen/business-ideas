import { PushDrop, type WalletClient } from '@bsv/sdk'
import { originator } from './config'
import {
  BASKET,
  PROTOCOL_ID,
  buildReceipt,
  canonicalReceiptBytes,
  isIdentityKey,
  purposeHash,
  receiptKeyID,
  utf8,
  verifyWalletDataSignature,
  type CanonicalReceipt,
  type GiftNotice
} from './protocol'

export async function lockPayeeOutput(
  wallet: WalletClient,
  orgIdentityKey: string,
  keyID: string,
  purpose: string
): Promise<string> {
  if (!isIdentityKey(orgIdentityKey)) {
    throw new Error('The desk identity is missing. Open the give link from the treasurer.')
  }
  const hash = purposeHash(purpose)
  const token = new PushDrop(wallet, originator())
  const script = await token.lock(
    [utf8(purpose.trim()), utf8(hash)],
    PROTOCOL_ID,
    keyID,
    orgIdentityKey.trim(),
    false,
    false
  )
  return script.toHex()
}

export async function sendGift(args: {
  wallet: WalletClient
  donorIdentityKey: string
  orgIdentityKey: string
  purpose: string
  amountUsd: string
  amountSats: number
  giftId: string
  donorName?: string
  orgName?: string
}): Promise<GiftNotice> {
  const purpose = args.purpose.trim()
  const hash = purposeHash(purpose)
  const lockingScript = await lockPayeeOutput(
    args.wallet,
    args.orgIdentityKey,
    args.giftId,
    purpose
  )
  const response = await args.wallet.createAction({
    description: `Gift: ${purpose}`.slice(0, 50),
    outputs: [{
      satoshis: args.amountSats,
      lockingScript,
      outputDescription: purpose.slice(0, 50),
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID: args.giftId,
        counterparty: args.orgIdentityKey.trim(),
        senderIdentityKey: args.donorIdentityKey
      })
    }],
    labels: ['grant receipt', 'gift'],
    options: { randomizeOutputs: false }
  })
  if (!response.txid) {
    throw new Error('Wallet did not return a gift transaction')
  }
  return {
    v: 1,
    kind: 'gift',
    giftId: args.giftId,
    purpose,
    purposeHash: hash,
    amountUsd: args.amountUsd,
    amountSats: args.amountSats,
    donorIdentityKey: args.donorIdentityKey,
    orgIdentityKey: args.orgIdentityKey.trim(),
    giftTxid: response.txid,
    keyID: args.giftId,
    beef: response.tx as number[] | undefined,
    donorName: args.donorName,
    orgName: args.orgName,
    at: new Date().toISOString()
  }
}

export async function internalizeGift(wallet: WalletClient, gift: GiftNotice): Promise<void> {
  if (!gift.beef || gift.beef.length === 0) return
  try {
    await wallet.internalizeAction({
      tx: gift.beef,
      outputs: [{
        outputIndex: 0,
        protocol: 'basket insertion',
        insertionRemittance: {
          basket: BASKET,
          customInstructions: JSON.stringify({
            protocolID: PROTOCOL_ID,
            keyID: gift.keyID || gift.giftId,
            counterparty: gift.donorIdentityKey
          }),
          tags: [BASKET, 'gift']
        }
      }],
      description: `Collect gift: ${gift.purpose}`.slice(0, 50)
    })
  } catch {
    // Ack and receipt do not depend on collecting the output first.
  }
}

export async function signReceipt(
  wallet: WalletClient,
  receipt: CanonicalReceipt
): Promise<{ signature: number[]; signingKey: string }> {
  const built = buildReceipt(receipt)
  const { signature } = await wallet.createSignature({
    data: canonicalReceiptBytes(built),
    protocolID: PROTOCOL_ID,
    keyID: receiptKeyID(built),
    counterparty: built.donorIdentityKey
  })
  const { publicKey: signingKey } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: receiptKeyID(built),
    counterparty: built.donorIdentityKey
  })
  return { signature, signingKey }
}

export async function verifyReceiptWithWallet(
  wallet: WalletClient,
  receipt: CanonicalReceipt,
  signature: number[]
): Promise<boolean> {
  const built = buildReceipt(receipt)
  const { publicKey } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: receiptKeyID(built),
    counterparty: built.orgIdentityKey,
    forSelf: false
  })
  return verifyWalletDataSignature(publicKey, canonicalReceiptBytes(built), signature)
}
