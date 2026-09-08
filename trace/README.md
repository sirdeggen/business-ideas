# Trace receipt (v0)

Pay a little to register a receipt. Look it up.

A provenance receipt answers what / who / rights / paid. Pay a small fee to register it. Overlay holds the searchable row. A stranger looks it up with no wallet. This is **not** a dataset stall (no file dump for sale) and **not** a signed record desk (not a generic signed note).

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The page queries `ls_anytx` via `LookupResolver` (and a raw `/lookup` POST so a stranger never waits on a wallet), then keeps only this app’s PushDrop fields (MAGIC `trace`). Wallet is asked only on **Register**.

Public UI: `https://sirdeggen.github.io/business-ideas/trace/`

Shareable links are query params: `?t=a1b2c3d4e5f67890`. Do not use a path route for the token — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. A stranger opens `/trace/` with no wallet and looks up a token or a what (empty / not found / a receipt).
2. Register: what, who, rights. Pay the small fee with `createAction`. Overlay publishes the receipt.
3. Overlay lookup by `?t=` or by what returns the receipt: what, who, rights, fee paid.
4. Share `?t=`.

## Pricing

A small fixed register fee. Dollars on the face when a live BSV rate is available; sats on `createAction` and under Advanced.

| Thing | Value |
| --- | ---: |
| `FEE_SATS` | 100,000 |

v0 has no protocol treasury — the fee is locked as a payment output on the same `createAction` as the 1-sat receipt token.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction` and `getPublicKey` via the visitor’s Desktop.
- State: wallet basket `trace`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). No custom overlay topic.
- Encoding: PushDrop fields — token, what, who, rights, feePaid, timestamp. MAGIC `trace`.
- Payment: `FEE_SATS` payment output plus a 1-sat receipt token.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Overlay is the public source of truth. Message Box at `https://gmb.bsvblockchain.tech` is an optional nudge only.
- Last-good cache: if `ls_anytx` fails or returns empty, the desk keeps the last receipt it already saw for that token.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Type a token or a what. Click **Look up**. Empty, not found, or a receipt.
3. Fill what, who, rights. Click **Register**. Approve Desktop.
4. Share `?t=`.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd trace/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5180.

### Tests

```bash
cd trace/frontend
npm test
npm run build
```

Encode/parse, MAGIC filter, copy honesty. No live overlay required.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `trace` |
| Protocol ID | `[0, "trace"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `trace`) |
| Protocol string | `trace` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `trace`, optional) |

## Layout

```
trace/
  protocol/          field encode/decode + search
  frontend/          GitHub Pages static app
```
