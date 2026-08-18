import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TAG, UNFUNDED_STREAM_MESSAGE, rateSatsPerSec } from '../../../protocol/stream'
import { claimStream } from './actions'
import { lookupStreams, submitStreamTx } from './overlay'
import type { OverlayStream } from './overlay'

const createAction = vi.fn()
const getPublicKey = vi.fn()

vi.mock('@bsv/sdk', () => ({
  P2PKH: class {
    lock() {
      return { toHex: () => '76a9' }
    }
  },
  PublicKey: {
    fromString: () => ({ toHash: () => [1] })
  },
  PushDrop: class {
    lock() {
      return Promise.resolve({ toHex: () => '51' })
    }
    unlock() {
      return {}
    }
  },
  Transaction: {
    fromBEEF: () => ({
      inputs: [{ unlockingScript: { toHex: () => '47' } }],
      sign: async () => undefined
    })
  },
  Utils: {
    toBase64: () => 'keyid'
  },
  WalletClient: class {}
}))

vi.mock('./overlay', () => ({
  lookupStreams: vi.fn(),
  submitStreamTx: vi.fn(),
  streamOutputIndex: () => 0,
  txFromWalletBeef: () => ({})
}))

vi.mock('./messagebox', () => ({
  notifyOtherParty: vi.fn()
}))

const CONTRACTOR = `03${'11'.repeat(32)}`
const TREASURER = '025706528f0f6894b2ba505007267ccff1133e004452a1f6b72ac716f246216366'
const AMOUNT_SATS = 594_598_868

function qaStream(satoshis: number, startIso = new Date(Date.now() - 3 * 86_400_000).toISOString()): OverlayStream {
  const durationSec = 14 * 86_400
  return {
    tag: TAG,
    streamId: '1f14c8a0459d45df890df49e1ea10b7d',
    org: 'Harbor Legal Aid',
    contractorName: 'Jordan Lee',
    contractorIdentity: CONTRACTOR,
    treasurerIdentity: TREASURER,
    amountSats: AMOUNT_SATS,
    rateSatsPerSec: rateSatsPerSec(AMOUNT_SATS, durationSec),
    startIso,
    durationSec,
    frozen: false,
    claimedSats: 0,
    freezeIso: '',
    amountUsd: '400.00',
    memo: 'Legal research week',
    updatedIso: startIso,
    lastClaimSats: 0,
    lastClaimIso: '',
    txid: 'b0e7d8ead17a49cd0b69f03b81e60c620156b7cd96c5233a4136718a2a3dbf22',
    outputIndex: 0,
    satoshis,
    beef: [1, 2, 3]
  }
}

describe('claimStream spend path', () => {
  beforeEach(() => {
    createAction.mockReset()
    getPublicKey.mockReset()
    getPublicKey.mockImplementation(async (args: { identityKey?: boolean }) => {
      if (args?.identityKey) return { publicKey: CONTRACTOR }
      return { publicKey: `02${'22'.repeat(32)}` }
    })
    vi.mocked(lookupStreams).mockReset()
    vi.mocked(submitStreamTx).mockReset()
  })

  it('refuses the QA 1-sat mint when claimable equals amountSats, before createAction', async () => {
    const stream = { ...qaStream(1, '2020-01-01T00:00:00.000Z'), contractorIdentity: '' }
    vi.mocked(lookupStreams).mockResolvedValue([stream])
    const wallet = { createAction, getPublicKey, internalizeAction: vi.fn(), signAction: vi.fn() }

    await expect(claimStream(wallet as never, 'https://overlay.example', stream))
      .rejects.toThrow(UNFUNDED_STREAM_MESSAGE)
    expect(createAction).not.toHaveBeenCalled()
    expect(getPublicKey).not.toHaveBeenCalled()
  })

  it('pays claimable from the stream UTXO and keeps a remaining pot (not 1-sat-only)', async () => {
    const stream = qaStream(AMOUNT_SATS)
    vi.mocked(lookupStreams).mockResolvedValue([stream])
    createAction.mockResolvedValue({
      txid: 'ab'.repeat(32),
      tx: [9]
    })
    vi.mocked(submitStreamTx).mockResolvedValue({ admitted: [0], raw: {} })

    const wallet = { createAction, getPublicKey, internalizeAction: vi.fn(), signAction: vi.fn() }
    const result = await claimStream(wallet as never, 'https://overlay.example', stream)

    expect(createAction).toHaveBeenCalledTimes(1)
    const args = createAction.mock.calls[0][0] as {
      inputBEEF: number[]
      inputs: Array<{ outpoint: string }>
      outputs: Array<{ satoshis: number, outputDescription?: string }>
    }
    expect(args.inputBEEF).toEqual(stream.beef)
    expect(args.inputs[0].outpoint).toBe(`${stream.txid}.${stream.outputIndex}`)
    expect(args.outputs).toHaveLength(2)
    expect(args.outputs[0].outputDescription).toMatch(/^Claim /)
    expect(args.outputs[1].outputDescription).toMatch(/^Stream /)
    const outputSats = args.outputs.map((output) => output.satoshis)
    expect(outputSats[0]).toBeGreaterThan(0)
    expect(outputSats[0]).toBeLessThan(AMOUNT_SATS)
    expect(outputSats[0] + outputSats[1]).toBe(AMOUNT_SATS)
    expect(result.claimedSats).toBe(outputSats[0])
  })

  it('when claimable equals amountSats, still pays BRC-29 from the pot — never a 1-sat snapshot only', async () => {
    const stream = qaStream(AMOUNT_SATS, '2020-01-01T00:00:00.000Z')
    vi.mocked(lookupStreams).mockResolvedValue([stream])
    createAction.mockResolvedValue({
      txid: 'cd'.repeat(32),
      tx: [9]
    })
    vi.mocked(submitStreamTx).mockResolvedValue({ admitted: [0], raw: {} })

    const wallet = { createAction, getPublicKey, internalizeAction: vi.fn(), signAction: vi.fn() }
    const result = await claimStream(wallet as never, 'https://overlay.example', stream)

    const args = createAction.mock.calls[0][0] as {
      inputs: Array<{ outpoint: string }>
      outputs: Array<{ satoshis: number, outputDescription?: string }>
    }
    expect(args.inputs[0].outpoint).toBe(`${stream.txid}.${stream.outputIndex}`)
    expect(args.outputs).toHaveLength(2)
    expect(args.outputs[0].satoshis).toBe(AMOUNT_SATS)
    expect(args.outputs[0].outputDescription).toMatch(/^Claim /)
    expect(args.outputs[1].satoshis).toBe(1)
    expect(result.claimedSats).toBe(AMOUNT_SATS)
  })
})
