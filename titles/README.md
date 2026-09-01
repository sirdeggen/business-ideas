# Title desk (v0)

Issue a titled document. Transfer the title. Export if you hold it.

Electronic bills of lading and other titled trade docs. The overlay row is who holds the titled document right now (label, document hash, holder). This is **not** a bank, **not** a paid dump of a field reading (signed record desk), and **not** a dataset stall.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx` via `LookupResolver`, then keeps only this app’s title PushDrop fields (MAGIC). A stranger can read the title list without a wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/titles/`

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Issue a title**, **Transfer title**, or **Export**.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, `signAction`, and `internalizeAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey of the holder (`WalletClient('auto', originator())`, originator = page hostname). The title list shows a resolved name when it can — never the hex on the face.
- State: wallet basket `titles`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). No custom overlay topic.
- Encoding: PushDrop fields — title (label, document hash, holder, issuer, price, timestamp). Transfer spends the old title token and posts the new holder. Export is a custody reading, not a paid dump.
- File: document bytes stay in the holder’s basket (and Message Box on transfer). Overlay only gets the hash.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `titles`) for transfer handoff.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. The title list loads from overlay. No wallet prompt on first paint.
2. Issuer: title, the document (or its hash), and a price. Click **Issue a title**. Approve Desktop.
3. Holder: **Transfer title** to a name or account. Overlay spends the old token and posts the new holder.
4. Holder: **Export** a custody reading. Non-holders cannot export as if they hold it.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend only (wallet against the public overlay)

```bash
cd titles/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5179.

### Tests

```bash
cd titles/frontend
npm test
npm run typecheck
```

Protocol validate/parse, overlay topic is `tm_anytx` even on localhost, wallet-missing is not overlay/network/decline, first-paint copy.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `titles` |
| Protocol ID | `[0, "titles"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to title MAGIC) |
| Message Box | `https://gmb.bsvblockchain.tech` (box `titles`) |

## Layout

```
titles/
  protocol/          shared field encode/decode + admission rules
  frontend/          GitHub Pages static app
```
