# Receivable desk (v0)

A cheap public **invoice registry** on BSV. Analog of Figure’s DART idea — who is owed, by whom, amount, due, status — so a licensed partner could later advance against the receipt. This v0 is the registry plus a stub credit-partner view.

**This desk does not originate HELOCs, become a bank, lend, or custody funds.** Advance 70% records intent only. BSV Blockchain only.

Public UI (GitHub Pages, after Bob adds the catalog card): `https://sirdeggen.github.io/business-ideas/receivables/`

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, and `signAction`.
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

## Register

1. Connect a BRC-100 wallet.
2. Open **Register**.
3. Set invoice id, creditor identity, debtor identity, amount in sats, due date, memo.
4. Approve `createAction`. The wallet creates a 1-sat PushDrop output in basket `receivables` with status `open`.
5. The app submits Atomic BEEF to overlay topic `tm_receivables`. A second register of the same invoice id is rejected.

## Approve

1. Open **Approve / settle**.
2. Refresh the basket. An `open` UTXO this wallet holds can be approved.
3. **Approve** spends the open output and creates an `approved` PushDrop with the same invoice identity, parties, amount, and due date.

## List

**Registry** is the overlay explorer a lender could refresh.

- Filter `all` / `open` / `approved` / `paid` / `unpaid`
- Optional creditor or debtor identity key
- **Refresh overlay** calls `POST /lookup` on `ls_receivables`

Unpaid = `open` or `approved`. Paid markers stay in the index so the invoice id cannot be minted again.

## Settle

Settle is a BRC-29 spend of the live receipt:

1. On **Approve / settle**, pick an unpaid UTXO this wallet holds.
2. **Settle (BRC-29)** spends it to a `paid` marker and adds a BRC-29 P2PKH output of `amountSats` to the creditor identity (`protocolID [2, "3241645161d8"]`, derivation prefix/suffix in `customInstructions`).
3. Overlay admits the paid marker. Lookup of that invoice as unpaid is empty.

The wallet must be able to fund the BRC-29 output (the invoice amount). The 1-sat registry token is not custody of the invoice funds.

## Show the registry / credit partner

**Credit partner** lists `approved` + unpaid invoices. **Advance 70%** is a stub:

- If this wallet holds the UTXO, it spends to the same approved state with `advanceBps = 7000` (on-chain intent).
- Otherwise it `POST /intent` and the overlay records 70% against the receipt.

No sats of credit move. No loan is originated.

## Run the overlay locally

Docker Compose is the default local indexer (overlay-express + MySQL + Mongo) and seeds **10 sample receivables** as one real PushDrop transaction.

```bash
cd receivable-desk
cp .env.example .env   # optional; compose already loads .env.example
docker compose up --build
```

- Overlay HTTP: http://localhost:8081 (`POST /submit`, `POST /lookup`, `POST /intent`, `GET /version`)
- Frontend container: http://localhost:5174
- MySQL: 3307 / MongoDB: 27018 (offset from event-tickets so both can run)

The seed service waits until overlay is healthy, then submits ten invoices (`INV-2026-001` … `INV-2026-010`) — mix of open, approved, approved+intent, and paid. Each output is a BRC-48 PushDrop script, not a fake table.

Point the static UI at a reachable overlay with **Overlay URL** (stored in localStorage). Default is `http://localhost:8081`.

### Frontend only (wallet against a running overlay)

```bash
cd receivable-desk/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5173. Keep overlay compose running.

### Overlay only

```bash
cd receivable-desk/overlay
npm install
# start mysql + mongo via compose, then:
KNEX_URL=mysql://receivables:receivables@127.0.0.1:3307/receivables \
MONGO_URL=mongodb://root:example@127.0.0.1:27018/?authSource=admin \
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
