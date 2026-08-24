# Raffle (v0)

Start a raffle. Pass a ticket. Draw a winner.

A digital tombola: the host names a prize, guests claim tickets, anyone with a ticket can pass it if the host said so, and only the host draws. Not a casino. Not a pot.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The page queries `ls_anytx` via `LookupResolver`, then keeps only this app’s raffle PushDrop fields (MAGIC). A stranger can read a raffle without a wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/raffle/`

Local Docker `tm_raffle` / `ls_raffle` is an optional override. Pages does not need it.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on Start, Claim, Pass, or Draw.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, `signAction`, and `internalizeAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. The host is the `identityKey` of the visitor who clicks Start (`WalletClient('auto', originator())`, originator = page hostname, on Pages `sirdeggen.github.io`).
- State: wallet basket `raffle`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). Local Docker still hosts custom `tm_raffle` / `ls_raffle`.
- Encoding: PushDrop fields — header (title, who can enter, ticket count, transferable, draw note, terms), ticket (index + holder), draw (winning outpoint or index).
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay (public): `https://overlay-us-1.bsvb.tech`. Overlay (local optional): `@bsv/overlay-express` + MongoDB + MySQL.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests
- Docker + Docker Compose for the optional local overlay

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Host: fill the form (prize, who can enter, ticket count, transferable, when to draw, optional terms). Click **Start**. Approve Desktop.
3. Share `?r=<raffleId>`.
4. Guest: read the prize and remaining tickets with no wallet. Click **Claim** to take a ticket, or **Receive** if someone passed you one.
5. **Pass** spends your ticket UTXO and recreates it for a coworker (paste their identity), or copy the claim link.
6. Host clicks **Draw**. One live ticket wins. The winner is announced on the overlay.

## Public overlay vs local Docker

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |
| Local Docker override | `http://localhost:8084` | `tm_raffle` | `ls_raffle` |

## Run the overlay locally (optional)

```bash
cd raffle
cp .env.example .env   # optional; compose already loads .env.example
docker compose up --build
```

- Overlay HTTP: http://localhost:8084 (`POST /submit`, `POST /lookup`, `GET /health/live`, `GET /health`, `GET /version`)
- Frontend container: http://localhost:5177
- MySQL: 3310 / MongoDB: 27021

Point the UI at a local overlay-express node by setting **Overlay URL** to `http://localhost:8084` (stored in localStorage). Pages default is `https://overlay-us-1.bsvb.tech`.

### Frontend only (wallet against a running overlay)

```bash
cd raffle/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5177.

### Tests

```bash
cd raffle
make test
```

Protocol validate/parse, overlay topic is `tm_anytx` when not localhost, draw rejects a non-host, transfer spends the ticket UTXO, frontend typecheck.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `raffle` |
| Protocol ID | `[0, "raffle"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to raffle MAGIC) |
| Topic (local Docker) | `tm_raffle` |
| Lookup (local Docker) | `ls_raffle` |

## Layout

```
raffle/
  protocol/          shared field encode/decode + admission rules
  frontend/          GitHub Pages static app
  overlay/           optional local overlay-express node
  docker-compose.yml
```
