import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrivateKey } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  closeRound,
  commitToRound,
  disclose,
  identityFor,
  isSpendableKey,
  openRound
} from '../../../protocol/round'
import { assertCanRecord, payoutsAreSpendable } from './actions'

const actionsSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'actions.ts'), 'utf8')
const protocolSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../protocol/round.ts'), 'utf8')
const NONCE = 'ab'.repeat(16)
const NOW = '2026-10-13T16:00:00.000Z'
const LATER = '2026-10-13T16:05:00.000Z'

function raised() {
  let desk = openRound({
    name: 'Harbor Co-op',
    orgKind: 'coop',
    pricing: 'fixed',
    unitLabel: 'units',
    priceSats: 1_000,
    minSats: 3_000,
    maxSats: 10_000,
    deadline: '2026-10-20T16:00:00.000Z',
    requiredFields: ['member'],
    issuerKey: identityFor('round-issuer')
  }, NOW, NONCE)
  desk = disclose(desk, {
    backerKey: identityFor('ada'),
    certifierKey: identityFor('local-certifier'),
    certificateType: 'membership',
    serialNumber: 'serial-1',
    fields: { member: 'yes' }
  }, LATER)
  desk = commitToRound(desk, { backerKey: identityFor('ada'), sats: 5_000 }, LATER, '12'.repeat(16))
  return closeRound(desk, LATER)
}

describe('record gate', () => {
  it('requires a commitment before record', () => {
    const desk = openRound({
      name: 'Harbor Co-op',
      orgKind: 'coop',
      pricing: 'fixed',
      unitLabel: 'units',
      priceSats: 1_000,
      minSats: 3_000,
      maxSats: 10_000,
      deadline: '2026-10-20T16:00:00.000Z',
      requiredFields: ['member']
    }, NOW, NONCE)
    expect(() => assertCanRecord(desk)).toThrow(/escrow/)
    expect(() => assertCanRecord(raised())).not.toThrow()
  })

  it('signs with createSignature counterparty anyone and can spend a real escrow', () => {
    expect(actionsSrc).toContain('signRecordedDesk')
    expect(actionsSrc).toContain('createAction')
    expect(actionsSrc).toContain('lockTime')
    expect(actionsSrc).toContain("counterparty: COUNTERPARTY")
    expect(actionsSrc).toContain('forSelf: true')
    expect(actionsSrc).toContain('escrowKeyId')
    expect(actionsSrc).toContain('Spend round escrow')
    expect(actionsSrc).toContain('sendWith: [txid]')
    expect(actionsSrc).toContain('submitRoundTx')
    expect(actionsSrc).not.toContain('PrivateKey')
    expect(protocolSrc).toContain('createSignature')
    expect(protocolSrc).toContain("SIGNING_COUNTERPARTY = 'anyone'")
    expect(protocolSrc).toContain('OP_PUSH_TX')
    expect(protocolSrc).toContain('SCRIPT_ENFORCES_ALLOCATION = false')
    const desk = raised()
    expect(desk.close).not.toBeNull()
    expect(payoutsAreSpendable(desk.close!, desk.terms!.issuerKey)).toBe(false)
    expect(isSpendableKey(desk.terms!.issuerKey)).toBe(false)
    expect(isSpendableKey(PrivateKey.fromRandom().toPublicKey().toString())).toBe(true)
  })
})
