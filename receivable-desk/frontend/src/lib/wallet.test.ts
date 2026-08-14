import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CHROME_ALLOW_HINT,
  DECLINED_APPROVAL_RECORD,
  DECLINED_APPROVAL_REFRESH,
  errorMessage
} from './config'
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
      return true
    })
    await vi.advanceTimersByTimeAsync(CONNECT_MS)
    await rejected
  })

  it('rejects a hanging createAction via withTimeout', async () => {
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

describe('errorMessage wallet failures', () => {
  const createActionDenied = {
    call: 'createAction',
    args: { description: 'Register receivable QA-0813-NAMED' },
    message: 'Permission denied.'
  }

  it('maps Permission denied to Unlock Desktop / Record again, never Spending Request', () => {
    const mapped = errorMessage(createActionDenied)
    expect(mapped).toBe(DECLINED_APPROVAL_RECORD)
    expect(mapped).not.toMatch(/Spending Request/i)
    expect(mapped).not.toContain('createAction')
  })

  it('maps a hanging/timeout to the unlock path', () => {
    expect(errorMessage(new Error(CHROME_ALLOW_HINT))).toBe(CHROME_ALLOW_HINT)
    expect(errorMessage(new Error('Wallet request timed out'))).toBe(CHROME_ALLOW_HINT)
    expect(errorMessage(new Error('Wallet rejected the Spending Request'))).toBe(CHROME_ALLOW_HINT)
  })

  it('uses Refresh copy on Chase', () => {
    expect(errorMessage(createActionDenied, 'refresh')).toBe(DECLINED_APPROVAL_REFRESH)
  })
})
