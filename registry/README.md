# Registry Desk (v0)

Issue units on a register. Transfer with a receipt. Export the reading.

A share register for co-ops, HOAs, clubs, and small funds. The admin names the book, issues units to a holder, and a transfer pays a small protocol fee with an attestation on overlay. Anyone with the register link can export the current holdings. No wallet to look.

This is a transfer-agent book. It is not Titles (a titled document) and not Handoff (a secondary ownership market).

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx`, then keeps only this app’s PushDrop fields (MAGIC `registry`). Wallet is asked only on **Create register**, **Issue units**, and **Transfer**.

Public UI: `https://sirdeggen.github.io/business-ideas/registry/`

Deep links are query params: `?r=<registerId>&tx=<txid>`. Do not use a path like `/r/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. Admin: register `HOA unit ledger`, unit label `units`, optional total and AUM note. Click **Create register**. Approve Desktop.
2. Share `?r=<registerId>&tx=<txid>`.
3. Admin: **Issue units** to an identity key or a share link. Approve Desktop.
4. Holder or admin: **Transfer**. Approve Desktop. The protocol fee is a separately labeled output. The admin / AUM subscription is marked and not collected in v0.
5. A stranger opens the link and clicks **Export reading**. No wallet.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop (`WalletClient('auto', originator)`).
- Identity: 66-hex compressed pubkey of the admin or holder. A share link may carry `k=<identity key>`.
- State: wallet basket `registry`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `registry`).
- Encoding: PushDrop fields — register (name, unit label, optional total, AUM note, admin), issue (holder, units), transfer (from, to, units, protocol fee, actor).
- Payment: every transfer posts an attestation and pays 100 sats as a labeled protocol-fee output to the register admin. BSV only.
- Subscription: admin / AUM subscription is copy on the register (10,000 sats / month). v0 does not collect it.
- Reading: current holdings are the fold of issues and accepted transfers. Export is a JSON download. No wallet.
- Frontend: Vite + React. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `registry`) is an optional nudge on issue and transfer. Overlay is the public book.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

```bash
cd registry/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5184.

### Tests

```bash
cd registry/frontend
npm test
npm run typecheck
```

Protocol encode/parse and the holdings fold, overlay topic `tm_anytx` even on localhost, wallet-missing is not overlay/network/decline, first-paint copy, stranger export.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `registry` |
| Protocol ID | `[0, "registry"]` |
| MAGIC | `registry` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to registry MAGIC) |
| Transfer protocol fee | 100 sats, labeled output |
| AUM subscription mark | 10,000 sats / month, not collected in v0 |
| Message Box | `https://gmb.bsvblockchain.tech` (box `registry`) |

## Layout

```
registry/
  protocol/          field encode/decode, holdings fold, reading
  frontend/          GitHub Pages static app
```
