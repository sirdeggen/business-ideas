import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import {
  DEFAULT_PURPOSE,
  DEFAULT_PURPOSE_HASH,
  PROTOCOL_ID,
  buildReceipt,
  canonicalPurpose,
  canonicalReceiptBytes,
  canonicalReceiptJson,
  encodeAnnouncementFields,
  parseAnnouncementFields,
  purposeHash,
  receiptKeyID,
  verifyPublishedReceipt,
  verifyReceiptPurpose,
  verifyWalletDataSignature,
  type CanonicalReceipt
} from './protocol.ts'

const FIXTURE: Omit<CanonicalReceipt, 'donorIdentityKey' | 'orgIdentityKey'> = {
  v: 1,
  purpose: DEFAULT_PURPOSE,
  purposeHash: DEFAULT_PURPOSE_HASH,
  amountUsd: '25.00',
  amountSats: 50_000_000,
  giftTxid: 'ab'.repeat(32),
  at: '2026-08-18T16:00:00.000Z'
}

describe('purpose hash', () => {
  it('is stable for the documented roof-repair string', () => {
    assert.equal(canonicalPurpose('  roof repair  '), 'roof repair')
    assert.equal(purposeHash(DEFAULT_PURPOSE), DEFAULT_PURPOSE_HASH)
    assert.equal(purposeHash('  roof repair\n'), DEFAULT_PURPOSE_HASH)
    assert.equal(purposeHash('Roof repair') === DEFAULT_PURPOSE_HASH, false)
  })

  it('rejects a blank purpose', () => {
    assert.throws(() => purposeHash('   '), /Purpose is required/)
  })
})

describe('canonical receipt + ProtoWallet signature', () => {
  it('serializes a stable JSON object in a fixed key order', () => {
    const donor = PrivateKey.fromRandom().toPublicKey().toString()
    const org = PrivateKey.fromRandom().toPublicKey().toString()
    const json = canonicalReceiptJson({
      ...FIXTURE,
      donorIdentityKey: donor,
      orgIdentityKey: org
    })
    assert.equal(json, JSON.stringify({
      v: 1,
      purpose: 'roof repair',
      purposeHash: DEFAULT_PURPOSE_HASH,
      amountUsd: '25.00',
      amountSats: 50_000_000,
      donorIdentityKey: donor.toLowerCase(),
      orgIdentityKey: org.toLowerCase(),
      giftTxid: 'ab'.repeat(32),
      at: '2026-08-18T16:00:00.000Z'
    }))
    assert.throws(() => buildReceipt({
      ...FIXTURE,
      purposeHash: '00'.repeat(32),
      donorIdentityKey: donor,
      orgIdentityKey: org
    }), /Purpose hash/)
  })

  it('org signs, donor verifies purposeHash and the signature', async () => {
    const org = new ProtoWallet(PrivateKey.fromRandom())
    const donor = new ProtoWallet(PrivateKey.fromRandom())
    const { publicKey: orgIdentityKey } = await org.getPublicKey({ identityKey: true })
    const { publicKey: donorIdentityKey } = await donor.getPublicKey({ identityKey: true })
    const receipt = buildReceipt({
      ...FIXTURE,
      donorIdentityKey,
      orgIdentityKey
    })
    assert.equal(verifyReceiptPurpose(receipt), true)

    const data = canonicalReceiptBytes(receipt)
    const { signature } = await org.createSignature({
      data,
      protocolID: PROTOCOL_ID,
      keyID: receiptKeyID(receipt),
      counterparty: receipt.donorIdentityKey
    })
    const { publicKey: signingKey } = await org.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: receiptKeyID(receipt),
      counterparty: receipt.donorIdentityKey
    })
    assert.equal(verifyWalletDataSignature(signingKey, data, signature), true)

    const { publicKey: donorView } = await donor.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: receiptKeyID(receipt),
      counterparty: receipt.orgIdentityKey,
      forSelf: false
    })
    assert.equal(donorView, signingKey)
    assert.equal(verifyWalletDataSignature(donorView, data, signature), true)

    const other = new ProtoWallet(PrivateKey.fromRandom())
    const { publicKey: otherKey } = await other.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: receiptKeyID(receipt),
      counterparty: receipt.orgIdentityKey,
      forSelf: false
    })
    assert.equal(verifyWalletDataSignature(otherKey, data, signature), false)

    const tampered = buildReceipt({ ...receipt, purpose: 'new roof', purposeHash: purposeHash('new roof') })
    assert.equal(verifyWalletDataSignature(signingKey, canonicalReceiptBytes(tampered), signature), false)
  })

  it('announcement fields keep the grant receipt tag and verify without a wallet', async () => {
    const org = new ProtoWallet(PrivateKey.fromRandom())
    const donor = PrivateKey.fromRandom().toPublicKey().toString()
    const { publicKey: orgIdentityKey } = await org.getPublicKey({ identityKey: true })
    const receipt = buildReceipt({
      ...FIXTURE,
      donorIdentityKey: donor,
      orgIdentityKey
    })
    const { signature } = await org.createSignature({
      data: canonicalReceiptBytes(receipt),
      protocolID: PROTOCOL_ID,
      keyID: receiptKeyID(receipt),
      counterparty: receipt.donorIdentityKey
    })
    const { publicKey: signingKey } = await org.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: receiptKeyID(receipt),
      counterparty: receipt.donorIdentityKey
    })
    const fields = encodeAnnouncementFields(receipt, signature, signingKey)
    const parsed = parseAnnouncementFields(fields)
    assert.ok(parsed)
    assert.equal(verifyPublishedReceipt(parsed.receipt, parsed.signature, parsed.signingKey), true)
    assert.equal(parsed.receipt.purposeHash, DEFAULT_PURPOSE_HASH)
  })
})
