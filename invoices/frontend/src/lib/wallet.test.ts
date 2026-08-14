import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DECLINED_APPROVAL_PAY,
  DECLINED_APPROVAL_SEND,
  OVERLAY_PAY_FAILED,
  OVERLAY_SEND_FAILED,
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

describe('errorMessage wallet failures', () => {
  const createActionDenied = {
    call: 'createAction',
    args: {
      description: 'Send invoice: 2026 dues',
      outputs: [{ satoshis: 1 }]
    },
    message: 'Permission denied.'
  }
  const createActionJson = JSON.stringify(createActionDenied)

  it('maps a createAction Permission denied object to the declined-approval sentence', () => {
    const mapped = errorMessage(createActionDenied)
    expect(mapped).toBe(DECLINED_APPROVAL_SEND)
    expect(mapped).not.toContain('createAction')
    expect(mapped).not.toContain('{')
    expect(mapped).not.toMatch(/"call"/)
  })

  it('maps an Error wrapping createAction JSON to the declined-approval sentence', () => {
    const mapped = errorMessage(new Error(createActionJson))
    expect(mapped).toBe(DECLINED_APPROVAL_SEND)
    expect(mapped).not.toContain(createActionJson)
    expect(mapped).not.toContain('createAction')
    expect(mapped).not.toContain('{')
  })

  it('uses Pay copy on the pay screen', () => {
    expect(errorMessage(createActionDenied, 'pay')).toBe(DECLINED_APPROVAL_PAY)
    expect(errorMessage(new Error(createActionJson), 'pay')).toBe(DECLINED_APPROVAL_PAY)
  })

  it('does not remap already-paid overlay errors to a declined spend', () => {
    expect(errorMessage(new Error('Invoice already paid'))).toBe('Invoice already paid')
    expect(errorMessage(new Error('Overlay rejected the payment (already paid or malformed)')))
      .toBe('Overlay rejected the payment (already paid or malformed)')
  })

  it('maps the live overlay host-reject sentence to human copy, never declined or tm_anytx', () => {
    const live = new Error(
      'Overlay broadcast to tm_anytx at https://overlay-us-1.bsvb.tech failed: All local topical hosts have rejected the transaction.'
    )
    const mapped = errorMessage(live)
    expect(mapped).toBe(OVERLAY_SEND_FAILED)
    expect(mapped.toLowerCase()).not.toContain('declined')
    expect(mapped).not.toContain('tm_anytx')
    expect(mapped).not.toContain('overlay-us-1')
    expect(mapped).not.toContain('STEAK')
    expect(errorMessage(live, 'pay')).toBe(OVERLAY_PAY_FAILED)
    expect(errorMessage(new Error('ERR_ALL_HOSTS_REJECTED'))).toBe(OVERLAY_SEND_FAILED)
    expect(errorMessage(new Error('overlay submit failed'), 'pay')).toBe(OVERLAY_PAY_FAILED)
  })
})
