import { WalletClient } from '@bsv/sdk'
import { CHROME_ALLOW_HINT, originator } from './config'

export const CONNECT_MS = 8000

async function connectWalletInner(): Promise<{ wallet: WalletClient, identityKey: string }> {
  const wallet = new WalletClient('auto', originator())
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  return { wallet, identityKey: publicKey }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer)
  })
}

export async function connectWallet(): Promise<{ wallet: WalletClient, identityKey: string }> {
  return withTimeout(connectWalletInner(), CONNECT_MS, CHROME_ALLOW_HINT)
}
