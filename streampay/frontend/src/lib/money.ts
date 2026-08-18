export const SATS_PER_BSV = 100_000_000

async function readJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`Rate HTTP ${response.status}`)
  return response.json()
}

export async function fetchUsdPerBsv(): Promise<number> {
  try {
    const data = await readJson('https://api.whatsonchain.com/v1/bsv/main/exchangerate') as {
      rate?: string | number
    }
    const rate = Number(data.rate)
    if (Number.isFinite(rate) && rate > 0) return rate
  } catch {
    // Fall through to CoinGecko.
  }

  try {
    const data = await readJson(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash-sv&vs_currencies=usd'
    ) as { 'bitcoin-cash-sv'?: { usd?: number } }
    const rate = Number(data['bitcoin-cash-sv']?.usd)
    if (Number.isFinite(rate) && rate > 0) return rate
  } catch {
    // No invented price.
  }

  throw new Error('Could not fetch a dollar rate')
}

export function parseSatsAmount(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, '').replace(/\s*sats?$/i, '')
  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Enter an amount in sats')
  }
  const sats = Number(trimmed)
  if (!Number.isInteger(sats) || sats < 1) {
    throw new Error('Enter an amount in sats')
  }
  return sats
}

export function formatSats(sats: number): string {
  if (!Number.isFinite(sats)) return ''
  return `${Math.trunc(sats).toLocaleString('en-US')} sats`
}

export function satsToDisplayUsd(sats: number, usdPerBsv: number | null): string {
  if (!usdPerBsv || usdPerBsv <= 0 || !Number.isFinite(sats) || sats < 0) return ''
  return formatUsd((sats / SATS_PER_BSV) * usdPerBsv)
}

export function formatUsd(amount: string | number): string {
  const value = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(value)) return typeof amount === 'string' && amount ? `$${amount}` : ''
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatUsdInput(amount: number): string {
  return amount.toFixed(2)
}

export function satsToUsdInput(sats: number, usdPerBsv: number): string {
  return formatUsdInput((sats / SATS_PER_BSV) * usdPerBsv)
}
