import { afterEach, describe, expect, it, vi } from 'vitest'
import { DECLINED_APPROVAL_MINT, UNLOCK_RETRY, errorMessage } from './config'
import {
  CONNECT_MS,
  CONNECT_TIMEOUT_MESSAGE,
  connectWallet,
  withTimeout
} from './wallet'

vi.mock('@bsv/sdk', () => ({
  WalletClient: class WalletClient {
    getPublicKey() {
      return new Promise(() => {})
    }
  }
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

describe('errorMessage wallet failures', () => {
  const createActionDenied = {
    call: 'createAction',
    args: {
      description: 'Mint 5 Demo Night tickets',
      outputs: [{ satoshis: 1 }]
    },
    message: 'Permission denied.'
  }
  const createActionJson = JSON.stringify(createActionDenied)

  it('maps a createAction Permission denied object to the declined-approval sentence', () => {
    const mapped = errorMessage(createActionDenied)
    expect(mapped).toBe(DECLINED_APPROVAL_MINT)
    expect(mapped).not.toContain('createAction')
    expect(mapped).not.toContain('{')
    expect(mapped).not.toMatch(/"call"/)
  })

  it('maps an Error wrapping createAction JSON to the declined-approval sentence', () => {
    const mapped = errorMessage(new Error(createActionJson))
    expect(mapped).toBe(DECLINED_APPROVAL_MINT)
    expect(mapped).not.toContain(createActionJson)
    expect(mapped).not.toContain('createAction')
    expect(mapped).not.toContain('{')
  })

  it('maps a hang timeout to Unlock Desktop and try again', () => {
    expect(errorMessage(new Error(UNLOCK_RETRY))).toBe(UNLOCK_RETRY)
    expect(errorMessage(new Error('Wallet request timed out'))).toBe(UNLOCK_RETRY)
  })

  it('never surfaces Spending Request jargon', () => {
    const mapped = errorMessage(new Error('Wallet rejected the Spending Request. Approve it in BSV Desktop, or you cancelled.'))
    expect(mapped).toBe(DECLINED_APPROVAL_MINT)
    expect(mapped).not.toContain('Spending Request')
  })
})
