import { WalletClient } from '@bsv/sdk'
import { originator } from './config'

export async function connectWallet(): Promise<{ wallet: WalletClient, identityKey: string }> {
  const wallet = new WalletClient('auto', originator())
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  return { wallet, identityKey: publicKey }
}
