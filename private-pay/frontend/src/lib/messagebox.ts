import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from '../../../protocol/private-pay'

export interface PrivatePayNotice {
  kind: 'payment' | 'attest' | 'grant' | 'revoke'
  paymentId: string
  grantId?: string
  txid: string
}

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

/** Optional private nudge. Overlay remains the public book. */
export async function nudgePrivatePay(
  wallet: WalletClient,
  selfIdentityKey: string,
  recipients: string[],
  body: PrivatePayNotice
): Promise<void> {
  const self = selfIdentityKey.toLowerCase()
  const unique = [...new Set(recipients.map((key) => key.trim()).filter(Boolean))]
    .filter((key) => key.toLowerCase() !== self)
  if (unique.length === 0) return
  try {
    const client = messageBoxClient(wallet)
    await Promise.all(unique.map(async (recipient) => {
      await client.sendMessage({
        recipient,
        messageBox: MESSAGE_BOX,
        body
      }, MESSAGE_BOX_HOST)
    }))
  } catch {
    // Overlay is the public source of truth.
  }
}
