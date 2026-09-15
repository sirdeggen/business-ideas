# KYA desk (v0)

Know Your Agent.

An org or app pays a small fee to verify which human or org stands behind an AI agent identity before letting it spend, book, or act. Visa / Mastercard / Ant-style agent verification. Apps pay for proofs.

Not Session AP. Not Spend Policy. Not Trace. Not Job escrow. Not Vault Claim. Not StreamPay.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts Atomic BEEF to `tm_anytx`. The page queries `ls_anytx`, then keeps only this app’s PushDrop fields (protocol string `kya`). Wallet is asked only on **Register**, **Issue**, and **Verify**. A stranger can read the credential with no wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/kya/`

Deep links are query params: `?a=<agentId>&tx=<txid>`. Do not use a path like `/a/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. Owner: agent `Travel clerk`, owner `Northwind`. Click **Register**. Approve Desktop.
2. Share `?a=<agentId>&tx=<txid>`.
3. Owner: **Issue**. Approve Desktop.
4. Third party: **Verify**. Approve Desktop. A tiny protocol fee is labeled separately from the verify fee.
5. A stranger can read the agent, owner, and receipt with no wallet.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. Identity key alone is not login. Owner name sits on the face; keys stay under Advanced.
- State: wallet basket `kya-desk`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `kya`).
- Encoding: PushDrop fields — bind (agent, owner), credential (signed id), receipt (paid verify + labeled protocol fee).
- Payment: verify posts a receipt and pays a small fee. Protocol fee is a separately labeled output. v0 amounts stay in sats under Advanced.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `kya-desk`) is an optional nudge. Overlay is the public book.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Owner: agent name, owner name. Click **Register**. Approve Desktop.
3. Share `?a=<agentId>&tx=<txid>`.
4. Stranger: read the binding. No wallet.
5. Owner: **Issue**. Approve Desktop.
6. Third party: **Verify**. Approve Desktop. The overlay receipt is public.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd kya/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5183.

### Tests

```bash
cd kya/frontend
npm test
npm run build
```

State machine, encode/decode, first-paint copy (no Live, no Connect on load, wallet only on Register/Issue/Verify), deep links use `?a=` not `/a/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `kya-desk` |
| Protocol ID | `[0, "kya-desk"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `kya`) |
| Protocol string | `kya` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `kya-desk`) |
| Verify fee | 500 sats (under Advanced) |
| Protocol fee | 2% of verify fee, labeled separately |
| Default | Travel clerk, Northwind |

## Layout

```
kya/
  protocol/          field encode/decode + agent state
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
