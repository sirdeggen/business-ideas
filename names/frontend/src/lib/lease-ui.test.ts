import { describe, expect, it } from 'vitest'
import { canOpenWalletForRenew, isHolder, leaseActions } from './lease-ui'

const HOLDER = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`
const lease = { lessee: HOLDER }

describe('stranger renew is read-only', () => {
  it('does not offer Renew without a connected holder', () => {
    expect(leaseActions(lease, null)).toEqual({
      showRegister: false,
      showRenew: false,
      showHolderCopy: true,
      showPeriodPicker: false
    })
    expect(canOpenWalletForRenew(lease, null)).toBe(false)
    expect(isHolder(lease, null)).toBe(false)
  })

  it('does not offer Renew to another identity', () => {
    expect(leaseActions(lease, OTHER)).toEqual({
      showRegister: false,
      showRenew: false,
      showHolderCopy: true,
      showPeriodPicker: false
    })
    expect(canOpenWalletForRenew(lease, OTHER)).toBe(false)
  })

  it('offers Renew only to the holder', () => {
    expect(leaseActions(lease, HOLDER)).toEqual({
      showRegister: false,
      showRenew: true,
      showHolderCopy: false,
      showPeriodPicker: true
    })
    expect(canOpenWalletForRenew(lease, HOLDER)).toBe(true)
  })

  it('offers Register on a free name', () => {
    expect(leaseActions(null, null)).toEqual({
      showRegister: true,
      showRenew: false,
      showHolderCopy: false,
      showPeriodPicker: true
    })
    expect(canOpenWalletForRenew(null, HOLDER)).toBe(false)
  })
})
