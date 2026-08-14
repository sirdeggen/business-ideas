import { WalletClient } from '@bsv/sdk'
import { CHROME_ALLOW_HINT, originator } from './config'

export const CONNECT_MS = 8000

export const CONNECT_TIMEOUT_MESSAGE = CHROME_ALLOW_HINT

/**
 * Bind the page hostname. `@bsv/simple` `createWallet()` uses originator
 * `"simple"`, which is a different BRC-100 app than `sirdeggen.github.io`.
 * Registers created on Pages under one originator are invisible to listOutputs
 * under the other. Register and list both use this client; Refresh also probes
 * `"simple"` so older createWallet() registers still appear.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

async function connectWalletInner(): Promise<{ wallet: WalletClient, identityKey: string }> {
  const wallet = new WalletClient('auto', originator())
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  return { wallet, identityKey: publicKey }
}

export async function connectWallet(): Promise<{ wallet: WalletClient, identityKey: string }> {
  return withTimeout(connectWalletInner(), CONNECT_MS, CONNECT_TIMEOUT_MESSAGE)
}
