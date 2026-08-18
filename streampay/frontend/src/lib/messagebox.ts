import { MessageBoxClient } from '@bsv/message-box-client'
import type { WalletClient } from '@bsv/sdk'
import { MESSAGE_BOX, MESSAGE_BOX_HOST } from './config'

export type StreamEventKind = 'opened' | 'claimed' | 'frozen'

export interface StreamEvent {
  streamId: string
  kind: StreamEventKind
  at: string
  payload: Record<string, unknown>
}

export function messageBoxClient(wallet: WalletClient): MessageBoxClient {
  return new MessageBoxClient({
    host: MESSAGE_BOX_HOST,
    walletClient: wallet
  })
}

export async function notifyOtherParty(
  wallet: WalletClient,
  recipient: string,
  event: StreamEvent
): Promise<void> {
  const key = recipient.trim()
  if (!key) return
  try {
    const client = messageBoxClient(wallet)
    await client.sendMessage({
      recipient: key,
      messageBox: MESSAGE_BOX,
      body: event
    }, MESSAGE_BOX_HOST)
  } catch {
    // Overlay remains the public source of truth.
  }
}
