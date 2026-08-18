const SATS_PER_BSV = 100_000_000

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

export function parseUsdAmount(raw: string): number {
  const trimmed = raw.trim().replace(/^[\$]/, '').replace(/,/g, '')
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter an amount in dollars')
  }
  if (amount > 1_000_000) throw new Error('Amount is too large')
  return Math.round(amount * 100) / 100
}

export function usdToSats(usd: number, usdPerBsv: number): number {
  if (!(usdPerBsv > 0)) throw new Error('Could not fetch a dollar rate')
  const sats = Math.round((usd / usdPerBsv) * SATS_PER_BSV)
  if (!Number.isInteger(sats) || sats < 1) {
    throw new Error('Amount is too small at the current rate')
  }
  return sats
}

export function satsToUsd(sats: number, usdPerBsv: number): number {
  if (!(usdPerBsv > 0)) throw new Error('Could not fetch a dollar rate')
  return Math.round((sats / SATS_PER_BSV) * usdPerBsv * 100) / 100
}

export function formatUsd(amount: string | number): string {
  const value = typeof amount === 'number' ? amount : Number(amount)
  if (!Number.isFinite(value)) return typeof amount === 'string' && amount ? `$${amount}` : ''
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

export function formatUsdInput(amount: number): string {
  return amount.toFixed(2)
}

export function displayUsd(
  amountUsd?: string | number,
  sats?: number,
  usdPerBsv?: number | null
): string {
  if (amountUsd !== undefined && amountUsd !== '') {
    const formatted = formatUsd(amountUsd)
    if (formatted) return formatted
  }
  if (typeof sats === 'number' && Number.isFinite(sats) && usdPerBsv && usdPerBsv > 0) {
    return formatUsd(satsToUsd(sats, usdPerBsv))
  }
  return 'a gift'
}
