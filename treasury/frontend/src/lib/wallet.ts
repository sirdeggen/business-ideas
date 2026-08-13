import { WalletClient } from '@bsv/sdk'
import { createWallet } from '@bsv/simple/browser'
import { originator } from './config'

export async function connectWallet(): Promise<{ wallet: WalletClient; identityKey: string }> {
  const pageOriginator = originator()
  try {
    const simple = await createWallet()
    const wallet = simple.getClient() as WalletClient
    return { wallet, identityKey: simple.getIdentityKey() }
  } catch {
    const wallet = new WalletClient('auto', pageOriginator)
    await wallet.waitForAuthentication()
    const { publicKey } = await wallet.getPublicKey({ identityKey: true })
    return { wallet, identityKey: publicKey }
  }
}
