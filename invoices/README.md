# Payable invoices (v0)

An invoice is a first-class on-chain object on **BSV**. The payee creates a payable (identity, amount in sats, memo, due date) as a PushDrop UTXO in a BRC-100 basket. The payer settles it with a BRC-29 payment. Overlay lookup is the public audit trail: open or paid, and a second pay is rejected.

This is not Request Finance on 18 chains. No virtual IBANs, no payroll, no cards, no Xero. One issuer, a few invoices, sats, a receipt.

This folder is exclusive. A sibling receivable desk may land in a separate PR; this tree does not add or modify that product. Basket `invoices`, topic `tm_invoices`, lookup `ls_invoices` are defined here.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, `signAction`, and `internalizeAction`.
- Identity: 66-hex compressed pubkey. Payment locks a P2PKH output to a BRC-29 derived key (`[2, "3241645161d8"]`).
- Invoice state: wallet basket `invoices` (BRC-45/46) plus overlay topic `tm_invoices` / lookup `ls_invoices`.
- Encoding: PushDrop (BRC-48) fields for the open invoice and for the payment receipt.
- Frontend: Vite + React. Wallet via `createWallet()` from `@bsv/simple/browser` (falls back to `WalletClient('auto', originator)` from `@bsv/sdk`). Overlay via `@bsv/simple/browser` `Overlay` plus direct `POST /submit` and `POST /lookup`.
- Overlay: `@bsv/overlay-express` + MongoDB + MySQL. Custom topic — not hosted on `https://overlay-us-1.bsvb.tech` (that node has SHIP/SLAP/identity/etc., not `tm_invoices`).

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) or [BSV Browser](https://github.com/bsv-blockchain/bsv-browser)
- Node 22+ for local frontend
- Docker + Docker Compose for the local overlay

## Create

1. Connect the payee wallet (needs a few sats for the 1-sat invoice UTXO plus fees).
2. Enter amount in sats, memo, due date.
3. Click **Create invoice**. Approve `createAction`.
4. The app submits Atomic BEEF to topic `tm_invoices`. The topic manager admits a well-formed invoice PushDrop. Lookup lists it as **open**.

## Pay

1. On **Open**, click **Pay with BSV**.
2. The app first calls overlay lookup with `{ invoiceId, forPay: true }`. If the invoice is already paid, lookup throws and the button path stops.
3. Approve `createAction`. The transaction has:
   - a BRC-29 P2PKH output of the billed satoshis to the payee identity
   - a 1-sat PushDrop receipt bound to that invoice id
4. Overlay admits the receipt only if the billed output satoshis match. Lookup marks the invoice **paid** (or rejects a second pay).

## Receipt

After a successful pay the page shows **invoice id + payment txid**. Copy the JSON package and give it to the payee. They paste it into **Accept a payment**, which calls `internalizeAction` with BRC-29 `wallet payment` remittance.

A second pay of the same invoice is rejected by `ls_invoices` (`forPay: true` and `markPaid` both throw `Invoice already paid`).

## Lookup

`POST /lookup` on the overlay node, service `ls_invoices`:

| Query | Result |
| --- | --- |
| `{ "status": "open" }` | unpaid invoices |
| `{ "status": "paid" }` | settled invoices, including `paymentTxid` |
| `{ "invoiceId": "<32 hex>" }` | that invoice |
| `{ "invoiceId": "<32 hex>", "forPay": true }` | same, or an error if missing/already paid |
| `{ "payeeIdentity": "02…\|03…" }` | that issuer’s invoices |

## Run the overlay locally

```bash
cd invoices
cp .env.example .env   # optional; compose already loads .env.example
docker compose up --build
```

- Overlay HTTP: http://localhost:8081 (`POST /submit`, `POST /lookup`, `GET /health`, `GET /version`)
- Frontend container: http://localhost:5174
- MySQL: 3307 / MongoDB: 27018 (offset from event-tickets so both can run)

Point the static page at a reachable overlay with **Overlay URL** (stored in localStorage). Default is `http://localhost:8081`.

### Frontend only (wallet against a running overlay)

```bash
cd invoices/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5174. Keep overlay compose running.

### Overlay only (no frontend container)

```bash
cd invoices/overlay
npm install
# start mysql + mongo via compose, then:
KNEX_URL=mysql://invoices:invoices@127.0.0.1:3307/invoices \
MONGO_URL=mongodb://root:example@127.0.0.1:27018/?authSource=admin \
SERVER_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001 \
HOSTING_FQDN=localhost \
npm run dev
```

`THROW_ON_BROADCAST_FAILURE` defaults to false so local admission does not require Arcade/Arc.

### LARS

`deployment-info.json` in this folder maps `tm_invoices` and `ls_invoices` for [LARS](https://github.com/bsv-blockchain/lars). From `invoices/`:

```bash
npm i -g @bsv/lars
lars
```

Docker Compose above is the documented zero-prompt path.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `invoices` |
| Protocol ID | `[0, "invoices"]` |
| Topic | `tm_invoices` |
| Lookup | `ls_invoices` |
| Invoice magic | `bsvinvoice` |
| Receipt magic | `bsvinvoice-paid` |
| BRC-29 | `[2, "3241645161d8"]` |

## Layout

```
invoices/
  protocol/          shared field encode/decode + admission rules
  frontend/          static app (GitHub Pages later; Bob owns the index)
  overlay/           overlay-express node, topic manager, lookup
  docker-compose.yml
  deployment-info.json
```

## License

Open BSV License, matching the BSV ts-stack.
