import {
  P2PKH,
  PublicKey,
  PushDrop,
  Transaction,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  BRC29_PROTOCOL_ID,
  PROTOCOL_ID,
  assertAmountSats,
  assertMemo,
  assertPayable,
  encodeInvoiceFields,
  encodeReceiptFields,
  isIsoDate,
  newInvoiceId,
  findPaymentOutputIndex,
  parseInvoiceFields,
  parseReceiptFields
} from '../../../protocol/invoice'
import { originator } from './config'
import { lookupInvoices, submitInvoiceTx, type OverlayInvoice } from './overlay'

export interface PaymentPackage {
  tx: number[]
  txid: string
  invoiceId: string
  paymentOutputIndex: number
  derivationPrefix: string
  derivationSuffix: string
  senderIdentityKey: string
  amountSats: number
  memo: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

export async function createInvoice(
  wallet: WalletClient,
  overlayUrl: string,
  input: { amountSats: number, memo: string, dueDate: string }
): Promise<{ txid: string, invoiceId: string, outpoint: string }> {
  assertAmountSats(input.amountSats)
  assertMemo(input.memo)
  if (!isIsoDate(input.dueDate)) throw new Error('Due date must be YYYY-MM-DD')

  const { publicKey: payeeIdentity } = await wallet.getPublicKey({ identityKey: true })
  const invoiceId = newInvoiceId()
  const createdAt = new Date().toISOString()
  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    encodeInvoiceFields({
      invoiceId,
      payeeIdentity,
      amountSats: input.amountSats,
      memo: input.memo,
      dueDate: input.dueDate,
      createdAt
    }),
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description: `Create invoice ${invoiceId}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Invoice ${invoiceId}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'open', invoiceId]
    }],
    labels: [BASKET, 'create'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a created invoice transaction')
  }

  const submitted = await submitInvoiceTx(overlayUrl, response.tx as number[])
  if (submitted.admitted.length === 0) {
    throw new Error('Overlay rejected the invoice (no outputs admitted)')
  }

  const outputIndex = invoiceOutputIndex(Transaction.fromBEEF(response.tx as number[]))
  return {
    txid: response.txid,
    invoiceId,
    outpoint: `${response.txid}.${outputIndex}`
  }
}

export async function payInvoice(
  wallet: WalletClient,
  overlayUrl: string,
  invoice: OverlayInvoice
): Promise<PaymentPackage> {
  const live = await lookupInvoices(overlayUrl, { invoiceId: invoice.invoiceId, forPay: true })
  const open = live[0]
  assertPayable(open)

  const { publicKey: payerIdentity } = await wallet.getPublicKey({ identityKey: true })
  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL_ID,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: open.payeeIdentity,
    forSelf: false
  })

  const paymentScript = p2pkhFromPublicKey(derived)
  const receiptKeyId = randomKeyId()
  const receiptScript = await pushdrop(wallet).lock(
    encodeReceiptFields({
      invoiceId: open.invoiceId,
      payeeIdentity: open.payeeIdentity,
      payerIdentity,
      amountSats: open.amountSats,
      invoiceOutpoint: `${open.txid}.${open.outputIndex}`,
      remittance: {
        derivationPrefix,
        derivationSuffix,
        paymentOutputIndex: 0
      }
    }),
    PROTOCOL_ID,
    receiptKeyId,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description: `Pay invoice ${open.invoiceId}`,
    outputs: [
      {
        satoshis: open.amountSats,
        lockingScript: paymentScript,
        outputDescription: `BRC-29 payment for invoice ${open.invoiceId}`,
        customInstructions: JSON.stringify({
          derivationPrefix,
          derivationSuffix,
          payee: open.payeeIdentity
        })
      },
      {
        satoshis: 1,
        lockingScript: receiptScript.toHex(),
        outputDescription: `Receipt for invoice ${open.invoiceId}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID: receiptKeyId,
          counterparty: 'self'
        }),
        tags: [BASKET, 'paid', open.invoiceId]
      }
    ],
    labels: [BASKET, 'pay', open.invoiceId],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a payment transaction')
  }

  const submitted = await submitInvoiceTx(overlayUrl, response.tx as number[])
  if (submitted.admitted.length === 0) {
    throw new Error('Overlay rejected the payment (already paid or malformed)')
  }

  const paidTx = Transaction.fromBEEF(response.tx as number[])
  return {
    tx: response.tx as number[],
    txid: response.txid,
    invoiceId: open.invoiceId,
    paymentOutputIndex: paymentOutputIndex(paidTx, open.amountSats),
    derivationPrefix,
    derivationSuffix,
    senderIdentityKey: payerIdentity,
    amountSats: open.amountSats,
    memo: open.memo
  }
}

export async function acceptPayment(
  wallet: WalletClient,
  pack: PaymentPackage
): Promise<void> {
  await wallet.internalizeAction({
    tx: pack.tx,
    outputs: [{
      outputIndex: pack.paymentOutputIndex,
      protocol: 'wallet payment',
      paymentRemittance: {
        derivationPrefix: pack.derivationPrefix,
        derivationSuffix: pack.derivationSuffix,
        senderIdentityKey: pack.senderIdentityKey
      }
    }],
    description: `Accept payment for invoice ${pack.invoiceId}`
  })
}

export function parsePaymentPackage(raw: string): PaymentPackage {
  const parsed = JSON.parse(raw) as PaymentPackage
  if (!Array.isArray(parsed.tx) || !parsed.invoiceId || !parsed.derivationPrefix || !parsed.txid) {
    throw new Error('Not an invoice payment package')
  }
  return parsed
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function paymentOutputIndex(tx: Transaction, amountSats: number): number {
  const satoshis = tx.outputs.map((output) => Number(output.satoshis ?? 0))
  let receiptIndex = -1
  for (const [index, output] of tx.outputs.entries()) {
    try {
      if (parseReceiptFields(PushDrop.decode(output.lockingScript).fields)) {
        receiptIndex = index
        break
      }
    } catch {
      // BRC-29 payment and change are not receipts.
    }
  }
  const found = findPaymentOutputIndex(satoshis, receiptIndex, amountSats, 0)
  return found >= 0 ? found : 0
}

function invoiceOutputIndex(tx: Transaction): number {
  for (const [index, output] of tx.outputs.entries()) {
    try {
      const decoded = PushDrop.decode(output.lockingScript)
      if (parseInvoiceFields(decoded.fields)) return index
    } catch {
      // Change and BRC-29 payment outputs are ignored.
    }
  }
  return 0
}
