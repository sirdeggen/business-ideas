# Signed record desk (v0)

Post a signed reading. Pay a little to export the dump.

A small org collects signed field readings (hours, inspections, GPS-ish notes). Contributors post a signed record. Buyers pay sats and export the dump. The hash is listable.

This is **not** AR / receivable desk, **not** event tickets, **not** a stamp card.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The list queries `ls_anytx` via `LookupResolver`, then keeps only this desk’s record PushDrop fields (name, kind, time, hash). A stranger can post without docker compose.

Local Docker `tm_records` / `ls_records` is an optional override:

```bash
cd record-desk
docker compose up --build
```

Overlay **:8083**, UI **:5176**. Set **Overlay URL** to `http://localhost:8083`.

Public UI: `https://sirdeggen.github.io/business-ideas/records/`

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Wallet is only asked when you Post or Pay — not to read the hash list.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, and `signAction` via the viewer’s Desktop.
- Identity: display name on the form (1–80 characters). A 66-hex account id is Advanced and only needed if a buyer should pay the contributor on-chain.
- State: wallet basket `records`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). Local Docker still hosts custom `tm_records` / `ls_records`.
- Encoding: PushDrop fields — magic, schema version, record hash (sha256 of the canonical payload), contributor name, kind (`hours` / `inspection` / `note`), note, timestamp, optional lat/lon as text.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk` (page hostname, not `@bsv/simple` `"simple"`). Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay (public): `https://overlay-us-1.bsvb.tech`. Overlay (local optional): `@bsv/overlay-express` + MongoDB + MySQL.
- Message Box is not used. Pay-to-export is an on-chain `createAction`, then the dump downloads as JSON.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) or [BSV Browser](https://github.com/bsv-blockchain/bsv-browser) for Post / Pay
- Node 22+ for local frontend and tests
- Docker + Docker Compose for the optional local overlay

## Post a record

1. Open the UI. No wallet connect in the masthead.
2. Enter a name, kind, and reading. Optional lat/lon.
3. Click **Post**. Approve the wallet prompt.

## Buy a dump

Hashes are listed for free (name, kind, time, hash). The full note is not shown until you pay.

1. Click **Refresh list** if you just posted.
2. Click **Pay + Export** on a row.
3. After `createAction` succeeds, the dump downloads as JSON (`hash`, `name`, `kind`, `note`, `time`, `txid`).

Copy is honest: **Pay to download the dump.** The overlay already has the fields; payment is the gate in the UI. There is no encryption or UHRP in v0.

If the contributor posted an account id, export pays a small sat amount to them (BRC-29). If they posted a name only, export spends a 1-sat labelled receipt (`exported`) plus change so the spend is real.

## Public overlay vs local Docker

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |
| Local Docker override | `http://localhost:8083` | `tm_records` | `ls_records` |

## Run the overlay locally (optional)

```bash
cd record-desk
cp .env.example .env   # optional; compose already loads .env.example
docker compose up --build
```

- Overlay HTTP: http://localhost:8083 (`POST /submit`, `POST /lookup`, `GET /health/live`, `GET /health`, `GET /version`)
- Frontend container: http://localhost:5176
- MySQL: 3309 / MongoDB: 27020 (offset from tickets 8080, invoices 8081, receivables 8082)

Point the UI at a local overlay-express node by setting **Overlay URL** to `http://localhost:8083` (stored in localStorage). Pages default is `https://overlay-us-1.bsvb.tech`.

### Frontend only (wallet against a running overlay)

```bash
cd record-desk/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5176.

### Tests

```bash
cd record-desk/overlay && npm test
cd record-desk/frontend && npm run typecheck
```

Protocol validate/parse, overlay admission, and `tm_anytx` when the host is not localhost.

### LARS

`deployment-info.json` maps `tm_records` and `ls_records` for [LARS](https://github.com/bsv-blockchain/lars).

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `records` |
| Protocol ID | `[0, "records"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to record fields) |
| Topic (local Docker) | `tm_records` |
| Lookup (local Docker) | `ls_records` |
| Kinds | `hours`, `inspection`, `note` |

## Layout

```
record-desk/
  protocol/          PushDrop encode/decode, hash, admission
  frontend/          GitHub Pages static app
  overlay/           optional local overlay-express topic
  docker-compose.yml
  deployment-info.json
```
