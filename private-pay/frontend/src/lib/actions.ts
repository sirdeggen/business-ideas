import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  type WalletClient
} from '@bsv/sdk'
import {
  ATTEST_SATS,
  AUDIT_VIEW_FEE_SATS,
  BASKET,
  PROTOCOL_ID,
  SIGNING_KEY_ID,
  VIEW_SCOPE,
  assertLabel,
  assertLine,
  bytesToHex,
  canonicalAttestBytes,
  canonicalGrantBytes,
  canonicalPaymentBytes,
  canonicalRevokeBytes,
  encodeAttestFields,
  encodeGrantFields,
  encodePaymentFields,
  encodeRevokeFields,
  expiresAtFrom,
  grantBindingId,
  hexToBytes,
  isCounterpartyKeyId,
  isIdentityKey,
  nowIso,
  openGrantFor,
  openPlaintext,
  parseAmount,
  parseGrantDays,
  paymentBindingId,
  paymentFeeSats,
  readingSlug,
  sameIdentity,
  sealPlaintext,
  viewRole,
  buildReading,
  type FoldedPayment,
  type PaymentRecord,
  type PrivatePayReading,
  type SealedAmount
} from '../../../protocol/private-pay'
import { originator } from './config'
import {
  ALREADY_ATTESTED,
  ALREADY_GRANTED,
  ALREADY_REVOKED,
  NEED_AUDITOR,
  NEED_GRANT,
  NOT_A_VIEW,
  NOT_PAYEE,
  NOT_PAYER
} from './copy'
import { nudgePrivatePay } from './messagebox'
import { submitPrivatePayTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface PayInput {
  label: string
  amount: string
  lineNote: string
  payeeIdentity: string
  payee: string
  desk: string
}

export interface PreparedPay {
  label: string
  amountSats: number
  lineNote: string
  payeeIdentity: string
  payee: string
  desk: string
  feeSats: number
}

export interface GrantInput {
  auditor: string
  days: string
}

export interface PayResult {
  paymentId: string
  txid: string
  feeSats: number
  overlayError?: string
}

export interface AttestResult {
  paymentId: string
  txid: string
  overlayError?: string
}

export interface GrantResult {
  paymentId: string
  grantId: string
  txid: string
  feeSats: number
  overlayError?: string
}

export interface RevokeResult {
  paymentId: string
  grantId: string
  txid: string
  overlayError?: string
}

function randomKeyId(): string {
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

export function assertCanPay(
  input: PayInput,
  payerIdentity: string | null,
  payerSigning: string | null
): PreparedPay {
  const label = assertLabel(input.label)
  const lineNote = assertLine(input.lineNote)
  const amountSats = parseAmount(input.amount)
  if (amountSats === null) throw new Error('Amount must be a whole number of sats.')
  const payeeIdentityInput = input.payeeIdentity.trim()
  const payeeInput = input.payee.trim()
  const deskInput = input.desk.trim()
  if (payeeIdentityInput && !isIdentityKey(payeeIdentityInput)) throw new Error('Payee identity key is not a key.')
  if (payeeInput && !isIdentityKey(payeeInput)) throw new Error('Payee signing key is not a key.')
  if ((payeeIdentityInput && !payeeInput) || (!payeeIdentityInput && payeeInput)) {
    throw new Error('Paste both payee keys, or leave both blank to pay this wallet.')
  }
  if (deskInput && !isIdentityKey(deskInput)) throw new Error('Desk key must be an identity key, or leave it blank.')
  const payeeIdentity = payeeIdentityInput || payerIdentity || ''
  const payee = payeeInput || payerSigning || ''
  const desk = deskInput || payerIdentity || ''
  if (payerIdentity && !isIdentityKey(payeeIdentity)) throw new Error('Payee identity is missing.')
  if (payerSigning && !isIdentityKey(payee)) throw new Error('Payee signing key is missing.')
  if (payerIdentity && !isIdentityKey(desk)) throw new Error('Desk key is missing.')
  return {
    label,
    amountSats,
    lineNote,
    payeeIdentity,
    payee,
    desk,
    feeSats: paymentFeeSats(amountSats)
  }
}

export function assertCanAttest(payment: PaymentRecord, folded: FoldedPayment, signingKey: string): void {
  if (!sameIdentity(signingKey, payment.payee)) throw new Error(NOT_PAYEE)
  if (folded.attestation) throw new Error(ALREADY_ATTESTED)
}

export function assertCanGrant(
  payment: PaymentRecord,
  folded: FoldedPayment,
  signingKey: string,
  input: GrantInput,
  grantedAt = nowIso()
): { auditor: string, days: number, expiresAt: string, grantedAt: string } {
  if (!sameIdentity(signingKey, payment.payer)) throw new Error(NOT_PAYER)
  const auditor = input.auditor.trim()
  if (!isIdentityKey(auditor)) throw new Error(NEED_AUDITOR)
  if (sameIdentity(auditor, payment.payerIdentity) || sameIdentity(auditor, payment.payeeIdentity)) {
    throw new Error('The auditor must be someone other than the payer and the payee.')
  }
  const days = parseGrantDays(input.days)
  if (days === null) throw new Error('View length must be between 1 and 365 days.')
  const expiresAt = expiresAtFrom(grantedAt, days)
  const open = folded.grants.some((grant) =>
    sameIdentity(grant.auditor, auditor) && grant.expiresAt > grantedAt
    && !folded.revokes.some((row) => sameIdentity(row.grantId, grant.grantId))
  )
  if (open) throw new Error(ALREADY_GRANTED)
  return { auditor, days, expiresAt, grantedAt }
}

export function assertCanRevoke(
  payment: PaymentRecord,
  folded: FoldedPayment,
  signingKey: string,
  grantId: string
): void {
  if (!sameIdentity(signingKey, payment.payer)) throw new Error(NOT_PAYER)
  const grant = folded.grants.find((row) => sameIdentity(row.grantId, grantId))
  if (!grant) throw new Error(NEED_GRANT)
  if (folded.revokes.some((row) => sameIdentity(row.grantId, grant.grantId))) {
    throw new Error(ALREADY_REVOKED)
  }
}

export function assertCanOpen(identityKey: string, folded: FoldedPayment, now = nowIso()): void {
  if (!viewRole(identityKey, folded, now)) throw new Error(NOT_A_VIEW)
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

export async function signingKey(wallet: WalletClient): Promise<string> {
  const { publicKey } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return publicKey
}

async function signPrivatePay(wallet: WalletClient, data: number[]): Promise<string> {
  const { signature } = await wallet.createSignature({
    data,
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return bytesToHex(signature)
}

async function encryptTo(
  wallet: WalletClient,
  counterparty: string,
  keyID: string,
  plaintext: number[]
): Promise<string> {
  const { ciphertext } = await wallet.encrypt({
    plaintext,
    protocolID: PROTOCOL_ID,
    keyID,
    counterparty
  })
  return bytesToHex(ciphertext)
}

async function decryptFrom(
  wallet: WalletClient,
  counterparty: string,
  keyID: string,
  amountCipher: string
): Promise<number[]> {
  const ciphertext = hexToBytes(amountCipher)
  if (!ciphertext) throw new Error('Sealed amount is missing.')
  const { plaintext } = await wallet.decrypt({
    ciphertext,
    protocolID: PROTOCOL_ID,
    keyID,
    counterparty
  })
  return plaintext
}

async function overlayOrError(overlayUrl: string, tx: number[]): Promise<string | undefined> {
  try {
    await submitPrivatePayTx(overlayUrl, tx)
    return undefined
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return detail.trim() || 'overlay submit failed with no message'
  }
}

export async function payPrivate(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: PayInput
): Promise<PayResult> {
  const payer = await signingKey(wallet)
  const ready = assertCanPay(input, identityKey, payer)
  if (!isIdentityKey(ready.payeeIdentity) || !isIdentityKey(ready.payee) || !isIdentityKey(ready.desk)) {
    throw new Error('Payee identity is missing.')
  }
  const paidAt = nowIso()
  const counterpartyKeyId = randomKeyId()
  if (!isCounterpartyKeyId(counterpartyKeyId)) throw new Error('Counterparty key id is missing.')
  const plaintext = sealPlaintext(ready.amountSats, ready.lineNote)
  const amountCipher = await encryptTo(wallet, ready.payeeIdentity, counterpartyKeyId, plaintext)
  const draft = {
    label: ready.label,
    payer,
    payerIdentity: identityKey,
    payeeIdentity: ready.payeeIdentity,
    payee: ready.payee,
    desk: ready.desk,
    counterpartyKeyId,
    amountCipher,
    feeSats: ready.feeSats,
    paidAt
  }
  const paymentId = paymentBindingId(draft)
  const signature = await signPrivatePay(wallet, canonicalPaymentBytes({ ...draft, paymentId }))
  const lockKey = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodePaymentFields({ ...draft, paymentId, signature }),
      PROTOCOL_ID,
      lockKey,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Private pay: ${ready.label}`,
    outputs: [
      {
        satoshis: ready.feeSats,
        lockingScript: p2pkhFromPublicKey(ready.desk),
        outputDescription: 'Payment fee'
      },
      {
        satoshis: ATTEST_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Payment record for ${ready.label}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID: lockKey,
          counterparty: 'self',
          paymentId
        }),
        tags: [BASKET, 'payment', paymentId]
      }
    ],
    labels: [BASKET, 'payment'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  void nudgePrivatePay(wallet, identityKey, [ready.payeeIdentity], {
    kind: 'payment',
    paymentId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return { paymentId, txid, feeSats: ready.feeSats, overlayError }
}

export async function attestPayment(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  payment: PaymentRecord,
  folded: FoldedPayment
): Promise<AttestResult> {
  const signer = await signingKey(wallet)
  assertCanAttest(payment, folded, signer)
  const attestedAt = nowIso()
  const signature = await signPrivatePay(wallet, canonicalAttestBytes({
    paymentId: payment.paymentId,
    signer,
    attestedAt
  }))
  const lockKey = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeAttestFields({
        paymentId: payment.paymentId,
        signer,
        attestedAt,
        signature
      }),
      PROTOCOL_ID,
      lockKey,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  const response = await wallet.createAction({
    description: `Attest payment: ${payment.label}`,
    outputs: [{
      satoshis: ATTEST_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Payee attestation for ${payment.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID: lockKey,
        counterparty: 'self',
        paymentId: payment.paymentId
      }),
      tags: [BASKET, 'attest', payment.paymentId]
    }],
    labels: [BASKET, 'attest'],
    options: { randomizeOutputs: false }
  })
  const { txid, tx } = await finishAction(wallet, response)
  void nudgePrivatePay(wallet, identityKey, [payment.payerIdentity], {
    kind: 'attest',
    paymentId: payment.paymentId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return { paymentId: payment.paymentId, txid, overlayError }
}

export async function grantView(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  payment: PaymentRecord,
  folded: FoldedPayment,
  input: GrantInput
): Promise<GrantResult> {
  const payer = await signingKey(wallet)
  const ready = assertCanGrant(payment, folded, payer, input)
  const plaintext = await decryptFrom(wallet, payment.payeeIdentity, payment.counterpartyKeyId, payment.amountCipher)
  if (!openPlaintext(plaintext)) throw new Error('Sealed amount could not be opened.')
  const auditorCipher = await encryptTo(wallet, ready.auditor, payment.counterpartyKeyId, plaintext)
  const body = {
    paymentId: payment.paymentId,
    payer,
    auditor: ready.auditor,
    scope: VIEW_SCOPE as typeof VIEW_SCOPE,
    expiresAt: ready.expiresAt,
    auditorCipher,
    feeSats: AUDIT_VIEW_FEE_SATS,
    grantedAt: ready.grantedAt
  }
  const grantId = grantBindingId(body)
  const signature = await signPrivatePay(wallet, canonicalGrantBytes({ ...body, grantId }))
  const lockKey = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeGrantFields({ ...body, grantId, signature }),
      PROTOCOL_ID,
      lockKey,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  const response = await wallet.createAction({
    description: `Grant view: ${payment.label}`,
    outputs: [
      {
        satoshis: AUDIT_VIEW_FEE_SATS,
        lockingScript: p2pkhFromPublicKey(payment.desk),
        outputDescription: 'Audit-view grant fee'
      },
      {
        satoshis: ATTEST_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `View grant for ${payment.label}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID: lockKey,
          counterparty: 'self',
          paymentId: payment.paymentId,
          grantId
        }),
        tags: [BASKET, 'grant', payment.paymentId]
      }
    ],
    labels: [BASKET, 'grant'],
    options: { randomizeOutputs: false }
  })
  const { txid, tx } = await finishAction(wallet, response)
  void nudgePrivatePay(wallet, identityKey, [ready.auditor], {
    kind: 'grant',
    paymentId: payment.paymentId,
    grantId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return { paymentId: payment.paymentId, grantId, txid, feeSats: AUDIT_VIEW_FEE_SATS, overlayError }
}

export async function revokeView(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  payment: PaymentRecord,
  folded: FoldedPayment,
  grantId: string
): Promise<RevokeResult> {
  const payer = await signingKey(wallet)
  assertCanRevoke(payment, folded, payer, grantId)
  const grant = folded.grants.find((row) => sameIdentity(row.grantId, grantId))
  if (!grant) throw new Error(NEED_GRANT)
  const revokedAt = nowIso()
  const signature = await signPrivatePay(wallet, canonicalRevokeBytes({
    grantId: grant.grantId,
    paymentId: payment.paymentId,
    payer,
    revokedAt
  }))
  const lockKey = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeRevokeFields({
        grantId: grant.grantId,
        paymentId: payment.paymentId,
        payer,
        revokedAt,
        signature
      }),
      PROTOCOL_ID,
      lockKey,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  const response = await wallet.createAction({
    description: `Revoke view: ${payment.label}`,
    outputs: [{
      satoshis: ATTEST_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Revoke view for ${payment.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID: lockKey,
        counterparty: 'self',
        paymentId: payment.paymentId,
        grantId: grant.grantId
      }),
      tags: [BASKET, 'revoke', payment.paymentId]
    }],
    labels: [BASKET, 'revoke'],
    options: { randomizeOutputs: false }
  })
  const { txid, tx } = await finishAction(wallet, response)
  void nudgePrivatePay(wallet, identityKey, [grant.auditor], {
    kind: 'revoke',
    paymentId: payment.paymentId,
    grantId: grant.grantId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return { paymentId: payment.paymentId, grantId: grant.grantId, txid, overlayError }
}

export async function openView(
  wallet: WalletClient,
  identityKey: string,
  folded: FoldedPayment,
  now = nowIso()
): Promise<SealedAmount> {
  assertCanOpen(identityKey, folded, now)
  const role = viewRole(identityKey, folded, now)
  const payment = folded.payment
  if (role === 'auditor') {
    const grant = openGrantFor(identityKey, folded, now)
    if (!grant) throw new Error(NOT_A_VIEW)
    const plaintext = await decryptFrom(wallet, payment.payerIdentity, payment.counterpartyKeyId, grant.auditorCipher)
    const opened = openPlaintext(plaintext)
    if (!opened) throw new Error('Sealed amount could not be opened.')
    return opened
  }
  const counterparty = role === 'payer' ? payment.payeeIdentity : payment.payerIdentity
  const plaintext = await decryptFrom(wallet, counterparty, payment.counterpartyKeyId, payment.amountCipher)
  const opened = openPlaintext(plaintext)
  if (!opened) throw new Error('Sealed amount could not be opened.')
  return opened
}

export function downloadReading(folded: FoldedPayment): PrivatePayReading {
  const reading = buildReading(folded, nowIso())
  const body = JSON.stringify(reading, null, 2)
  const blob = new Blob([body], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `${readingSlug(folded.payment.label)}-private-pay.json`
  link.click()
  URL.revokeObjectURL(href)
  return reading
}
