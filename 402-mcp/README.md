# 402-mcp

Extract the main article text from a public URL. Each paid call is **10 sats**. No API key.

Payment is the credential. This is not Coinbase x402.

`extract_article` GETs a public URL and returns the **main article text** (Mozilla Readability). Not raw HTML. Local/private hosts are rejected. Discovery (`initialize`, `tools/list`) and `GET /health` are free. Local `GET /` is a few lines of text that name the job and `POST /mcp`. There is no public app.

## How to run

Node.js 22+.

```sh
cd 402-mcp
npm i
cp .env.example .env
# set SERVER_PRIVATE_KEY to a 64-char hex key (openssl rand -hex 32)
npm run dev
```

POST to `http://127.0.0.1:3000/mcp`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERVER_PRIVATE_KEY` | yes | — | Hex private key for the receiving wallet |
| `CHAIN` | no | `main` | `main` or `test` (same as 402-articles) |
| `STORAGE_URL` | no | `https://store-us-1.bsvb.tech` | Wallet storage |
| `PRICE_SATS` | no | `10` | Sats charged per `tools/call` |
| `PORT` | no | `3000` | Listen port |
| `HOST` | no | `0.0.0.0` | Bind address |

## Probe without paying

```sh
npm run pay -- --probe
```

Expect HTTP 402 and `x-bsv-sats`. No wallet. Optional `--url` (default: `https://en.wikipedia.org/wiki/HTTP_402`).

Free discovery:

```sh
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## How an agent pays

Settlement is [BRC-121](https://brc.dev/121) Simple 402 Payments: BRC-29 BEEF in `x-bsv-*` headers, internalized by a BRC-100 server wallet. BSV is the rail.

| Call | Price |
|---|---|
| MCP `initialize`, `tools/list`, `GET /health` | free |
| MCP `tools/call` (`extract_article`) | **10 sats** (`PRICE_SATS`, default 10) |

1. Point a BRC-100 wallet at the HTTP MCP URL. BSV Desktop on `localhost:3321` or a Gebunden-style headless wallet both work. The human can gate spend.
2. Use `WalletClient('auto')` from `@bsv/sdk` (or `createWallet()` from `@bsv/simple/browser` in a page).
3. Wrap HTTP with `create402Fetch` from `@bsv/402-pay/client`.
4. `tools/list` is free. On `tools/call` the server returns HTTP 402 with `x-bsv-sats` and `x-bsv-server`. The wrapper builds a BRC-29 payment and retries with BEEF headers.
5. The server `internalizeAction`s the payment. Replay (`isMerge`) and stale `x-bsv-time` (>30s) are rejected with a fresh 402.

The server wallet is `@bsv/simple/server` `ServerWallet.create({ privateKey, network, storageUrl })`. `getClient()` is the `WalletInterface` passed to `@bsv/402-pay`.

Paid extract (needs a live wallet on `:3321`):

```sh
MCP_URL=http://127.0.0.1:3000/mcp npm run pay -- --url https://en.wikipedia.org/wiki/HTTP_402
```

Unpaid probe as raw HTTP (same as `npm run pay -- --probe`):

```sh
curl -sD - -o /dev/null -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Method: tools/call' \
  -H 'Mcp-Name: extract_article' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"extract_article","arguments":{"url":"https://en.wikipedia.org/wiki/HTTP_402"}}}'
```

Expect `402` plus `x-bsv-sats: 10` and `x-bsv-server: <identity key>`.

```sh
npm run pay -- --help
```

## Docker

```sh
docker build -t 402-mcp .
docker run --rm -p 3000:3000 \
  -e SERVER_PRIVATE_KEY=your_64_character_hex_private_key_here \
  -e CHAIN=main \
  -e PRICE_SATS=10 \
  402-mcp
```

Do not bake a real private key into the image.

## Layout

- `src/server.ts` — Express + Streamable HTTP MCP (`@modelcontextprotocol/server` v2); local `GET /` is the tiny text surface
- `src/payment.ts` — `validatePayment` / `send402` on `tools/call` only
- `src/wallet.ts` — `ServerWallet.create`
- `src/extract-article.ts` — paid tool (Readability)
- `src/pay-client.ts` — `create402Fetch` + `WalletClient('auto')`
