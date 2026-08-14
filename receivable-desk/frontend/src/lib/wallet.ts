import { WalletClient } from '@bsv/sdk'
import { originator } from './config'

/**
 * Bind the page hostname. `@bsv/simple` `createWallet()` uses originator
 * `"simple"`, which is a different BRC-100 app than `sirdeggen.github.io`.
 * Registers created on Pages under one originator are invisible to listOutputs
 * under the other. Register and list both use this client; Refresh also probes
 * `"simple"` so older createWallet() registers still appear.
 */
export async function connectWallet(): Promise<{ wallet: WalletClient, identityKey: string }> {
  const wallet = new WalletClient('auto', originator())
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  return { wallet, identityKey: publicKey }
}
