import type { Request, Response, NextFunction } from 'express'
import { send402, validatePayment } from '@bsv/402-pay/server'
import { PRICE_SATS } from './config.js'
import { getServerWallet } from './wallet.js'

const BEEF_HEADER = 'x-bsv-beef'

export function mcpMethodOf(req: Request): string | undefined {
  const header = req.headers['mcp-method']
  if (typeof header === 'string' && header.length > 0) return header
  const body = req.body
  if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.method === 'string') {
    return body.method
  }
  return undefined
}

/** Paid surface is tools/call only. initialize / tools/list stay free for discovery. */
export function isPaidToolCall(req: Request): boolean {
  return mcpMethodOf(req) === 'tools/call'
}

export async function requirePaidToolCall(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!isPaidToolCall(req)) {
    next()
    return
  }

  let identityKey: string
  let wallet
  try {
    const handle = await getServerWallet()
    identityKey = handle.identityKey
    wallet = handle.wallet
  } catch (error) {
    console.error('Wallet init failed:', error)
    res.status(500).json({ error: 'server wallet unavailable' })
    return
  }

  if (!req.headers[BEEF_HEADER]) {
    send402(res, identityKey, PRICE_SATS)
    return
  }

  try {
    const result = await validatePayment(req, wallet, PRICE_SATS)
    if (!result || !result.accepted) {
      if (result && !result.accepted) {
        console.error(`Payment rejected: ${req.path} | ${result.reason}`)
      }
      send402(res, identityKey, PRICE_SATS)
      return
    }
    console.log(`Payment accepted: ${req.path} | ${PRICE_SATS} sats | txid: ${result.txid}`)
    next()
  } catch (error) {
    console.error('Payment validation failed:', error)
    send402(res, identityKey, PRICE_SATS)
  }
}
