import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrivateKey } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import { contributorPayoutKey, hashCapture, postRequest, submitCapture } from '../../../protocol/capture'
import { payeeForAccept } from './actions'

const here = dirname(fileURLToPath(import.meta.url))

describe('accept payout', () => {
  it('pays the contributor from the signed submission and refuses a different key', () => {
    const contributor = PrivateKey.fromRandom().toPublicKey().toString()
    const other = PrivateKey.fromRandom().toPublicKey().toString()
    const desk = submitCapture(postRequest({
      location: '12 Market Street',
      brief: 'Film the awning.',
      rewardSats: 100_000,
      processingFeeSats: 1_000,
      deadline: '2026-10-21T18:00:00Z',
      postedAt: '2026-10-20T12:00:00Z',
      nonce: '11'.repeat(16)
    }), {
      contributorIdentity: contributor,
      receiptHash: hashCapture('file-bytes'),
      capturedAt: '2026-10-20T12:00:00Z',
      geohash: 'u4pru',
      submittedAt: '2026-10-20T12:00:00Z'
    })
    const submission = desk.submissions[0]!
    expect(payeeForAccept(submission, contributor)).toBe(contributorPayoutKey(contributor))
    expect(() => payeeForAccept(submission, other)).toThrow(/contributor who signed/)
    const source = readFileSync(join(here, 'actions.ts'), 'utf8')
    expect(source).not.toContain('noSend')
    expect(source).toContain('submitCaptureTx')
    expect(source).toContain('feeOutputInstructions')
    const protocol = readFileSync(join(here, '../../../protocol/capture.ts'), 'utf8')
    expect(protocol).toContain("DESK_FEE_KEY_ID = 'capture-fee'")
    expect(protocol).toContain('counterparty: \'anyone\'')
  })
})
