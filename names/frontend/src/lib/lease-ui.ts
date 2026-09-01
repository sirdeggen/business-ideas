import { sameLessee } from '../../../protocol/namelease'

export function isHolder(
  lease: { lessee: string } | null | undefined,
  identityKey: string | null | undefined
): boolean {
  return Boolean(lease && identityKey && sameLessee(lease.lessee, identityKey))
}

/** Renew / createAction only when this identity already holds the lease. */
export function canOpenWalletForRenew(
  lease: { lessee: string } | null | undefined,
  identityKey: string | null | undefined
): boolean {
  return isHolder(lease, identityKey)
}

export function leaseActions(
  lease: { lessee: string } | null | undefined,
  identityKey: string | null | undefined
): {
  showRegister: boolean
  showRenew: boolean
  showHolderCopy: boolean
  showPeriodPicker: boolean
} {
  const leased = Boolean(lease)
  const mine = isHolder(lease, identityKey)
  return {
    showRegister: !leased,
    showRenew: mine,
    showHolderCopy: leased && !mine,
    showPeriodPicker: !leased || mine
  }
}
