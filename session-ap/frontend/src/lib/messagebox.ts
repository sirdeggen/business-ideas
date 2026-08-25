import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from './protocol'

export interface SessionNotice {
  kind: 'closed' | 'approved' | 'paid'
  sessionId: string
  label: string
}

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

export async function nudgePeer(
  wallet: WalletClient,
  selfIdentityKey: string,
  recipient: string,
  body: SessionNotice
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
    // Overlay remains the public book. Message Box is only a private nudge.
  }
}
