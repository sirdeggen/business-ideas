# Credit Desk (v0)

Open a facility against an invoice or receivable. Draw. Repay. Flag default.

A private credit facility on BSV, secured by artifacts that already exist on the Invoice desk (`bsvinvoice`) and the Receivable desk (`receivable`). This desk does not issue invoices or receivables. Collateral is a reference: an invoice id, a receivable id, a receipt (`txid.vout`), or an overlay id. Term records the limit, maturity, collateral, and fee schedule. Draw records principal and pays the desk fee in basis points. Repay pays outstanding down. Default flags a breached term that is still unpaid. An optional underwriting write fee is paid when the facility is recorded.

Not a bank. Not a lending market. Not a yield product. Not Invoices and not Receivables — those desks stay the books this one reads.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts Atomic BEEF to `tm_anytx`. The page queries `ls_anytx`, then keeps only this app’s PushDrop fields (protocol string `credit`). Wallet is asked only on **Term**, **Draw**, **Repay**, and **Default**. A stranger can read the facility feed with no wallet. Collateral lookup by overlay id or receipt does not ask for a wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/credit/`

Deep links are query params: `?c=<facilityId>&tx=<txid>`. Do not use a path like `/c/:id` — GitHub Pages 404s those.

Catalog: **Server** + **View**. Not Live. Live remains StreamPay and Grant receipt.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. A stranger opens `/credit/` with no wallet and reads the facility feed (empty, or a list).
2. Term: borrower, limit, maturity, collateral ref. Optional underwriting note and write fee. Click **Term**. Approve Desktop.
3. Share `?c=<facilityId>&tx=<txid>`.
4. Draw an amount inside the limit. The desk fee (default 50 bps) is paid to the facility on that draw.
5. Repay outstanding.
6. After maturity, if anything is still unpaid, the facility opener can **Default**.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. The borrower name sits on the face; keys stay under Advanced.
- State: wallet basket `credit`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `credit`).
- Encoding: PushDrop fields — term, draw, repay, default. MAGIC `credit`.
- Collateral: references only. Lookup reads `bsvinvoice`, `bsvinvoice-paid`, or `receivable` when the ref is an overlay id or a receipt. This desk does not encode those protocols.
- Payment: optional underwriting write fee on term, desk fee in bps on each draw, repayment amount on repay. Satoshis via `createAction`. No other chain.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and a raw `/lookup` POST.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `credit`) is an optional nudge. Overlay is the public book.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. The facility feed loads from overlay. No wallet prompt on first paint.
2. Paste an invoice id, a receivable id, or a receipt. **Check collateral** looks it up when the ref has an overlay id or receipt.
3. Click **Term**. Approve Desktop.
4. Share `?c=<facilityId>&tx=<txid>`.
5. **Draw**, then **Repay**. After maturity, the opener can **Default** if anything is unpaid.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd credit/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5184.

### Tests

```bash
cd credit/frontend
npm test
npm run build
```

State machine, encode/decode, collateral refs, first-paint copy (no Live, no Connect on load, wallet only on Term/Draw/Repay/Default), deep links use `?c=` not `/c/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `credit` |
| Protocol ID | `[0, "credit"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `credit`) |
| Protocol string | `credit` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `credit`) |
| Desk fee | 50 bps default, stored on the term |
| Underwriting write fee | optional, default 100,000 sats, may be 0 |

## Layout

```
credit/
  protocol/          field encode/decode + facility state
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
