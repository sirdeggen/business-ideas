# Raffle (v0)

This trip’s draw. Free stub. One winner, in the room.

A company-offsite tombola: everyone on the trip takes a free stub, the host draws in the room. Not a sold raffle, not a casino, not a sweepstakes. There is no ticket price.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The page queries `ls_anytx` via `LookupResolver`, then keeps only this app’s raffle PushDrop fields (MAGIC). A stranger can read a raffle without a wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/raffle/`

Local Docker `tm_raffle` / `ls_raffle` is an optional override. Pages does not need it.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on Start, Take a ticket, Pass, or Draw.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, `signAction`, and `internalizeAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. The host is the `identityKey` of the visitor who clicks Start (`WalletClient('auto', originator())`, originator = page hostname, on Pages `sirdeggen.github.io`).
- State: wallet basket `raffle`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). Local Docker still hosts custom `tm_raffle` / `ls_raffle`.
- Encoding: PushDrop fields — header (event name, prize, optional HR value, who can take a ticket, ticket count, one-per-person, when we draw, must-be-here, host name), ticket (index + holder name), draw (winning stub + name).
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay (public): `https://overlay-us-1.bsvb.tech`. Overlay (local optional): `@bsv/overlay-express` + MongoDB + MySQL.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests
- Docker + Docker Compose for the optional local overlay

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Host: fill Margaret’s eight fields (Event, Prize, Who can enter, Tickets, One per person, We draw, Must be here to win, Ask). Click **Start**. Approve Desktop.
3. Share `?r=<raffleId>`.
4. Guest: read the offsite with no wallet — event, prize, This trip only, We draw [moment], “14 of 40 taken”, One per person (or “You can pass this stub to a coworker”), Ask Priya, “Free. Must be here when we draw.” Then **Take a ticket**.
5. If one-per-person is off, **Pass your stub** hands it to the person who had to leave early.
6. Host clicks **Draw** in the room. The winner is a name.

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
