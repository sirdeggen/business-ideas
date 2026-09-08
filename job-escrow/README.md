# Job escrow (v0)

Fund a job. Lock until the hash lands.

A client funds a job in sats. Funds lock on a UTXO / overlay escrow. The provider submits a deliverable hash. The client releases — or a simple challenge / refund. This is a TermiX AACP / request-escrow analog. A tiny ~2% protocol fee is product-story context only. This product does not invent GMV.

Not StreamPay (those pay as they work). Not Session AP (those close many small spends into one invoice).

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts Atomic BEEF to `tm_anytx`. The page queries `ls_anytx`, then keeps only this app’s PushDrop fields (protocol string `jobescrow`). Wallet is asked only on **Fund**, **Submit**, **Release**, **Challenge**, and **Refund**. A stranger can read the ticket with no wallet.

Public UI: `https://sirdeggen.github.io/business-ideas/job-escrow/`

Deep links are query params: `?j=<jobId>&tx=<txid>`. Do not use a path like `/j/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. Client: label `Shop repair`, provider name `Ada`, amount `100000`. Provider key under Advanced. Click **Fund**. Approve Desktop.
2. Share `?j=<jobId>&tx=<txid>`.
3. Provider: paste the deliverable hash. **Submit**. Approve Desktop.
4. Client: **Release** to open the lock, or **Challenge** / **Refund**.
5. A stranger can read the label, provider name, amount, and hash with no wallet.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, and `signAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. Identity key alone is not login. Provider name sits on the face; the provider key is under Advanced.
- State: wallet basket `jobescrow`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `jobescrow`).
- Encoding: PushDrop fields — fund (label, provider name, amount, identities), submit (deliverable hash), release, challenge, refund.
- Payment: the fund output locks the amount. Release spends that lock and pays the provider. Refund spends it back. Challenge is a 1-sat flag. v0 does not take the ~2% story fee.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `jobescrow`) is an optional nudge. Overlay is the public book.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Client: label, provider name, amount. Provider key under Advanced. Click **Fund**. Approve Desktop.
3. Share `?j=<jobId>&tx=<txid>`.
4. Stranger: read the ticket. No wallet.
5. Provider: **Submit** the deliverable hash. Approve Desktop.
6. Client: **Release**, or **Challenge** / **Refund**.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd job-escrow/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5182.

### Tests

```bash
cd job-escrow/frontend
npm test
npm run build
```

State machine, encode/decode, first-paint copy (no Live, no Connect on load, wallet only on Fund/Submit/Release/Challenge/Refund), deep links use `?j=` not `/j/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `jobescrow` |
| Protocol ID | `[0, "jobescrow"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `jobescrow`) |
| Protocol string | `jobescrow` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `jobescrow`) |
| Story fee | ~2% (not taken in v0) |
| Default | Shop repair, Ada, 100,000 sats |

## Layout

```
job-escrow/
  protocol/          field encode/decode + job state
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
