# Name lease (v0)

Lease a name for a while. Look it up. Renew before it ends.

A stranger looks up a human name with no wallet. Register pays sats for a period. Overlay holds the current lease. Renew before it ends. After expiry the name is free again. This is a BSV name lease — not ENS, not a contacts list, and not invoices.

ENS DAO KPK H1 2026 review (14 Aug 2026) booked $3,053,862 protocol revenue from .eth registrations/renewals Jan–Jun 2026. That cited figure is context only. v0 does not use ENS dollar rates as product pricing.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The page queries `ls_anytx` via `LookupResolver` (and a raw `/lookup` POST so a stranger never waits on a wallet), then keeps only this app’s PushDrop fields (MAGIC `namelease`). Wallet is asked only on **Register** and **Renew**.

Public UI: `https://sirdeggen.github.io/business-ideas/names/`

Shareable links are query params: `?name=alice`. Do not use a path route for the name — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. A stranger opens `/names/` with no wallet and looks up a name (empty / not found / leased).
2. Register: pick a name (lowercase letters, digits, hyphen; max 16), pick 30 / 90 / 365 days, pay sats with `createAction`. Overlay publishes the lease.
3. Overlay lookup by name returns the current lease: name, lessee identity, expiry, payment txid.
4. Renew before expiry: pay again, extend expiry. After expiry, another person can register the same name.
5. Share `?name=alice`.

## Pricing

Short names cost more per day. Longer names are cheaper. Dollars on the face when a live BSV rate is available; sats on `createAction`.

| Name length | `satsPerDay` |
| --- | ---: |
| 1–3 | 100 |
| 4–6 | 40 |
| 7–16 | 10 |

`amountSats = satsPerDay(name) × periodDays`

Examples: `alice` for 90 days is 3,600 sats. `ab` for 30 days is 3,000 sats. v0 has no protocol treasury — the fee is locked as a payment output on the same `createAction` as the 1-sat lease token.

## Conflict / expiry

- One active lease per name. Register fails if an unexpired lease exists for another lessee.
- The same lessee can renew while the lease is unexpired. Renew adds the new period onto the current expiry.
- After expiry the name is free again.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction` and `getPublicKey` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey of the lessee (`WalletClient('auto', originator())`, originator = page hostname).
- State: wallet basket `namelease`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). No custom overlay topic.
- Encoding: PushDrop fields — name, lessee, registeredAt, expiresAt, periodDays, amountSats, kind `register` \| `renew`, optional previousExpiry on renew.
- Payment: `amountSats` payment output plus a 1-sat lease token.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Overlay is the public source of truth. Message Box at `https://gmb.bsvblockchain.tech` is an optional nudge only.
- Last-good cache: if `ls_anytx` fails or returns empty, the desk keeps the last lease it already saw for that name.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Type a name. Click **Look up**. Empty, not found, or leased.
3. Free name: pick 30 / 90 / 365 days. Click **Register**. Approve Desktop.
4. Share `?name=alice`.
5. Before expiry, the lessee clicks **Renew**. After expiry, anyone can register it again.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd names/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5178.

### Tests

```bash
cd names/frontend
npm test
npm run build
```

Normalize, expiry, renew extends, register blocked while leased, client MAGIC filter. No live overlay required.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `namelease` |
| Protocol ID | `[0, "namelease"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `namelease`) |
| Protocol string | `namelease` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `namelease`, optional) |

## Layout

```
names/
  protocol/          field encode/decode + expiry / conflict
  frontend/          GitHub Pages static app
```
