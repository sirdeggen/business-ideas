import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import {
  DEMO_CALL_SATS,
  GENESIS,
  LOOKUP_SERVICE,
  MAGIC,
  TOPIC,
  attestationFor,
  buildUsage,
  dedupeUsages,
  demoOffer,
  demoPack,
  encodeOfferFields,
  encodePackFields,
  encodeUsageFields,
  makePackId,
  meterRemaining,
  mockInference,
  parseInferenceFields,
  receiptsForPack,
  responseDigest,
  validatePack,
  verifyReceiptChain,
  verifyUsage,
  type InferencePack,
  type InferenceUsage
} from './inference'

const PROVIDER = `02${'11'.repeat(32)}`
const BUYER = `03${'22'.repeat(32)}`
const WHEN = '2026-09-29T12:00:00Z'

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

function chainUsage(
  offerId: string,
  pack: ReturnType<typeof demoPack>,
  prior: InferenceUsage[],
  prompt: string,
  timestamp: string
): { usage: InferenceUsage, response: string } {
  const response = mockInference('desk-note', prompt)
  const usage = buildUsage({
    offerId,
    provider: PROVIDER,
    buyer: BUYER,
    callSats: DEMO_CALL_SATS,
    pack,
    prior,
    prompt,
    response,
    timestamp
  })
  return { usage, response }
}

describe('inference desk protocol', () => {
  it('hashes with sha256 and the inference magic prefix', () => {
    expect(MAGIC).toBe('inference')
    expect(TOPIC).toBe('tm_anytx')
    expect(LOOKUP_SERVICE).toBe('ls_anytx')
    expect(sha256Hex('inference')).toBe(createHash('sha256').update('inference').digest('hex'))
    const response = mockInference('desk-note', 'hello')
    expect(responseDigest(response)).toBe(createHash('sha256').update(response).digest('hex'))
    const attested = attestationFor({
      provider: PROVIDER,
      requestHash: responseDigest('prompt'),
      responseHash: responseDigest(response)
    })
    expect(attested).toHaveLength(64)
    expect(attested).toBe(createHash('sha256').update([
      'inference',
      PROVIDER,
      responseDigest('prompt'),
      responseDigest(response)
    ].join('\n')).digest('hex'))
    expect(attestationFor({
      provider: PROVIDER,
      requestHash: responseDigest('prompt'),
      responseHash: responseDigest(response)
    })).not.toBe(attestationFor({
      provider: PROVIDER,
      requestHash: responseDigest('prompt'),
      responseHash: responseDigest('other')
    }))
  })

  it('round-trips an offer, a pack purchase, and a usage receipt without the response plaintext', () => {
    const offer = demoOffer()
    const offerFields = encodeOfferFields(offer)
    expect(fieldTexts(offerFields)[0]).toBe('inference')
    expect(fieldTexts(offerFields).join('\n')).not.toContain('hello desk')
    expect(parseInferenceFields(offerFields)).toEqual(offer)

    const pack = {
      packId: demoPack().packId,
      offerId: offer.offerId,
      buyer: BUYER,
      provider: PROVIDER,
      paidSats: 4000,
      packTotal: 5000,
      timestamp: WHEN
    }
    expect(parseInferenceFields(encodePackFields(pack))).toMatchObject({ kind: 'pack', packTotal: 5000 })

    const response = mockInference(offer.model, 'Summarize the note')
    const usage = buildUsage({
      offerId: offer.offerId,
      provider: PROVIDER,
      buyer: BUYER,
      callSats: offer.callSats,
      pack: { packId: pack.packId, packTotal: pack.packTotal },
      prior: [],
      prompt: 'Summarize the note',
      response,
      timestamp: WHEN
    })
    const encoded = fieldTexts(encodeUsageFields(usage))
    expect(encoded[0]).toBe(MAGIC)
    expect(encoded).not.toContain(response)
    expect(encoded).toContain(usage.responseHash)
    const parsed = parseInferenceFields(encodeUsageFields(usage))
    expect(parsed).toEqual(usage)
    expect(usage.remaining).toBe(4000)
  })

  it('verifies the response hash, the attestation, and the receipt chain', () => {
    const offer = demoOffer()
    const pack = {
      ...demoPack(),
      offerId: offer.offerId,
      buyer: BUYER,
      provider: PROVIDER,
      packTotal: 5000,
      paidSats: 4000
    }
    const first = chainUsage(offer.offerId, pack, [], 'one', '2026-09-29T12:00:00Z')
    const second = chainUsage(offer.offerId, pack, [first.usage], 'two', '2026-09-29T12:01:00Z')
    const third = chainUsage(offer.offerId, pack, [first.usage, second.usage], 'three', '2026-09-29T12:02:00Z')

    expect(first.usage.prevHash).toBe(pack.packId)
    expect(second.usage.prevHash).toBe(first.usage.usageId)
    expect(third.usage.remaining).toBe(2000)
    expect(meterRemaining(pack.packTotal, [first.usage, second.usage, third.usage])).toBe(2000)
    expect(meterRemaining(5000, [])).toBe(5000)

    const responses = {
      [first.usage.responseHash]: first.response,
      [second.usage.responseHash]: second.response,
      [third.usage.responseHash]: third.response
    }
    expect(verifyReceiptChain(pack, [third.usage, first.usage, second.usage], responses)).toBeNull()
    expect(verifyUsage({
      response: second.response,
      usage: second.usage,
      previous: first.usage,
      pack
    })).toBeNull()
  })

  it('rejects a bad response hash, a broken attestation, and a broken chain', () => {
    const offer = demoOffer()
    const pack = {
      ...demoPack(),
      offerId: offer.offerId,
      buyer: BUYER,
      provider: PROVIDER,
      packTotal: 5000
    }
    const first = chainUsage(offer.offerId, pack, [], 'one', WHEN)
    expect(verifyUsage({
      response: 'not the served text',
      usage: first.usage,
      previous: null,
      pack
    })).toBe('response hash does not match the response')

    const tampered: InferenceUsage = { ...first.usage, attestation: GENESIS }
    expect(parseInferenceFields(encodeUsageFields(tampered))).toBeNull()

    const brokenLink: InferenceUsage = buildUsage({
      offerId: offer.offerId,
      provider: PROVIDER,
      buyer: BUYER,
      callSats: DEMO_CALL_SATS,
      pack,
      prior: [{ ...first.usage, usageId: GENESIS, sats: first.usage.sats, timestamp: first.usage.timestamp }],
      prompt: 'two',
      response: mockInference('desk-note', 'two'),
      timestamp: '2026-09-29T12:05:00Z'
    })
    expect(verifyUsage({
      response: mockInference('desk-note', 'two'),
      usage: brokenLink,
      previous: first.usage,
      pack
    })).toBe('receipt chain does not link')
  })

  it('meters a pack as total minus receipts and keeps per-call receipts off the pack', () => {
    expect(meterRemaining(5000, [{ sats: 1000 }, { sats: 1000 }])).toBe(3000)
    const response = mockInference('desk-note', 'once')
    const usage = buildUsage({
      offerId: demoOffer().offerId,
      provider: PROVIDER,
      buyer: BUYER,
      callSats: 1000,
      pack: null,
      prior: [],
      prompt: 'once',
      response,
      timestamp: WHEN
    })
    expect(usage.packId).toBe(GENESIS)
    expect(usage.remaining).toBe(0)
    expect(usage.prevHash).toBe(GENESIS)
    expect(verifyUsage({ response, usage, previous: null, pack: null })).toBeNull()
    const foreign = encodeOfferFields(demoOffer())
    foreign[0] = Array.from(new TextEncoder().encode('feed'))
    expect(parseInferenceFields(foreign)).toBeNull()
  })

  it('counts a usageId once when local state and the overlay both have it', () => {
    const offer = demoOffer()
    const pack: InferencePack = {
      ...demoPack(),
      offerId: offer.offerId,
      buyer: BUYER,
      provider: PROVIDER,
      packTotal: 5000,
      paidSats: 4000
    }
    const first = chainUsage(offer.offerId, pack, [], 'one', WHEN)
    const fromOverlay = { ...first.usage }
    const merged = dedupeUsages([first.usage, fromOverlay])
    const folded = receiptsForPack([first.usage, fromOverlay], pack.packId, pack.buyer)
    expect(merged).toHaveLength(1)
    expect(folded).toHaveLength(1)
    expect(meterRemaining(pack.packTotal, [first.usage, fromOverlay])).toBe(4000)

    const response = mockInference('desk-note', 'two')
    const second = buildUsage({
      offerId: offer.offerId,
      provider: PROVIDER,
      buyer: BUYER,
      callSats: DEMO_CALL_SATS,
      pack,
      prior: [first.usage, fromOverlay],
      prompt: 'two',
      response,
      timestamp: '2026-09-29T12:01:00Z'
    })
    expect(second.remaining).toBe(3000)
    expect(verifyUsage({
      response,
      usage: second,
      previous: first.usage,
      pack
    })).toBeNull()
  })

  it('ignores a receipt from another pack or another buyer', () => {
    const offer = demoOffer()
    const pack: InferencePack = {
      ...demoPack(),
      offerId: offer.offerId,
      buyer: BUYER,
      provider: PROVIDER,
      packTotal: 5000,
      paidSats: 4000
    }
    const mine = chainUsage(offer.offerId, pack, [], 'mine', '2026-09-29T12:00:00Z')
    const otherPackId = makePackId(BUYER, offer.offerId, WHEN, 'other')
    const otherResponse = mockInference('desk-note', 'other')
    const other = buildUsage({
      offerId: offer.offerId,
      provider: PROVIDER,
      buyer: BUYER,
      callSats: DEMO_CALL_SATS,
      pack: { packId: otherPackId, packTotal: 5000 },
      prior: [],
      prompt: 'other',
      response: otherResponse,
      timestamp: '2026-09-29T12:00:30Z'
    })
    expect(receiptsForPack([mine.usage, other], pack.packId, BUYER).map((row) => row.usageId)).toEqual([
      mine.usage.usageId
    ])
    expect(verifyUsage({
      response: otherResponse,
      usage: other,
      previous: null,
      pack
    })).toBe('pack does not match the receipt')

    const stranger = `02${'ee'.repeat(32)}`
    const strangerResponse = mockInference('desk-note', 'stranger')
    const strangerUsage = buildUsage({
      offerId: offer.offerId,
      provider: PROVIDER,
      buyer: stranger,
      callSats: DEMO_CALL_SATS,
      pack,
      prior: [],
      prompt: 'stranger',
      response: strangerResponse,
      timestamp: '2026-09-29T11:00:00Z'
    })
    expect(receiptsForPack([strangerUsage, mine.usage], pack.packId, BUYER).map((row) => row.usageId)).toEqual([
      mine.usage.usageId
    ])
    expect(meterRemaining(pack.packTotal, receiptsForPack([strangerUsage, mine.usage], pack.packId, BUYER))).toBe(4000)
    expect(verifyUsage({
      response: strangerResponse,
      usage: strangerUsage,
      previous: null,
      pack
    })).toBe('receipt buyer does not match the pack')
  })

  it('refuses an over-spend and floors the meter at zero', () => {
    const offer = demoOffer()
    const pack: InferencePack = {
      ...demoPack(),
      offerId: offer.offerId,
      buyer: BUYER,
      provider: PROVIDER,
      packTotal: 5000,
      paidSats: 4000
    }
    const prior: InferenceUsage[] = []
    for (let step = 0; step < 5; step++) {
      const next = chainUsage(
        offer.offerId,
        pack,
        prior,
        `call-${step}`,
        `2026-09-29T12:0${step}:00Z`
      )
      prior.push(next.usage)
    }
    expect(meterRemaining(pack.packTotal, prior)).toBe(0)
    expect(meterRemaining(1000, [{ sats: 1500 }])).toBe(0)
    expect(meterRemaining(pack.packTotal, [...prior, prior[4]])).toBe(0)
    expect(() => buildUsage({
      offerId: offer.offerId,
      provider: PROVIDER,
      buyer: BUYER,
      callSats: DEMO_CALL_SATS,
      pack,
      prior,
      prompt: 'one more',
      response: mockInference('desk-note', 'one more'),
      timestamp: '2026-09-29T12:06:00Z'
    })).toThrow('pack balance is too low')
    expect(validatePack({ ...pack, packTotal: 100, paidSats: 500 })).toBe('pack total is below what was paid')
    expect(validatePack({ ...pack, packTotal: 4000, paidSats: 4000 })).toBeNull()
  })
})
