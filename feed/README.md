# Feed Desk (v0)

Sell a feed. Buy a fresh signed reading.

A publisher posts a feed (label, metric type, price per query, optional short subscription). The current reading is not on that row. A guest reads the feed list with no wallet. A buyer pays per query or opens a subscription, then receives a signed reading and a receipt. The merchant is paid in satoshis on that action.

This is **not** Trace Receipt (register a provenance receipt) and **not** the signed record desk (pay to export a dump).

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx` via a raw `/lookup` POST (then `LookupResolver` if that fails), and keeps only this app’s PushDrop fields (MAGIC `feed`). No custom topic.

Public UI: `https://sirdeggen.github.io/business-ideas/feed/`

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Publish**, **Post reading**, **Query**, or **Subscribe**.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, and `signAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey (`WalletClient('auto', originator())`, originator = page hostname). Hex stays under Advanced.
- State: wallet basket `feed`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). No custom overlay topic.
- Encoding: PushDrop fields — feed (label, metric type, prices, reading hash), pulse (fresh hash), subscription, query meter, signed reading (metric, value, what was paid). The catalog row does not carry the plaintext reading.
- Delivery: same-wallet basket, or Message Box at `https://gmb.bsvblockchain.tech` (box `feed`) when the publisher is a different wallet.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. The feed list loads from overlay. No wallet prompt on first paint.
2. Publisher: label, type, the current reading, and a price. Optional subscription. Click **Publish**. Approve Desktop.
3. Guest: read the label, type, and price with no wallet.
4. Buyer: **Query** (pay per reading) or **Subscribe** (short window). The receipt names the metric, the value, and that it was paid.
5. Publisher: **Post reading** to replace the current value. The next query settles against that fresh reading.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend only (wallet against the public overlay)

```bash
cd feed/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5184.

### Tests

```bash
cd feed/frontend
npm test
npm run typecheck
```

Protocol validate/parse, overlay topic is `tm_anytx` even on localhost, wallet-missing is not overlay/network/decline, first-paint copy.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `feed` |
| Protocol ID | `[0, "feed"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to feed MAGIC) |
| Message Box | `https://gmb.bsvblockchain.tech` (box `feed`) |
| Metric types | `price`, `index`, `metric` |

## Layout

```
feed/
  protocol/          shared field encode/decode + admission rules
  frontend/          GitHub Pages static app
```
