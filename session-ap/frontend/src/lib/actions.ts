import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import { originator } from './config'
import { nudgePeer } from './messagebox'
import { submitSessionTx } from './overlay'
import {
  BASKET,
  BRC29_PROTOCOL_ID,
  MAGIC,
  PROTOCOL_ID,
  applyAnnouncement,
  closeSession,
  encodeApprovalFields,
  encodePaymentFields,
  encodeSessionFields,
  hashReceipt,
  lineItemFromReceipt,
  nextStatus,
  stringToUtf8Bytes,
  type LineItem,
  type SessionInvoice
} from './protocol'

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

async function publishFields(
  wallet: WalletClient,
  overlayUrl: string,
  fields: number[][],
  description: string,
  tags: string[]
): Promise<string> {
  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    fields,
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )
  const response = await wallet.createAction({
    description,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: description,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags
    }],
    labels: [BASKET, ...tags],
    options: { randomizeOutputs: false }
  })
  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a transaction')
  }
  await submitSessionTx(overlayUrl, response.tx as number[])
  return response.txid
}

export async function recordSpendStub(
  wallet: WalletClient,
  input: { label: string, amountSats: number, amountUsd: string }
): Promise<LineItem> {
  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    [
      stringToUtf8Bytes(MAGIC),
      stringToUtf8Bytes('stub'),
      stringToUtf8Bytes(input.label),
      stringToUtf8Bytes(String(input.amountSats))
    ],
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )
  const response = await wallet.createAction({
    description: `Session line: ${input.label}`.slice(0, 50),
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Spend stub ${input.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'stub']
    }],
    labels: [BASKET, 'stub'],
    options: { randomizeOutputs: false }
  })
  if (!response.txid) throw new Error('Wallet did not return a spend')
  return lineItemFromReceipt({
    label: input.label,
    amountSats: input.amountSats,
    amountUsd: input.amountUsd,
    receipt: response.txid
  })
}

export async function closeBooks(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  draft: SessionInvoice
): Promise<{ book: SessionInvoice, txid: string }> {
  const closed = closeSession(draft, identityKey)
  const txid = await publishFields(
    wallet,
    overlayUrl,
    encodeSessionFields(closed),
    `Close session: ${closed.label}`.slice(0, 50),
    [BASKET, 'closed', closed.sessionId]
  )
  await nudgePeer(wallet, identityKey, closed.payerIdentity, {
    kind: 'closed',
    sessionId: closed.sessionId,
    label: closed.label
  })
  return { book: closed, txid }
}

export async function approveSession(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  book: SessionInvoice
): Promise<{ book: SessionInvoice, txid: string }> {
  nextStatus(book.status === 'closed' ? 'closed' : book.status, 'approve')
  const timestamp = new Date().toISOString()
  const txid = await publishFields(
    wallet,
    overlayUrl,
    encodeApprovalFields({
      sessionId: book.sessionId,
      approverIdentity: identityKey,
      timestamp
    }),
    `Approve session: ${book.label}`.slice(0, 50),
    [BASKET, 'approved', book.sessionId]
  )
  const next = applyAnnouncement(book, {
    magic: book.magic,
    version: book.version,
    kind: 'approval',
    sessionId: book.sessionId,
    approverIdentity: identityKey,
    timestamp
  })
  await nudgePeer(wallet, identityKey, book.payeeIdentity, {
    kind: 'approved',
    sessionId: book.sessionId,
    label: book.label
  })
  return { book: next, txid }
}

export async function paySession(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  book: SessionInvoice
): Promise<{ book: SessionInvoice, txid: string }> {
  if (book.status !== 'approved' && book.status !== 'closed') {
    throw new Error('Approve this session before paying')
  }
  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL_ID,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: book.payeeIdentity,
    forSelf: false
  })
  const paymentScript = p2pkhFromPublicKey(derived)
  const receiptKeyId = randomKeyId()
  const timestamp = new Date().toISOString()
  const receiptScript = await pushdrop(wallet).lock(
    encodePaymentFields({
      sessionId: book.sessionId,
      payerIdentity: identityKey,
      amountSats: book.totalSats,
      timestamp,
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
    description: `Pay session: ${book.label}`.slice(0, 50),
    outputs: [
      {
        satoshis: book.totalSats,
        lockingScript: paymentScript,
        outputDescription: `Session payment ${book.label}`,
        customInstructions: JSON.stringify({
          derivationPrefix,
          derivationSuffix,
          payee: book.payeeIdentity
        })
      },
      {
        satoshis: 1,
        lockingScript: receiptScript.toHex(),
        outputDescription: `Session paid ${book.sessionId}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID: receiptKeyId,
          counterparty: 'self'
        }),
        tags: [BASKET, 'paid', book.sessionId]
      }
    ],
    labels: [BASKET, 'pay', book.sessionId],
    options: { randomizeOutputs: false }
  })
  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a payment')
  }
  await submitSessionTx(overlayUrl, response.tx as number[])
  const next = applyAnnouncement(book, {
    magic: book.magic,
    version: book.version,
    kind: 'payment',
    sessionId: book.sessionId,
    payerIdentity: identityKey,
    amountSats: book.totalSats,
    timestamp,
    remittance: {
      derivationPrefix,
      derivationSuffix,
      paymentOutputIndex: 0
    }
  })
  await nudgePeer(wallet, identityKey, book.payeeIdentity, {
    kind: 'paid',
    sessionId: book.sessionId,
    label: book.label
  })
  return { book: next, txid: response.txid }
}

export { hashReceipt, lineItemFromReceipt }
