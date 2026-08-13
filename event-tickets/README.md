# Event tickets (v0)

Tickets are UTXOs. The organizer mints a tranche of Demo Night general-admission tickets into a BRC-100 basket. An attendee holds one in BSV Desktop or BSV Browser, shows a QR at the door, can transfer it by spending to another identity key, and the door redeems by spending the UTXO. After redeem, the overlay lookup of that outpoint is empty.

This stack is BSV only: BRC-100 wallets, PushDrop ticket UTXOs, and overlay-express. One event (`demonight`), one ticket type (`ga`).

Public UI (GitHub Pages): after merge, `https://sirdeggen.github.io/business-ideas/`

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, `signAction`, and `internalizeAction`.
- Identity: 66-hex compressed pubkey. Transfers lock a PushDrop output to that key (BRC-29 / BRC-42 derivation inside PushDrop), not a Bitcoin address.
- Ticket state: wallet basket `eventtickets` (BRC-45/46) plus overlay topic `tm_tickets` / lookup `ls_tickets` (BRC-22/24).
- Encoding: PushDrop (BRC-48) fields: magic, event id, serial, type, venue metadata.
- Frontend: Vite + React. Wallet via `createWallet()` from `@bsv/simple/browser` (falls back to `WalletClient('auto', originator)` from `@bsv/sdk`). Overlay lookup via `@bsv/simple/browser` `Overlay` plus direct `POST /submit` and `POST /lookup`.
- Overlay: `@bsv/overlay-express` + MongoDB + MySQL, `POST /submit` and `POST /lookup`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) or [BSV Browser](https://github.com/bsv-blockchain/bsv-browser)
- Node 22+ for local frontend
- Docker + Docker Compose for the local overlay

## Mint

1. Connect the organizer wallet (needs satoshis for 1 sat per ticket plus fees).
2. Open **organizer**.
3. Choose N (1–20) and click **Mint tickets**.
4. Approve `createAction`. Each output is a PushDrop ticket in basket `eventtickets`.
5. The app submits the Atomic BEEF to overlay topic `tm_tickets`. The topic manager admits mint outputs that decode as Demo Night tickets with unique serials.

## Hold / QR

1. Switch to **attendee** (same wallet after mint, or a wallet that received a transfer).
2. **Refresh basket** lists `listOutputs({ basket: 'eventtickets' })`.
3. Each ticket shows a QR whose payload is `{ v, eventId, serial, outpoint }`.

## Transfer

Transfer is a spend. The old UTXO dies; a new PushDrop UTXO is locked to the recipient identity key.

1. On **attendee**, paste the recipient’s 66-hex identity key (`getPublicKey({ identityKey: true })`).
2. Approve the spend (`createAction` + `signAction` with `PushDrop.unlock`).
3. Overlay admits the new output only if it preserves event id + serial.
4. Give the recipient the JSON handoff package. They paste it into **Accept a transfer**, which calls `internalizeAction` with `basket insertion` so their wallet tracks the UTXO. Without that step the coins are on-chain at their key but not in their basket UI.

## Redeem (door)

1. Attendee shows the QR.
2. Door tab: paste the QR JSON or `txid.vout`.
3. **Lookup overlay** (`POST /lookup` on `ls_tickets`).
   - Live ticket → Admit.
   - Empty result → Reject (never admitted, invalid, or already spent).
4. If the connected wallet holds that outpoint, **Redeem (spend)** consumes it with no replacement ticket output.
5. Overlay `outputSpent` deletes the record. A second lookup of the same outpoint fails.

The topic manager also rejects transfers that change the serial and mints with duplicate serials in the same transaction.

## Run the overlay locally

Docker Compose is the default local indexer (overlay-express + MySQL + Mongo). LARS is optional.

```bash
cd event-tickets
cp .env.example .env   # optional; compose already loads .env.example
docker compose up --build
```

- Overlay HTTP: http://localhost:8080 (`POST /submit`, `POST /lookup`, `GET /health`, `GET /version`)
- Frontend container: http://localhost:5173
- MySQL: 3306 / MongoDB: 27017

Point the Pages demo at a reachable overlay by setting **Overlay URL** in the UI (stored in localStorage). Default is `http://localhost:8080`.

### Frontend only (wallet against a running overlay)

```bash
cd event-tickets/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5173. Keep overlay compose running.

### Overlay only (no frontend container)

```bash
cd event-tickets/overlay
npm install
# start mysql + mongo via compose, then:
KNEX_URL=mysql://tickets:tickets@127.0.0.1:3306/tickets \
MONGO_URL=mongodb://root:example@127.0.0.1:27017/?authSource=admin \
SERVER_PRIVATE_KEY=0000000000000000000000000000000000000000000000000000000000000001 \
HOSTING_FQDN=localhost \
npm run dev
```

`THROW_ON_BROADCAST_FAILURE` defaults to false so local admission does not require Arcade/Arc. Set it true and configure `ARC_API_KEY` / Arcade when you put the node on a cluster.

### LARS

`deployment-info.json` in this folder maps `tm_tickets` and `ls_tickets` for [LARS](https://github.com/bsv-blockchain/lars). From `event-tickets/`:

```bash
npm i -g @bsv/lars
lars
```

Select the Local LARS config (backend + frontend). LARS brings up overlay-express, MySQL, Mongo, and can start the Vite app. Docker Compose above is the documented zero-prompt path if you do not want the LARS wizard.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `eventtickets` |
| Protocol ID | `[0, "tickets"]` |
| Topic | `tm_tickets` |
| Lookup | `ls_tickets` |
| Event id | `demonight` |
| Ticket type | `ga` |

## Layout

```
event-tickets/
  protocol/          shared field encode/decode + admission rules
  frontend/          GitHub Pages static app
  overlay/           overlay-express node, topic manager, lookup
  docker-compose.yml
  deployment-info.json
```
