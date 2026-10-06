import { describe, expect, it } from 'vitest'
import { parsePaymentLink, parsePaymentLocation, paymentHref } from './route'

const PAYMENT_ID = 'ab'.repeat(16)
const HINT_TX = 'cd'.repeat(32)

describe('payment deep links', () => {
  it('reads ?p= and optional ?tx=', () => {
    expect(parsePaymentLocation(`?p=${PAYMENT_ID}&tx=${HINT_TX}`)).toEqual({
      paymentId: PAYMENT_ID,
      hintTxid: HINT_TX
    })
    expect(parsePaymentLocation(`?p=${PAYMENT_ID}`)).toEqual({
      paymentId: PAYMENT_ID,
      hintTxid: null
    })
  })

  it('builds query-param links, never /p/:id', () => {
    const href = paymentHref(PAYMENT_ID, HINT_TX)
    expect(href).toContain(`?p=${PAYMENT_ID}`)
    expect(href).toContain(`tx=${HINT_TX}`)
    expect(href).not.toContain('/p/')
    expect(href).not.toMatch(/\/p\/[0-9a-f]{32}/)
  })

  it('does not treat a path /p/:id as a payment id', () => {
    expect(parsePaymentLocation('', `#/p/${PAYMENT_ID}`)).toEqual({
      paymentId: null,
      hintTxid: null
    })
  })

  it('reads a pasted link and a hash query after a Pages 404 redirect', () => {
    expect(parsePaymentLocation('', `#/?p=${PAYMENT_ID}&tx=${HINT_TX}`)).toEqual({
      paymentId: PAYMENT_ID,
      hintTxid: HINT_TX
    })
    expect(parsePaymentLink(`https://sirdeggen.github.io/business-ideas/private-pay/?p=${PAYMENT_ID}&tx=${HINT_TX}`)).toEqual({
      paymentId: PAYMENT_ID,
      hintTxid: HINT_TX
    })
  })
})
