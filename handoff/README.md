# Handoff Desk (v0)

List a digital asset. Fund escrow. Confirm the handoff. Release.

A seller lists a digital asset — repo access intent, app ownership, or a domain pointer. A buyer funds the listing price into escrow. Both confirm the transfer conditions (handoff complete / received). Release pays the seller minus a small ~1% protocol fee and posts a handoff receipt. This is a L.A.U.R.A. Ownership Market / Escrow.com digital APA analog. Digital ownership transfer only.

Not Vault Claim (those burn a claim to redeem a vaulted physical). Not Job Escrow (those lock until a deliverable hash lands).

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts Atomic BEEF to `tm_anytx`. The page queries `ls_anytx`, then keeps only this app’s PushDrop fields (protocol string `handoff`). Wallet is asked only on **List an asset**, **Fund escrow**, **Confirm**, and **Release**. A stranger can read the listings with no wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/handoff/`

Deep links are query params: `?h=<listingId>&tx=<txid>`. Do not use a path like `/h/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. Seller: title `Repo access`, type `Repo`, price `100000`. Description stays the intent note. Click **List an asset**. Approve Desktop.
2. Share `?h=<listingId>&tx=<txid>`.
3. Buyer: **Fund escrow**. Approve Desktop. The listing shows funded, pending confirmation.
4. Seller: **Confirm** the handoff is complete. Buyer: **Confirm** it was received.
5. Buyer: **Release**. Seller is paid the listing price minus about 1%. A handoff receipt lands on overlay.
6. A stranger can read the title, type, status, and price with no wallet.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, and `signAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. Identity key alone is not login. Seller and buyer names sit on the face when they resolve; keys stay under Advanced.
- State: wallet basket `handoff`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `handoff`).
- Encoding: PushDrop fields — list (title, type, description, price, seller), fund (buyer, amount), confirm (party), release (payout + fee + receipt).
- Payment: the fund output locks the listing price. Release spends that lock, pays the seller minus about 1%, and emits the receipt. The ~1% fee is the product story and is deducted on release.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `handoff`) is an optional nudge. Overlay is the public book.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. Public listings load from overlay. No wallet prompt on first paint.
2. Seller: title, type, price. Click **List an asset**. Approve Desktop.
3. Share `?h=<listingId>&tx=<txid>`.
4. Stranger: read the listing. No wallet.
5. Buyer: **Fund escrow**. Approve Desktop.
6. Seller and buyer each **Confirm**. Buyer **Release**.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd handoff/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5183.

### Tests

```bash
cd handoff/frontend
npm test
npm run build
```

State machine, encode/decode, first-paint copy (no Live, no Connect on load, wallet only on List/Fund/Confirm/Release), deep links use `?h=` not `/h/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `handoff` |
| Protocol ID | `[0, "handoff"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `handoff`) |
| Protocol string | `handoff` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `handoff`) |
| Story fee | ~1% (deducted on release) |
| Default | Repo access, repo, 100,000 |

## Layout

```
handoff/
  protocol/          field encode/decode + listing state
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
