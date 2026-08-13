import type { NextFunction, Request, Response } from 'express'
import { send402, validatePayment } from '@bsv/402-pay/server'
import { priceForRequest } from './pricing.js'
import { identityKeyFromEnv, makeWallet } from './wallet.js'

declare global {
  namespace Express {
    interface Request {
      payment?: {
        accepted: true
        satoshisPaid: number
        senderIdentityKey: string
        txid: string
      }
    }
  }
}

/**
 * Dual-price 402 gate.
 *
 * @bsv/402-pay 0.2.4 `createPaymentMiddleware` only receives `req.path` in
 * `calculatePrice`, so human vs crawler pricing cannot live there. This
 * wrapper uses the public `validatePayment` + `send402` exports instead.
 */
export function createPayPerCrawlMiddleware() {
  return async (req: Request, res: Response, next: NextFunction) => {
    let identityKey: string
    try {
      identityKey = identityKeyFromEnv()
    } catch (error) {
      console.error('Server identity key unavailable:', error)
      res.status(500).end()
      return
    }

    let price: number
    try {
      price = priceForRequest(req.headers)
    } catch (error) {
      console.error('Invalid price configuration:', error)
      res.status(500).end()
      return
    }

    if (price === 0) {
      next()
      return
    }

    const hasPayment = req.headers['x-bsv-beef']
    if (!hasPayment) {
      send402(res, identityKey, price)
      return
    }

    try {
      const { wallet } = await makeWallet()
      const result = await validatePayment(req, wallet, price)
      if (!result) {
        send402(res, identityKey, price)
        return
      }
      if (!result.accepted) {
        console.error(`Payment rejected: ${req.path} | ${result.reason}`)
        send402(res, identityKey, price)
        return
      }
      req.payment = result
      console.log(`Payment accepted: ${req.path} | ${price} sats | txid: ${result.txid}`)
      next()
    } catch (error) {
      console.error('Payment validation failed:', error)
      send402(res, identityKey, price)
    }
  }
}
