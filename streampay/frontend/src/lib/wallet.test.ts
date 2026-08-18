import { afterEach, describe, expect, it, vi } from 'vitest'
import { INSUFFICIENT_FUND_MESSAGE } from '../../../protocol/stream'
import {
  CHROME_ALLOW_HINT,
  DECLINED_APPROVAL_CLAIM,
  DECLINED_APPROVAL_FREEZE,
  DECLINED_APPROVAL_OPEN,
  OVERLAY_CLAIM_FAILED,
  OVERLAY_FREEZE_FAILED,
  OVERLAY_LOOKUP_FAILED,
  OVERLAY_OPEN_FAILED,
  errorMessage
} from './config'
import {
  CONNECT_MS,
  CONNECT_TIMEOUT_MESSAGE,
  connectWallet,
  withTimeout
} from './wallet'

vi.mock('@bsv/simple/browser', () => ({
  createWallet: () => new Promise(() => {})
}))

vi.mock('@bsv/sdk', () => ({
  WalletClient: class WalletClient {}
}))

describe('wallet connect timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rejects a hanging connectWallet after the timeout', async () => {
    vi.useFakeTimers()
    const pending = connectWallet()
    const rejected = expect(pending).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(Error)
      expect(errorMessage(err)).toBe(CONNECT_TIMEOUT_MESSAGE)
      return true
    })
    await vi.advanceTimersByTimeAsync(CONNECT_MS)
    await rejected
  })

  it('rejects a never-resolving promise via withTimeout', async () => {
    vi.useFakeTimers()
    const pending = withTimeout(new Promise(() => {}), CONNECT_MS, CONNECT_TIMEOUT_MESSAGE)
    const rejected = expect(pending).rejects.toThrow(CONNECT_TIMEOUT_MESSAGE)
    await vi.advanceTimersByTimeAsync(CONNECT_MS - 1)
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(1)
    await rejected
  })

  it('resolves when the wallet answers before the timeout and clears the timer', async () => {
    vi.useFakeTimers()
    const pending = withTimeout(Promise.resolve('ok'), CONNECT_MS, CONNECT_TIMEOUT_MESSAGE)
    await expect(pending).resolves.toBe('ok')
    await vi.advanceTimersByTimeAsync(CONNECT_MS + 1000)
  })
})

describe('errorMessage humanizing', () => {
  const createActionDenied = {
    call: 'createAction',
    args: {
      description: 'Open stream: Legal research week',
      outputs: [{ satoshis: 1 }]
    },
    message: 'Permission denied.'
  }
  const createActionJson = JSON.stringify(createActionDenied)

  it('never prints createAction JSON', () => {
    const mapped = errorMessage(createActionDenied)
    expect(mapped).toBe(DECLINED_APPROVAL_OPEN)
    expect(mapped).not.toContain('createAction')
    expect(mapped).not.toContain('{')
    expect(mapped).not.toMatch(/"call"/)
    expect(errorMessage(new Error(createActionJson))).toBe(DECLINED_APPROVAL_OPEN)
    expect(errorMessage(createActionDenied, 'claim')).toBe(DECLINED_APPROVAL_CLAIM)
    expect(errorMessage(createActionDenied, 'freeze')).toBe(DECLINED_APPROVAL_FREEZE)
  })

  it('maps overlay host-reject sentences to human copy, never tm_anytx / STEAK / hosts', () => {
    const live = new Error(
      'Overlay broadcast to tm_anytx at https://overlay-us-1.bsvb.tech failed: All local topical hosts have rejected the transaction.'
    )
    const mapped = errorMessage(live)
    expect(mapped).toBe(OVERLAY_OPEN_FAILED)
    expect(mapped.toLowerCase()).not.toContain('declined')
    expect(mapped).not.toContain('tm_anytx')
    expect(mapped).not.toContain('overlay-us-1')
    expect(mapped).not.toContain('STEAK')
    expect(mapped).not.toContain('ls_anytx')
    expect(errorMessage(live, 'claim')).toBe(OVERLAY_CLAIM_FAILED)
    expect(errorMessage(live, 'freeze')).toBe(OVERLAY_FREEZE_FAILED)
    expect(errorMessage(new Error('ERR_ALL_HOSTS_REJECTED'))).toBe(OVERLAY_OPEN_FAILED)
    expect(errorMessage(new Error('overlay submit failed'), 'claim')).toBe(OVERLAY_CLAIM_FAILED)
  })

  it('maps a wallet timeout to the Chrome allow sentence', () => {
    expect(errorMessage(new Error('timeout'))).toBe(CHROME_ALLOW_HINT)
  })

  it('keeps a stream lookup miss as a one-line load failure, not Chrome or host jargon', () => {
    expect(errorMessage(new Error(OVERLAY_LOOKUP_FAILED))).toBe(OVERLAY_LOOKUP_FAILED)
    expect(OVERLAY_LOOKUP_FAILED).toBe('Can’t reach overlay. Retry')
    expect(OVERLAY_LOOKUP_FAILED).not.toContain('tm_anytx')
    expect(OVERLAY_LOOKUP_FAILED).not.toContain('STEAK')
  })

  it('maps insufficient funds to a human open sentence, never createAction JSON', () => {
    const broke = {
      call: 'createAction',
      args: { outputs: [{ satoshis: 594_598_868 }] },
      message: 'Insufficient funds'
    }
    const mapped = errorMessage(broke, 'open')
    expect(mapped).toBe(INSUFFICIENT_FUND_MESSAGE)
    expect(mapped).not.toContain('createAction')
    expect(mapped).not.toContain('594598868')
    expect(errorMessage(new Error(JSON.stringify(broke)), 'open')).toBe(INSUFFICIENT_FUND_MESSAGE)
  })
})
