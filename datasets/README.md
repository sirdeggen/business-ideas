# Dataset stall (v0)

Post a listing. Pay a little to take the file.

A seller posts a catalog row. A lab pays that sats price, gets the small text/jsonl dump, and a receipt is written to overlay. This is **not** a radio network, **not** a crawler paywall (402 Press), and **not** one field-reading export (signed record desk).

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The stall queries `ls_anytx` via `LookupResolver`, then keeps only this app’s dataset PushDrop fields (MAGIC). A stranger can read the catalog without a wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/datasets/`

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Post a listing** or **Get the file.**

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey of the seller (`WalletClient('auto', originator())`, originator = page hostname). The stall list does not show it.
- State: wallet basket `datasets`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). No custom overlay topic.
- Encoding: PushDrop fields — listing (title, license, sample hash of the dump, price in sats, dump, seller) and receipt (listing id, buyer, paid sats, sample hash).
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. The dump stays in the paid reveal (v0 snippet, not a warehouse, not a fake CDN).

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. The stall list loads from overlay. No wallet prompt on first paint.
2. Seller: title, license, the file, and a price. Click **Post a listing**. Approve Desktop.
3. Lab: read title and license with no wallet. Click **Get the file.**
4. After pay, the dump is revealed and a receipt is submitted to overlay.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend only (wallet against the public overlay)

```bash
cd datasets/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5178.

### Tests

```bash
cd datasets/frontend
npm test
npm run typecheck
```

Protocol validate/parse, overlay topic is `tm_anytx` even on localhost, wallet-missing is not overlay/network/decline, first-paint copy.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `datasets` |
| Protocol ID | `[0, "datasets"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to dataset MAGIC) |

## Layout

```
datasets/
  protocol/          shared field encode/decode + admission rules
  frontend/          GitHub Pages static app
```
