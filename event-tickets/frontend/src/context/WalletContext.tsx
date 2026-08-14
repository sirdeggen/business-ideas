import { createContext, useContext, useState, type ReactNode } from 'react'
import type { WalletClient } from '@bsv/sdk'
import { errorMessage } from '../lib/config'
import { connectWallet } from '../lib/wallet'

interface WalletState {
  wallet: WalletClient | null
  identityKey: string | null
  connecting: boolean
  error: string | null
  connect: () => Promise<WalletClient>
}

const WalletContext = createContext<WalletState | undefined>(undefined)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletClient | null>(null)
  const [identityKey, setIdentityKey] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<WalletClient> => {
    if (wallet) return wallet
    setConnecting(true)
    setError(null)
    try {
      const result = await connectWallet()
      setWallet(result.wallet)
      setIdentityKey(result.identityKey)
      return result.wallet
    } catch (err) {
      setError(errorMessage(err))
      setWallet(null)
      setIdentityKey(null)
      throw err
    } finally {
      setConnecting(false)
    }
  }

  return (
    <WalletContext.Provider value={{ wallet, identityKey, connecting, error, connect }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext)
  if (!context) throw new Error('useWallet must be used within WalletProvider')
  return context
}
