# 402-mcp

Paid MCP tools in BSV sats. Payment is the credential. No signup, no API key.

An agent discovers tools for free, then pays **10 sats** (configurable via `PRICE_SATS`) on each `tools/call`. Settlement is [BRC-121](https://brc.dev/121) Simple 402 Payments: BRC-29 BEEF in `x-bsv-*` headers, internalized by a BRC-100 server wallet.

Pitch: **the wallet is the account.**

This is not Coinbase x402.

## Price

| Call | Price |
|---|---|
| MCP `initialize`, `tools/list`, `GET /health` | free |
| MCP `tools/call` (`fetch_hash`) | **10 sats** (`PRICE_SATS`, default 10) |

## Paid tool

`fetch_hash` — GET a public URL and return SHA-256 of the body, plus HTTP status and content-type. Local/private hosts are rejected.

## Run the server

Node.js 22+.

```sh
cd 402-mcp
npm i
cp .env.example .env
# set SERVER_PRIVATE_KEY to a 64-char hex key (openssl rand -hex 32)
npm run dev
```

The MCP endpoint is `http://127.0.0.1:3000/mcp`.

| Variable | Required | Default | Description |
|---|---|---|---|
| `SERVER_PRIVATE_KEY` | yes | — | Hex private key for the receiving wallet |
| `CHAIN` | no | `main` | `main` or `test` (same as 402-articles) |
| `STORAGE_URL` | no | `https://store-us-1.bsvb.tech` | Wallet storage |
| `PRICE_SATS` | no | `10` | Sats charged per `tools/call` |
| `PORT` | no | `3000` | Listen port |
| `HOST` | no | `0.0.0.0` | Bind address |

The server wallet is `@bsv/simple/server` `ServerWallet.create({ privateKey, network, storageUrl })`. `getClient()` is the `WalletInterface` passed to `@bsv/402-pay`.

## How an agent pays

1. Point a BRC-100 wallet at the HTTP MCP URL. BSV Desktop on `localhost:3321` or a Gebunden-style headless wallet both work. The human can gate spend.
2. Use `WalletClient('auto')` from `@bsv/sdk` (or `createWallet()` from `@bsv/simple/browser` in a page).
3. Wrap HTTP with `create402Fetch` from `@bsv/402-pay/client`.
4. `tools/list` is free. On `tools/call` the server returns HTTP 402 with `x-bsv-sats` and `x-bsv-server`. The wrapper builds a BRC-29 payment and retries with BEEF headers.
5. The server `internalizeAction`s the payment. Replay (`isMerge`) and stale `x-bsv-time` (>30s) are rejected with a fresh 402.

Example pay-client (needs a live wallet on `:3321`):

```sh
# show the 402 challenge without paying
npm run pay -- --probe --url https://example.com

# pay and call fetch_hash
MCP_URL=http://127.0.0.1:3000/mcp npm run pay -- --url https://example.com
```

Unpaid probe (no wallet):

```sh
curl -sD - -o /dev/null -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Method: tools/call' \
  -H 'Mcp-Name: fetch_hash' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fetch_hash","arguments":{"url":"https://example.com"}}}'
```

Expect `402` plus `x-bsv-sats: 10` and `x-bsv-server: <identity key>`.

Free discovery:

```sh
curl -s -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
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

- `src/server.ts` — Express + Streamable HTTP MCP (`@modelcontextprotocol/server` v2)
- `src/payment.ts` — `validatePayment` / `send402` on `tools/call` only
- `src/wallet.ts` — `ServerWallet.create`
- `src/fetch-hash.ts` — paid tool
- `src/pay-client.ts` — `create402Fetch` + `WalletClient('auto')`
