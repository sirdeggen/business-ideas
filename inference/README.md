# Inference Desk (v0)

Pay per call. Get a hash-attested usage receipt.

A provider lists a model (label, price per call, optional credit pack). A guest reads the list and can verify a receipt with no wallet. A buyer pays per call or buys a pack. The desk serves an inference, attests the response hash, and publishes a usage receipt. The meter is the pack total minus the sum of those receipts.

This is **not** Feed Desk (a signed reading) and **not** the dataset stall (a file listing).

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx` via a raw `/lookup` POST (then `LookupResolver` if that fails), and keeps only this app’s PushDrop fields (MAGIC `inference`). No custom topic.

Public UI: `https://sirdeggen.github.io/business-ideas/inference/`

Deep links are query params: `?o=<offerId>&tx=<txid>`. Do not use a path like `/o/:id` — GitHub Pages 404s those.

The v0 provider is an in-browser mock (`mockInference`). It returns a deterministic reply so a stranger can run a call, recompute the response hash, and watch the preview meter decrement without Docker and without a wallet. Listing a model, paying per call, and buying a pack ask for the wallet. Message Box at `https://gmb.bsvblockchain.tech` (box `inference`) carries the plaintext response only when delivery is needed. The overlay row stores hashes, sats spent, and the remaining balance — not the response text.

Settlement is BSV satoshis from the visitor’s BRC-100 wallet (`createAction`, a BRC-29 output). Prices are whole sats, the same unit BRC-121 uses. This static demo does not run an HTTP 402 listener. No x402, USDC, Solana, Ethereum, Stripe, or Virtuals.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **List model**, **Pay per call**, **Buy pack**, or **Use pack**.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey (`WalletClient('auto', originator())`, originator = page hostname). Hex stays under Advanced.
- State: wallet basket `inference`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). No custom overlay topic.
- Encoding: PushDrop fields — offer (label, model, prices), pack purchase (paid sats, pack total), usage (request hash, response hash, sats, remaining, attestation, previous receipt). MAGIC `inference`.
- Meter: pack total minus the sum of usage receipts on that pack.
- Verify: recompute sha256 of the response, check the attestation, and walk the receipt chain.
- Delivery: Message Box at `https://gmb.bsvblockchain.tech` (box `inference`) when the plaintext has to reach another wallet. The mock path keeps the reply in the session.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) to pay
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. The model list loads from overlay. The business case and the preview meter paint with no wallet.
2. Write a prompt. Click **Run**. The mock provider answers. The meter decrements. Click **Verify**.
3. Provider: label, model, and a price. Optional pack. Click **List model**. Approve Desktop.
4. Buyer: **Pay per call** or **Buy pack**, then **Use pack**. The receipt names the response hash. The pack meter decrements.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend only (wallet against the public overlay)

```bash
cd inference/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5185.

### Tests

```bash
cd inference/frontend
npm test
npm run typecheck
```

Protocol hashing, receipt verify, meter math, MAGIC `inference`, overlay topic `tm_anytx` even on localhost, wallet-missing is not overlay/network/decline, first-paint copy.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `inference` |
| Protocol ID | `[0, "inference"]` |
| MAGIC | `inference` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to inference MAGIC) |
| Message Box | `https://gmb.bsvblockchain.tech` (box `inference`) |
| Meter | pack total − sum(usage receipts) |

## Layout

```
inference/
  protocol/          field encode/decode, receipt verify, meter
  frontend/          GitHub Pages static app
```
