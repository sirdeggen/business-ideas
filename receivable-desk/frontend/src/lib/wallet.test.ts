import { afterEach, describe, expect, it, vi } from 'vitest'
import { CHROME_ALLOW_HINT, errorMessage, formatWalletError } from './config'
import {
  CONNECT_MS,
  CONNECT_TIMEOUT_MESSAGE,
  connectWallet,
  withTimeout
} from './wallet'

vi.mock('@bsv/sdk', () => ({
  WalletClient: class WalletClient {
    constructor() {
      return {
        getPublicKey: () => new Promise(() => {})
      }
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
      expect(errorMessage(err)).not.toMatch(/Spending Request/i)
      expect(errorMessage(err)).not.toMatch(/Wallet rejected/i)
      return true
    })
    await vi.advanceTimersByTimeAsync(CONNECT_MS)
    await rejected
  })

  it('rejects a hanging promise via withTimeout', async () => {
    vi.useFakeTimers()
    const pending = withTimeout(new Promise(() => {}), CONNECT_MS, CONNECT_TIMEOUT_MESSAGE)
    const rejected = expect(pending).rejects.toThrow(CONNECT_TIMEOUT_MESSAGE)
    await vi.advanceTimersByTimeAsync(CONNECT_MS)
    await rejected
  })

  it('resolves when the wallet answers before the timeout', async () => {
    vi.useFakeTimers()
    const pending = withTimeout(Promise.resolve('ok'), CONNECT_MS, CONNECT_TIMEOUT_MESSAGE)
    await expect(pending).resolves.toBe('ok')
    await vi.advanceTimersByTimeAsync(CONNECT_MS + 1000)
  })
})

describe('errorMessage shows raw createAction / signAction fields', () => {
  const createActionDenied = {
    call: 'createAction',
    code: 'ERR_DENIED',
    description: 'output not admitted',
    message: 'Permission denied.'
  }

  it('does not remap a wallet error to Wallet rejected / Spending Request', () => {
    const mapped = errorMessage(createActionDenied)
    expect(mapped).toContain('createAction')
    expect(mapped).toContain('ERR_DENIED')
    expect(mapped).toContain('output not admitted')
    expect(mapped).toContain('Permission denied.')
    expect(mapped).not.toMatch(/Spending Request/i)
    expect(mapped).not.toMatch(/Wallet rejected/i)
    expect(mapped).not.toMatch(/You declined the approval/i)
  })

  it('keeps an Error wrapping createAction JSON readable', () => {
    const mapped = formatWalletError(new Error(JSON.stringify(createActionDenied)))
    expect(mapped).toContain('createAction')
    expect(mapped).toContain('ERR_DENIED')
    expect(mapped).not.toMatch(/Spending Request/i)
  })

  it('maps only a silent timeout to Unlock Desktop / Retry', () => {
    expect(errorMessage(new Error(CHROME_ALLOW_HINT))).toBe(CHROME_ALLOW_HINT)
    expect(errorMessage(new Error('Wallet request timed out'))).toBe(CHROME_ALLOW_HINT)
  })
})
