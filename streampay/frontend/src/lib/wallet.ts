import { WalletClient } from '@bsv/sdk'
import { createWallet } from '@bsv/simple/browser'
import { CHROME_ALLOW_HINT, originator } from './config'
import { withTimeout } from './timeout'

export const CONNECT_MS = 8000

export const CONNECT_TIMEOUT_MESSAGE = CHROME_ALLOW_HINT

export { withTimeout }

async function connectWalletInner(): Promise<{ wallet: WalletClient, identityKey: string }> {
  const pageOriginator = originator()
  try {
    const simple = await createWallet()
    const wallet = simple.getClient() as WalletClient
    return { wallet, identityKey: simple.getIdentityKey() }
  } catch {
    const wallet = new WalletClient('auto', pageOriginator)
    const { publicKey } = await wallet.getPublicKey({ identityKey: true })
    return { wallet, identityKey: publicKey }
  }
}

export async function connectWallet(): Promise<{ wallet: WalletClient, identityKey: string }> {
  return withTimeout(connectWalletInner(), CONNECT_MS, CONNECT_TIMEOUT_MESSAGE)
}
