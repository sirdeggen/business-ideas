import { PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  AUDIT_VIEW_FEE_SATS,
  MAGIC,
  PAYMENT_FEE_BPS,
  PROTOCOL_ID,
  SIGNING_KEY_ID,
  TOPIC,
  VIEW_SCOPE,
  attestSignatureOk,
  buildReading,
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
  foldPayment,
  grantBindingId,
  openPlaintext,
  parsePrivatePayFields,
  paymentBindingId,
  paymentFeeSats,
  paymentSignatureOk,
  sealPlaintext,
  viewRole,
  type AttestRecord,
  type GrantRecord,
  type PaymentRecord,
  type RevokeRecord
} from './private-pay'

const WHEN = '2026-10-06T12:00:00Z'
const KEY_ID = 'ab'.repeat(8)

async function party(): Promise<{ wallet: WalletInterface, identity: string, signing: string }> {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey: identity } = await wallet.getPublicKey({ identityKey: true })
  const { publicKey: signing } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return { wallet, identity, signing }
}

async function sign(wallet: WalletInterface, data: number[]): Promise<string> {
  const { signature } = await wallet.createSignature({
    data,
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return bytesToHex(signature)
}

describe('private pay protocol', () => {
  it('keeps MAGIC private-pay and a wallet protocol id the key deriver accepts', () => {
    expect(MAGIC).toBe('private-pay')
    expect(MAGIC.length).toBeGreaterThanOrEqual(5)
    expect(PROTOCOL_ID).toEqual([0, 'privatepay'])
    expect(PROTOCOL_ID[1]).toMatch(/^[a-z0-9 ]+$/)
    expect(SIGNING_KEY_ID).toBe('privatepay')
    expect(TOPIC).toBe('tm_anytx')
    expect(PAYMENT_FEE_BPS).toBe(25)
    expect(AUDIT_VIEW_FEE_SATS).toBe(250)
    expect(VIEW_SCOPE).toBe('amount')
  })

  it('quotes 25 bps, with a 1 sat floor', () => {
    expect(paymentFeeSats(400_000)).toBe(1_000)
    expect(paymentFeeSats(10)).toBe(1)
    expect(paymentFeeSats(400)).toBe(1)
    expect(paymentFeeSats(800)).toBe(2)
  })

  it('seals the amount to the payee and, separately, to an auditor', async () => {
    const payer = await party()
    const payee = await party()
    const auditor = await party()
    const stranger = await party()
    const plain = sealPlaintext(400_000, 'October salary')
    const { ciphertext } = await payer.wallet.encrypt({
      plaintext: plain,
      protocolID: PROTOCOL_ID,
      keyID: KEY_ID,
      counterparty: payee.identity
    })
    const opened = await payee.wallet.decrypt({
      ciphertext,
      protocolID: PROTOCOL_ID,
      keyID: KEY_ID,
      counterparty: payer.identity
    })
    expect(openPlaintext(opened.plaintext)).toEqual({
      v: 1,
      amountSats: 400_000,
      lineNote: 'October salary'
    })
    const { ciphertext: forAuditor } = await payer.wallet.encrypt({
      plaintext: plain,
      protocolID: PROTOCOL_ID,
      keyID: KEY_ID,
      counterparty: auditor.identity
    })
    const auditorOpened = await auditor.wallet.decrypt({
      ciphertext: forAuditor,
      protocolID: PROTOCOL_ID,
      keyID: KEY_ID,
      counterparty: payer.identity
    })
    expect(openPlaintext(auditorOpened.plaintext)?.amountSats).toBe(400_000)
    await expect(stranger.wallet.decrypt({
      ciphertext,
      protocolID: PROTOCOL_ID,
      keyID: KEY_ID,
      counterparty: payer.identity
    })).rejects.toThrow()
  })

  it('round-trips a signed payment, attestation, grant, and revoke', async () => {
    const payer = await party()
    const payee = await party()
    const auditor = await party()
    const plain = sealPlaintext(400_000, 'October salary')
    const { ciphertext } = await payer.wallet.encrypt({
      plaintext: plain,
      protocolID: PROTOCOL_ID,
      keyID: KEY_ID,
      counterparty: payee.identity
    })
    const amountCipher = bytesToHex(ciphertext)
    const draft = {
      label: 'October payroll',
      payer: payer.signing,
      payerIdentity: payer.identity,
      payeeIdentity: payee.identity,
      payee: payee.signing,
      desk: payer.identity,
      counterpartyKeyId: KEY_ID,
      amountCipher,
      feeSats: paymentFeeSats(400_000),
      paidAt: WHEN
    }
    const paymentId = paymentBindingId(draft)
    const payment: PaymentRecord = {
      magic: MAGIC,
      version: '1',
      kind: 'payment',
      paymentId,
      ...draft,
      signature: await sign(payer.wallet, canonicalPaymentBytes({ ...draft, paymentId }))
    }
    const attestedAt = '2026-10-06T13:00:00Z'
    const attest: AttestRecord = {
      magic: MAGIC,
      version: '1',
      kind: 'attest',
      paymentId,
      signer: payee.signing,
      attestedAt,
      signature: await sign(payee.wallet, canonicalAttestBytes({ paymentId, signer: payee.signing, attestedAt }))
    }
    const { ciphertext: auditorCipherBytes } = await payer.wallet.encrypt({
      plaintext: plain,
      protocolID: PROTOCOL_ID,
      keyID: KEY_ID,
      counterparty: auditor.identity
    })
    const grantBody = {
      paymentId,
      payer: payer.signing,
      auditor: auditor.identity,
      scope: VIEW_SCOPE,
      expiresAt: expiresAtFrom('2026-10-06T14:00:00Z', 90),
      auditorCipher: bytesToHex(auditorCipherBytes),
      feeSats: AUDIT_VIEW_FEE_SATS,
      grantedAt: '2026-10-06T14:00:00Z'
    }
    const grantId = grantBindingId(grantBody)
    const grant: GrantRecord = {
      magic: MAGIC,
      version: '1',
      kind: 'grant',
      grantId,
      ...grantBody,
      signature: await sign(payer.wallet, canonicalGrantBytes({ ...grantBody, grantId }))
    }
    const revokedAt = '2026-10-06T15:00:00Z'
    const revoke: RevokeRecord = {
      magic: MAGIC,
      version: '1',
      kind: 'revoke',
      grantId,
      paymentId,
      payer: payer.signing,
      revokedAt,
      signature: await sign(payer.wallet, canonicalRevokeBytes({ grantId, paymentId, payer: payer.signing, revokedAt }))
    }

    expect(parsePrivatePayFields(encodePaymentFields(payment))).toMatchObject({ paymentId, feeSats: 1_000 })
    expect(parsePrivatePayFields(encodeAttestFields(attest))).toMatchObject({ signer: payee.signing })
    expect(parsePrivatePayFields(encodeGrantFields(grant))).toMatchObject({ grantId, feeSats: 250 })
    expect(parsePrivatePayFields(encodeRevokeFields(revoke))).toMatchObject({ grantId })

    const openFold = foldPayment(payment, [attest], [grant], [], '2026-10-07T00:00:00Z')
    expect(openFold.viewGranted).toBe(true)
    expect(openFold.openViews).toBe(1)
    expect(openFold.attestation?.signer).toBe(payee.signing)
    expect(viewRole(auditor.identity, openFold, '2026-10-07T00:00:00Z')).toBe('auditor')
    expect(viewRole(payer.identity, openFold, '2026-10-07T00:00:00Z')).toBe('payer')
    expect(viewRole(strangerKey(), openFold, '2026-10-07T00:00:00Z')).toBe(null)

    const reading = buildReading(openFold, '2026-10-07T00:00:00Z')
    expect(reading.amountSats).toBeNull()
    expect(reading.lineNote).toBeNull()
    expect(reading.feeSats).toBe(1_000)
    expect(reading.viewGranted).toBe(true)
    expect(JSON.stringify(reading)).not.toContain('October salary')
    expect(JSON.stringify(reading)).not.toContain(amountCipher)

    const closed = foldPayment(payment, [attest], [grant], [revoke], '2026-10-07T00:00:00Z')
    expect(closed.viewGranted).toBe(true)
    expect(closed.openViews).toBe(0)
    expect(viewRole(auditor.identity, closed, '2026-10-07T00:00:00Z')).toBe(null)

    const expired = foldPayment(payment, [attest], [grant], [], '2027-02-01T00:00:00Z')
    expect(expired.openViews).toBe(0)
    expect(viewRole(auditor.identity, expired, '2027-02-01T00:00:00Z')).toBe(null)
  })

  it('rejects an attestation whose signer field was renamed', async () => {
    const payer = await party()
    const payee = await party()
    const other = await party()
    const paymentId = 'ab'.repeat(16)
    const attestedAt = WHEN
    const signature = await sign(payee.wallet, canonicalAttestBytes({
      paymentId,
      signer: payee.signing,
      attestedAt
    }))
    const record: AttestRecord = {
      magic: MAGIC,
      version: '1',
      kind: 'attest',
      paymentId,
      signer: payee.signing,
      attestedAt,
      signature
    }
    expect(attestSignatureOk(record)).toBe(true)
    expect(attestSignatureOk({ ...record, signer: other.signing })).toBe(false)
    expect(attestSignatureOk({ ...record, signer: payer.signing })).toBe(false)
    expect(parsePrivatePayFields(encodeAttestFields(record))?.kind).toBe('attest')
    const renamed = encodeAttestFields(record)
    renamed[4] = Array.from(new TextEncoder().encode(other.signing))
    expect(parsePrivatePayFields(renamed)).toBeNull()
  })

  it('rejects a payment whose payer field was renamed', async () => {
    const payer = await party()
    const payee = await party()
    const other = await party()
    const draft = {
      label: 'October payroll',
      payer: payer.signing,
      payerIdentity: payer.identity,
      payeeIdentity: payee.identity,
      payee: payee.signing,
      desk: payer.identity,
      counterpartyKeyId: KEY_ID,
      amountCipher: 'ab'.repeat(32),
      feeSats: 1_000,
      paidAt: WHEN
    }
    const paymentId = paymentBindingId(draft)
    const signature = await sign(payer.wallet, canonicalPaymentBytes({ ...draft, paymentId }))
    const record: PaymentRecord = {
      magic: MAGIC,
      version: '1',
      kind: 'payment',
      paymentId,
      ...draft,
      signature
    }
    expect(paymentSignatureOk(record)).toBe(true)
    expect(paymentSignatureOk({ ...record, payer: other.signing })).toBe(false)
  })
})

function strangerKey(): string {
  return `02${'ee'.repeat(32)}`
}
