import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_CRAWLER_SATS,
  DEFAULT_HUMAN_SATS,
  isCrawler,
  prefersHtmlPaywall,
  priceForRequest
} from './pricing.js'

describe('isCrawler', () => {
  it('prices known bots and fetch tools as crawlers', () => {
    const agents = [
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2)',
      'ClaudeBot/1.0',
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'curl/8.7.1',
      'Wget/1.21.4',
      'python-requests/2.32.3',
      'Go-http-client/2.0'
    ]
    for (const userAgent of agents) {
      assert.equal(isCrawler({ 'user-agent': userAgent }), true, userAgent)
    }
  })

  it('keeps browsers and BSV Browser on the human path', () => {
    assert.equal(
      isCrawler({
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0',
        accept: 'text/html,application/xhtml+xml'
      }),
      false
    )
    assert.equal(
      isCrawler({
        'user-agent': 'BSV Browser/1.0 Mozilla/5.0',
        accept: 'text/html'
      }),
      false
    )
  })

  it('treats JSON Accept without HTML as a crawler', () => {
    assert.equal(
      isCrawler({
        'user-agent': 'Mozilla/5.0 (custom agent)',
        accept: 'application/json'
      }),
      true
    )
  })

  it('treats a missing User-Agent as a crawler', () => {
    assert.equal(isCrawler({ accept: '*/*' }), true)
  })
})

describe('priceForRequest', () => {
  const env = { HUMAN_SATS: '100', CRAWLER_SATS: '500' }

  it('uses defaults for humans and crawlers', () => {
    assert.equal(
      priceForRequest(
        {
          'user-agent': 'Mozilla/5.0',
          accept: 'text/html'
        },
        {}
      ),
      DEFAULT_HUMAN_SATS
    )
    assert.equal(priceForRequest({ 'user-agent': 'curl/8.0' }, {}), DEFAULT_CRAWLER_SATS)
  })

  it('honors HUMAN_SATS and CRAWLER_SATS', () => {
    assert.equal(
      priceForRequest(
        { 'user-agent': 'Mozilla/5.0', accept: 'text/html' },
        env
      ),
      100
    )
    assert.equal(priceForRequest({ 'user-agent': 'curl/8.0' }, env), 500)
  })
})

describe('prefersHtmlPaywall', () => {
  it('gives browsers an HTML body', () => {
    assert.equal(
      prefersHtmlPaywall({
        'user-agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0.0.0',
        accept: 'text/html,application/xhtml+xml'
      }),
      true
    )
  })

  it('keeps crawlers and JSON Accept on a machine-readable body', () => {
    assert.equal(prefersHtmlPaywall({ 'user-agent': 'curl/8.7.1' }), false)
    assert.equal(
      prefersHtmlPaywall({
        'user-agent': 'research-agent/0.1',
        accept: 'application/json'
      }),
      false
    )
    assert.equal(
      prefersHtmlPaywall({
        'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
        accept: 'text/html'
      }),
      false
    )
  })
})
