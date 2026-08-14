import { WalletClient } from '@bsv/sdk'
import { originator } from './config'

/**
 * Bind the page hostname. `@bsv/simple` `createWallet()` uses originator
 * `"simple"`, which is a different BRC-100 app than `sirdeggen.github.io`.
 * Tickets minted on Pages under one originator are invisible to listOutputs
 * under the other. Mint and list both use this client; Refresh also probes
 * `"simple"` so older createWallet() mints still appear.
 */
export async function connectWallet(): Promise<{ wallet: WalletClient, identityKey: string }> {
  const wallet = new WalletClient('auto', originator())
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  return { wallet, identityKey: publicKey }
}
