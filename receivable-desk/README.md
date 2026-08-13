# Receivable desk (v0)

Collections for invoices you already issued — **who do we chase today?** Same treasurer, after a few real invoices exist. This is the paper that proves the invoice, not a second product.

Aging is in English: **on time / a bit late / call them / board should know**. Worklist rows: name, amount, days late, Send reminder / Mark paid.

**This desk does not originate loans, become a bank, lend, or custody funds.** Advance is not available (`Advance against this invoice — not available.`).

The list is this folder’s own registry (sample invoices here). It does not read Peter’s `invoices/` objects. Overlay is localhost. **Settle does not work from GitHub Pages** — run Docker:

```bash
cd receivable-desk
docker compose up --build
```

Overlay **:8082**, UI **:5175**.

Public UI (GitHub Pages, list only — no settle): `https://sirdeggen.github.io/business-ideas/receivables/`

Sibling payable-invoice app lives in [`invoices/`](../invoices/). This desk does not modify that folder. Local compose ports here are offset so tickets (8080), invoices (8081), and this registry (8082) can run together.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, `signAction`, and `internalizeAction`.
- Identity: 66-hex compressed pubkey. Receivable UTXOs lock with PushDrop (BRC-48) using BRC-42 derivation inside the wallet. Settle pays the creditor with [BRC-29](https://bsv.brc.dev/payments/0029) P2PKH.
- State: wallet basket `receivables` plus overlay topic `tm_receivables` / lookup `ls_receivables`.
- Encoding: PushDrop fields — magic, invoice id, creditor, debtor, amount sats, due date, status (`open` / `approved` / `paid`), memo, advance-intent bps.
- Frontend: Vite + React. Wallet via `createWallet()` from `@bsv/simple/browser` (falls back to `WalletClient('auto', originator)` from `@bsv/sdk`). Overlay via `@bsv/simple/browser` `Overlay` plus direct `POST /submit`, `POST /lookup`, and `POST /intent`.
- Overlay: `@bsv/overlay-express` + MongoDB + MySQL.

Status changes are spends that create the next-state UTXO (or a paid marker). Duplicate invoice ids are rejected. Junk PushDrop data is not admitted.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) or [BSV Browser](https://github.com/bsv-blockchain/bsv-browser) for register / approve / settle
- Node 22+ for local frontend and tests
- Docker + Docker Compose for the local overlay (and the 10 sample invoices)

## Record

1. Connect a wallet.
2. Open **Record invoice**.
3. Set invoice id, who is owed, who owes us, amount, due date, memo.
4. Approve the wallet prompt. Duplicate invoice ids are rejected.

## List

**Chase** is the treasurer worklist: name, amount, days late, Send reminder / Mark paid. Aging is English: on time / a bit late / call them / board should know.

**You owe us** is the public unpaid list. No wallet needed to read it.

Unpaid = `open` or `approved`. Paid markers stay in the index so the invoice id cannot be recorded again.

## Mark paid

Mark paid is a settle of the live receipt. It does **not** run from GitHub Pages.

1. Run `docker compose` so the index is on **:8082** and the UI on **:5175**.
2. On **Chase**, pick an unpaid invoice this wallet recorded.
3. **Mark paid** spends it to a `paid` marker and pays the billed amount to whoever is owed.
4. Overlay admits the paid marker only if that payment is present. Lookup of that invoice as unpaid is empty.

The wallet must be able to fund the billed amount. The registry token is not custody of the invoice funds.

## Show the registry / advance

**You owe us** is the public unpaid list. **Advance** stays visible but disabled:

**Advance against this invoice — not available.**

No calculator. No APR. We are not a bank or a lender.

## Run the overlay locally

Docker Compose is the default local indexer (overlay-express + MySQL + Mongo) and seeds **10 sample receivables** as one real PushDrop transaction.

```bash
cd receivable-desk
cp .env.example .env   # optional; compose already loads .env.example
docker compose up --build
```

- Overlay HTTP: http://localhost:8082 (`POST /submit`, `POST /lookup`, `POST /intent`, `GET /version`)
- Frontend container: http://localhost:5175
- MySQL: 3308 / MongoDB: 27019 (offset from event-tickets `8080` and invoices `8081`)

The seed service waits until overlay is healthy, then submits ten invoices (`INV-2026-001` … `INV-2026-010`) — mix of open, approved, approved+intent, and paid. Each output is a BRC-48 PushDrop script, not a fake table.

Point the static UI at a reachable overlay with **Overlay URL** (stored in localStorage). Default is `http://localhost:8082`.

### Frontend only (wallet against a running overlay)

```bash
cd receivable-desk/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5175. Keep overlay compose running.

### Overlay only

```bash
cd receivable-desk/overlay
npm install
# start mysql + mongo via compose, then:
KNEX_URL=mysql://receivables:receivables@127.0.0.1:3308/receivables \
MONGO_URL=mongodb://root:example@127.0.0.1:27019/?authSource=admin \
SERVER_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001 \
HOSTING_FQDN=localhost \
npm run dev
```

Then seed:

```bash
cd receivable-desk/overlay
OVERLAY_URL=http://localhost:8080 npm run seed
```

`THROW_ON_BROADCAST_FAILURE` defaults to false so local admission does not require Arcade/Arc.

### Tests

```bash
cd receivable-desk/overlay && npm test
```

Covers no double-register, paid-after-settle, and junk rejection (protocol + topic manager + storage).

### LARS

`deployment-info.json` maps `tm_receivables` and `ls_receivables` for [LARS](https://github.com/bsv-blockchain/lars).

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `receivables` |
| Protocol ID | `[0, "receivables"]` |
| BRC-29 settle | `[2, "3241645161d8"]` |
| Topic | `tm_receivables` |
| Lookup | `ls_receivables` |
| Statuses | `open`, `approved`, `paid` |
| Stub advance | 70% (`7000` bps) |

## Layout

```
receivable-desk/
  protocol/          PushDrop encode/decode, admission rules, 10 samples
  frontend/          GitHub Pages static app
  overlay/           overlay-express node, topic manager, lookup, seed
  docker-compose.yml
  deployment-info.json
```
