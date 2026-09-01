# Timed Memberships (v0)

A timed key. Renew when it expires.

Clubs and local orgs pay for a timed membership key, not a one-night ticket. The org writes a membership (name, duration, price). A member pays and holds a timed key. The door Shows the live key. After expiry, Show fails until they Renew.

This is an Unlock Protocol analog on BSV. Unlock Protocol on DefiLlama (1 Sep 2026): about $86k annualized fees, $11.5k last 30d, $918k cumulative; 1% protocol fee on key buy/renew. This product does not invent GMV or other chain numbers.

Not event tickets (those spend-to-redeem once). Not StreamPay, treasury, invoices, spend-policy, grant-receipt, raffle, datasets, session-ap, 402-mcp, or 402 Press.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts Atomic BEEF to `tm_anytx`. The page queries `ls_anytx`, then keeps only this app’s PushDrop fields (protocol string `membership`). Wallet is asked only on **Create**, **Join**, and **Renew**. Show is lookup only.

Public UI: `https://sirdeggen.github.io/business-ideas/memberships/`

Deep links are query params: `?m=<membershipId>&tx=<txid>`. Do not use a path like `/m/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. Org creates “Gym month”, 30 days, price 50,000 sats. Approve Desktop.
2. Share `?m=<membershipId>&tx=<txid>`.
3. Member Joins, pays, gets a timed key. Show is valid.
4. After expiry (or a QA short duration under Advanced), Show fails until they Renew.
5. A stranger can read the membership name, price, and duration with no wallet.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction` and `getPublicKey` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. Identity key alone is not login.
- State: wallet basket `membership`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `membership`).
- Encoding: PushDrop fields — membership definition (name, duration, price) and a timed key announcement (`issuedAt` + `duration` / `expiresAt`).
- Payment: BRC-29 P2PKH of the price to the org plus a 1-sat key record. Renew pays again and extends expiry from the later of now and the previous expiry. Show does not spend the key.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Optional notify host `https://gmb.bsvblockchain.tech` is unused in v0. No hosted API in this repo.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Org: name `Gym month`, duration `30`, price `50000`. Click **Create**. Approve Desktop.
3. Share `?m=<membershipId>&tx=<txid>`.
4. Stranger: read name, price, and duration. No wallet.
5. Member: **Join**. Approve Desktop. Show is green until expiry.
6. For a short QA key, open Advanced and set duration seconds before Create. After that clock, Show fails. **Renew** pays again and extends.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd memberships/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5181.

### Tests

```bash
cd memberships/frontend
npm test
npm run build
```

Expiry fail/pass, renew extends, first-paint copy (no Live, no Connect on load, wallet only on Create/Join/Renew), deep links use `?m=` not `/m/`.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `membership` |
| Protocol ID | `[0, "membership"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `membership`) |
| Protocol string | `membership` |
| Default | Gym month, 30 days, 50,000 sats |

## Layout

```
memberships/
  protocol/          field encode/decode + expiry / renew
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
