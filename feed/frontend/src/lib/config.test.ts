import { describe, expect, it } from 'vitest'
import {
  CHROME_ALLOW_HINT,
  DECLINED_APPROVAL,
  OVERLAY_ACTION_FAILED,
  errorMessage,
  isWalletMissing
} from './config'

describe('honest wallet install', () => {
  it('treats no-wallet-over-substrate as missing', () => {
    const missing = new Error('No wallet available over any communication substrate')
    expect(isWalletMissing(missing)).toBe(true)
    expect(isWalletMissing('no wallet found')).toBe(true)
    expect(isWalletMissing('Wallet is not available')).toBe(true)
    expect(errorMessage(missing)).toBe(CHROME_ALLOW_HINT)
  })

  it('does not treat overlay, network, or decline as a missing wallet', () => {
    const overlay = new Error('Overlay submit failed: hosts have rejected the transaction')
    const network = new Error('Failed to fetch')
    const decline = { call: 'createAction', message: 'Permission denied.' }
    const timeout = new Error('Wallet request timed out')

    expect(isWalletMissing(overlay)).toBe(false)
    expect(isWalletMissing(network)).toBe(false)
    expect(isWalletMissing(decline)).toBe(false)
    expect(isWalletMissing(timeout)).toBe(false)
    expect(isWalletMissing(CHROME_ALLOW_HINT)).toBe(false)

    expect(errorMessage(overlay)).toBe(OVERLAY_ACTION_FAILED)
    expect(errorMessage(network)).toBe('Failed to fetch')
    expect(errorMessage(decline)).toBe(DECLINED_APPROVAL)
    expect(errorMessage(timeout)).toBe(CHROME_ALLOW_HINT)
    expect(errorMessage(overlay)).not.toContain('Install')
    expect(errorMessage(decline)).not.toContain('Install')
  })
})
