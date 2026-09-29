import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  buildUsage,
  demoOffer,
  demoPack,
  meterRemaining,
  mockInference
} from '../../../protocol/inference'
import { assertCanList, assertCanPrompt, packBalance, parseWhole, previewUsage } from './actions'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')
const protocolSrc = readFileSync(join(here, '../../../protocol/inference.ts'), 'utf8')

describe('list a model', () => {
  it('requires a label, a model, and a whole price', () => {
    expect(parseWhole('1000')).toBe(1000)
    expect(parseWhole('')).toBeNull()
    expect(parseWhole('1.5')).toBeNull()
    expect(() => assertCanList({
      label: ' ',
      model: 'desk-note',
      callSats: 1000,
      packSats: 0,
      packCalls: 0
    })).toThrow('Label is required.')
    expect(() => assertCanList({
      label: 'Desk note',
      model: ' ',
      callSats: 1000,
      packSats: 0,
      packCalls: 0
    })).toThrow('Model is required.')
    expect(() => assertCanList({
      label: 'Desk note',
      model: 'desk-note',
      callSats: 0,
      packSats: 0,
      packCalls: 0
    })).toThrow('Enter a price.')
    expect(() => assertCanPrompt(' ')).toThrow('Write a prompt.')
  })
})

describe('meter', () => {
  it('decrements a pack by each receipt and leaves a per-call balance at zero', () => {
    const offer = demoOffer()
    const pack = demoPack()
    const first = previewUsage(offer, pack, [], 'one', '2026-09-29T12:00:00Z')
    const second = previewUsage(offer, pack, [first.usage], 'two', '2026-09-29T12:01:00Z')
    expect(packBalance(pack, [])).toBe(pack.packTotal)
    expect(packBalance(pack, [first.usage])).toBe(pack.packTotal - offer.callSats)
    expect(second.usage.remaining).toBe(meterRemaining(pack.packTotal, [first.usage, second.usage]))
    expect(second.usage.remaining).toBeLessThan(first.usage.remaining)
    const perCall = buildUsage({
      offerId: offer.offerId,
      provider: offer.provider,
      buyer: pack.buyer,
      callSats: offer.callSats,
      pack: null,
      prior: [],
      prompt: 'once',
      response: mockInference(offer.model, 'once'),
      timestamp: '2026-09-29T12:02:00Z'
    })
    expect(perCall.remaining).toBe(0)
    expect(String(perCall.sats)).not.toMatch(/\$/)
  })
})

describe('response plaintext stays off the offer row', () => {
  it('puts the response hash on the usage receipt, not the offer fields', () => {
    const encode = protocolSrc.slice(
      protocolSrc.indexOf('export function encodeOfferFields'),
      protocolSrc.indexOf('export function encodePackFields')
    )
    expect(encode).not.toMatch(/item\.response(?!Hash)/)
    const usageEncode = protocolSrc.slice(
      protocolSrc.indexOf('export function encodeUsageFields'),
      protocolSrc.indexOf('function at(')
    )
    expect(usageEncode).toContain('item.responseHash')
    expect(usageEncode).toContain('item.requestHash')
    expect(usageEncode).not.toMatch(/item\.response(?!Hash)/)
    expect(actionsSrc).toContain('encodeUsageFields')
    expect(actionsSrc).toContain('brc29PaymentOutput')
    expect(actionsSrc).toContain('sendResponse')
    expect(actionsSrc).toContain('mockInference')
  })
})
