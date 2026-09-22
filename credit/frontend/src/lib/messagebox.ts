import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from '../../../protocol/credit'

export interface CreditNotice {
  kind: 'term' | 'draw' | 'repay' | 'default'
  facilityId: string
  txid: string
}

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

/** Optional private nudge. Overlay remains the public book. */
export async function nudgeCredit(
  wallet: WalletClient,
  selfIdentityKey: string,
  recipient: string,
  body: CreditNotice
): Promise<void> {
  if (!recipient || recipient.toLowerCase() === selfIdentityKey.toLowerCase()) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient,
      messageBox: MESSAGE_BOX,
      body
    }, MESSAGE_BOX_HOST)
  } catch {
    // Overlay is the public source of truth.
  }
}
