# Vault claim (v0)

Claim a vaulted item. Transfer the claim. Burn it to redeem.

Courtyard-style custody of a claim on one vaulted physical collectible. The overlay row is who holds that specific item right now (label, item id, holder). Deterministic: one claim token = one specific vaulted item. This is **not** a titled e-doc (Title desk), **not** an event pass (Tickets), and **not** a random pack.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx` via `LookupResolver`, then keeps only this app’s vault-claim PushDrop fields (MAGIC). A stranger can read the claim list without a wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/vault-claim/`

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Issue a claim**, **Transfer claim**, or **Redeem (burn)**.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, `signAction`, and `internalizeAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey of the holder (`WalletClient('auto', originator())`, originator = page hostname). The claim list shows a resolved name when it can — never the hex on the face.
- State: wallet basket `vault-claim`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). No custom overlay topic.
- Encoding: PushDrop fields — claim (label, item id, optional sample hash, holder, issuer, price, timestamp). Transfer spends the old claim token and posts the new holder. Burn spends the claim and posts a redeem/ship receipt.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `vault-claim`) for transfer handoff.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to run

1. Open the UI. The claim list loads from overlay. No wallet prompt on first paint.
2. Vault operator: label, item id or serial, optional sample, and a price if it’s a sale. Click **Issue a claim**. Approve Desktop.
3. Holder: **Transfer claim** to a name. Overlay spends the old token and posts the new holder.
4. Holder: **Redeem (burn)** and write where to ship. Non-holders cannot redeem. After burn, the claim is spent and a receipt shows the request.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend only (wallet against the public overlay)

```bash
cd vault-claim/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5180.

### Tests

```bash
cd vault-claim/frontend
npm test
npm run typecheck
```

Protocol validate/parse, overlay topic is `tm_anytx` even on localhost, wallet-missing is not overlay/network/decline, first-paint copy.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `vault-claim` |
| Protocol ID | `[0, "vault-claim"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to vaultclaim MAGIC) |
| Message Box | `https://gmb.bsvblockchain.tech` (box `vault-claim`) |

## Layout

```
vault-claim/
  protocol/          shared field encode/decode + admission rules
  frontend/          GitHub Pages static app
```
