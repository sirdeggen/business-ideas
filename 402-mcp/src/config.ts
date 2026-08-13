import dotenv from 'dotenv'

dotenv.config()

export type Chain = 'main' | 'test'

function parsePositiveInt(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value === '') return fallback
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error(`${name} must be a positive integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`${name} must be a safe integer`)
  }
  return parsed
}

const rawChain = (process.env.CHAIN ?? 'main').toLowerCase()
export const CHAIN: Chain = rawChain === 'test' || rawChain === 'testnet' ? 'test' : 'main'

export const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY ?? ''
export const STORAGE_URL = process.env.STORAGE_URL || 'https://store-us-1.bsvb.tech'
export const PRICE_SATS = parsePositiveInt(process.env.PRICE_SATS, 10, 'PRICE_SATS')
export const PORT = parsePositiveInt(process.env.PORT, 3000, 'PORT')
export const HOST = process.env.HOST || '0.0.0.0'

export const FETCH_TIMEOUT_MS = parsePositiveInt(process.env.FETCH_TIMEOUT_MS, 10_000, 'FETCH_TIMEOUT_MS')
export const FETCH_MAX_BYTES = parsePositiveInt(process.env.FETCH_MAX_BYTES, 1_000_000, 'FETCH_MAX_BYTES')
export const FETCH_MAX_REDIRECTS = parsePositiveInt(process.env.FETCH_MAX_REDIRECTS, 3, 'FETCH_MAX_REDIRECTS')
