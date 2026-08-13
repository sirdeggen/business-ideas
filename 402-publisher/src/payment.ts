import type { NextFunction, Request, Response } from 'express'
import { send402, validatePayment, type PaymentResponse } from '@bsv/402-pay/server'
import { getArticle } from './articles.js'
import { paywallPage } from './html.js'
import { prefersHtmlPaywall, priceForRequest } from './pricing.js'
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
 * @bsv/402-pay 0.2.4 `send402` always `end()`s with an empty body. Chrome treats
 * that as net::ERR_HTTP_RESPONSE_CODE_FAILURE and never paints a page or fires
 * the 402-extension UI. Wrap the PaymentResponse so send402 still sets status
 * 402 + x-bsv-sats / x-bsv-server, then attach a body.
 */
export function send402WithBody(
  res: Response,
  identityKey: string,
  sats: number,
  body?: { contentType: string; payload: string }
): void {
  const wrapped: PaymentResponse = {
    set(headers) {
      res.set(headers)
      return wrapped
    },
    status(code) {
      res.status(code)
      return wrapped
    },
    end() {
      if (!body) {
        res.end()
        return
      }
      res.type(body.contentType)
      res.send(body.payload)
    }
  }
  send402(wrapped, identityKey, sats)
}

function articleTitleFor(req: Request): string | undefined {
  const slug = req.path.replace(/^\/articles\//, '')
  return getArticle(slug)?.title
}

function challenge402(req: Request, res: Response, identityKey: string, sats: number): void {
  if (prefersHtmlPaywall(req.headers)) {
    send402WithBody(res, identityKey, sats, {
      contentType: 'html',
      payload: paywallPage(sats, articleTitleFor(req))
    })
    return
  }
  send402WithBody(res, identityKey, sats, {
    contentType: 'json',
    payload: JSON.stringify({
      status: 402,
      satoshis: sats,
      server: identityKey,
      protocol: 'BRC-121'
    })
  })
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
      challenge402(req, res, identityKey, price)
      return
    }

    try {
      const { wallet } = await makeWallet()
      const result = await validatePayment(req, wallet, price)
      if (!result) {
        challenge402(req, res, identityKey, price)
        return
      }
      if (!result.accepted) {
        console.error(`Payment rejected: ${req.path} | ${result.reason}`)
        challenge402(req, res, identityKey, price)
        return
      }
      req.payment = result
      console.log(`Payment accepted: ${req.path} | ${price} sats | txid: ${result.txid}`)
      next()
    } catch (error) {
      console.error('Payment validation failed:', error)
      challenge402(req, res, identityKey, price)
    }
  }
}
