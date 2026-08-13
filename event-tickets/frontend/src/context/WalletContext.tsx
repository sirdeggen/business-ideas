import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { WalletClient } from '@bsv/sdk'
import { connectWallet } from '../lib/wallet'
import { errorMessage } from '../lib/config'

interface WalletState {
  wallet: WalletClient | null
  identityKey: string | null
  connecting: boolean
  error: string | null
  connect: () => Promise<void>
}

const WalletContext = createContext<WalletState | undefined>(undefined)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletClient | null>(null)
  const [identityKey, setIdentityKey] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const connect = async (): Promise<void> => {
    setConnecting(true)
    setError(null)
    try {
      const result = await connectWallet()
      setWallet(result.wallet)
      setIdentityKey(result.identityKey)
    } catch (err) {
      console.error('Wallet connect failed', err)
      setError(errorMessage(err))
      setWallet(null)
      setIdentityKey(null)
    } finally {
      setConnecting(false)
    }
  }

  useEffect(() => {
    void connect()
  }, [])

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
