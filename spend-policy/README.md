# Spend Policy (v0)

A policy. A spend that policy allows.

A treasurer writes a policy (allowed payees, daily cap in sats, expiry). A spender pays a listed payee only if that policy allows. A stranger can read the policy with no wallet. Not a card product. Not a 402 handshake. Not treasury, StreamPay, or invoices.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The page queries `ls_anytx` via `LookupResolver`, then keeps only this app’s PushDrop fields (protocol string `spendpolicy`). Wallet is asked only on **Write policy** and **Spend**.

Public UI: `https://sirdeggen.github.io/business-ideas/spend-policy/`

Deep links are query params: `?p=<policyId>&tx=<txid>`. Do not use a path like `/p/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. Treasurer writes a 14-day policy: one allowed payee, daily cap 100,000 sats.
2. Share `?p=<id>&tx=<txid>`.
3. Stranger reads allowed payees, cap, and expiry with no wallet.
4. Spender Spends within cap to the allowed payee. Both can see a receipt.
5. A spend over cap or to an unknown payee is refused before the wallet opens.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction` and `getPublicKey` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. Identity key alone is not login.
- State: wallet basket `spendpolicy`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered).
- Encoding: PushDrop fields — policy (payees, daily cap, expiry) and spend announcement tagged to that policy so later spends see the remaining cap.
- Payment: BRC-29 P2PKH to the allowed payee plus a 1-sat spend record.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. No hosted API in this repo.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Treasurer: allowed payee name on the face; identity key under Advanced (required to Write). Daily cap `100000`, expiry 14 days. Click **Write policy**. Approve Desktop.
3. Share `?p=<policyId>&tx=<txid>`.
4. Stranger: read allowed payees, daily cap, remaining today, expiry. No wallet.
5. Spender: amount within cap to the listed payee. Click **Spend**. Approve Desktop. Receipt appears on the same link.
6. Try an amount over the remaining cap, or a payee that is not listed. The page shows a sentence and does not open the wallet.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd spend-policy/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5178.

### Tests

```bash
cd spend-policy/frontend
npm test
npm run build
```

Policy allow/deny (cap, payee, expiry), first-paint copy (no Live, no face hex or sats, wallet only on Write/Spend), deep links use `?p=` not `/p/`.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `spendpolicy` |
| Protocol ID | `[0, "spendpolicy"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `spendpolicy`) |
| Protocol string | `spendpolicy` |

## Layout

```
spend-policy/
  protocol/          field encode/decode + allow/deny
  frontend/          GitHub Pages static app
```
