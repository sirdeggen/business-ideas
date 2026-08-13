# 402 Press

A Ghost-class page that charges **readers and crawlers per fetch**. One site, paid articles, two prices. HTTP 402 is [BRC-121](https://bsv.brc.dev/payments/0121) on **BSV only**, via [`@bsv/402-pay`](https://www.npmjs.com/package/@bsv/402-pay) `0.2.4` and [`@bsv/sdk`](https://www.npmjs.com/package/@bsv/sdk). Prices in sats. Wallets: BSV Desktop, BSV Browser, 402-extension. No accounts.

`GET /` is free. `/articles/:slug` returns **402** until a valid payment is attached.

| Audience | Default price | How we detect it |
| --- | --- | --- |
| Humans / BSV Browser | **100 sats** (`HUMAN_SATS`) | Browser `User-Agent` and `Accept: text/html` |
| Crawlers / agents | **500 sats** (`CRAWLER_SATS`) | Bot/tool UA (`GPTBot`, `ClaudeBot`, `Googlebot`, `Bingbot`, `curl`, `wget`, `python-requests`, `Go-http-client`, …) or `Accept: application/json` without HTML |

The crawler price is an invoice, not a block. Both audiences get `x-bsv-sats` and `x-bsv-server`.

Browser 402s include a small **HTML paywall** (Chrome fails empty 402s with `net::ERR_HTTP_RESPONSE_CODE_FAILURE`). Crawler / JSON 402s include a JSON body. `@bsv/402-pay` `send402()` always ends empty — we wrap that response so the BRC-121 headers stay, then attach the body.

Payment rail is BSV only. This repo does not implement or document any other chain or card processor.

## Run

```sh
cp .env.example .env
# set PRIVATE_KEY to 64 hex chars (openssl rand -hex 32)
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Docker

```sh
cp .env.example .env   # PRIVATE_KEY required
docker compose up --build
```

Env used by the server wallet:

| Variable | Required | Default | Role |
| --- | --- | --- | --- |
| `PRIVATE_KEY` | yes | — | Receiver key (32-byte hex) |
| `CHAIN` | no | `main` | `main` or `test` |
| `STORAGE_URL` | no | `https://store-us-1.bsvb.tech` | Wallet storage |
| `HUMAN_SATS` | no | `100` | Browser / BSV Browser price |
| `CRAWLER_SATS` | no | `500` | Bot / JSON-agent price |
| `PORT` | no | `3000` | Listen port |

402 challenges only need `PRIVATE_KEY` (the identity key is derived locally). Accepting a payment needs storage reachable at `STORAGE_URL`.

## Pay as a human

Use a BRC-121 client. There is no site account.

1. **BSV Browser** — native 402. Open an article, approve the payment, the page loads.
2. **402-extension** + **BSV Desktop** — same flow in a regular browser. The extension reads the 402 headers and pays from Desktop.
3. After payment the client retries with `x-bsv-beef`, `x-bsv-sender`, `x-bsv-nonce`, `x-bsv-time`, `x-bsv-vout`.

A browser-like GET without those headers:

```sh
curl -i \
  -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0.0.0' \
  -H 'Accept: text/html' \
  http://localhost:3000/articles/why-402-not-subscriptions
```

Expect `HTTP/1.1 402`, `x-bsv-sats: 100`, `x-bsv-server: <compressed pubkey>`, and an HTML paywall that names BSV Browser / 402-extension / BSV Desktop.

## Pay as a fetch / agent

Crawler challenge (curl’s UA is priced as a crawl):

```sh
curl -i http://localhost:3000/articles/pay-per-crawl-vs-robots-txt
```

Expect `402`, `x-bsv-sats: 500` (not 100), `x-bsv-server`, and a JSON body `{ status, satoshis, server, protocol }`.

JSON Accept is also the crawler price, even with a custom UA:

```sh
curl -i \
  -A 'research-agent/0.1' \
  -H 'Accept: application/json' \
  http://localhost:3000/articles/how-a-human-or-agent-pays
```

Pay and retry with [`create402Fetch`](https://www.npmjs.com/package/@bsv/402-pay):

```ts
import { create402Fetch } from '@bsv/402-pay/client'

const fetch402 = create402Fetch({ wallet })
const res = await fetch402('http://localhost:3000/articles/how-a-human-or-agent-pays', {
  headers: { Accept: 'application/json' }
})
const html = await res.text()
```

Or build headers yourself with `constructPaymentHeaders(wallet, url, sats, serverKey)` and send the five `x-bsv-*` client headers. `wallet` is a `@bsv/sdk` `WalletInterface` (Desktop, a funded agent key, etc.).

## Why not `createPaymentMiddleware` alone?

In `@bsv/402-pay` **0.2.4**, `calculatePrice` is `(path: string) => number | undefined`. Path-only pricing cannot distinguish a browser from `curl`. Article routes therefore call `validatePayment(req, wallet, requiredSats)` and `send402(res, serverIdentityKey, requiredSats)` from `@bsv/402-pay/server`.

## Articles

- [/articles/why-402-not-subscriptions](/articles/why-402-not-subscriptions)
- [/articles/pay-per-crawl-vs-robots-txt](/articles/pay-per-crawl-vs-robots-txt)
- [/articles/how-a-human-or-agent-pays](/articles/how-a-human-or-agent-pays)

Learned from [402-articles](https://github.com/bsv-blockchain-demos/402-articles) (The NOW™ Times). This is a new publisher, not a fork.
