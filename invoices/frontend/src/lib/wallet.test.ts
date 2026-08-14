import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorMessage } from './config'
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
