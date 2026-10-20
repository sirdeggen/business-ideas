# Mandate Desk (v0)

An org — an endowment, an HOA reserve, a club treasury — hires an outside manager without handing over its keys. The funded sats sit under a UTXO script mandate.

The owner lock is the owner's BRC-42 signing key (counterparty `anyone`, key id `mandate-lock`) and `OP_CHECKSIG`. Anyone can recompute that key from the owner identity. Only the owner wallet can spend it. Record creates that output with `createAction` and puts the funded sats in it. Recall spends it and the sats return to the owner. That is the only rule the v0 script enforces.

The manager may send only to whitelisted destinations, and only inside a per-period cap. The manager’s fee accrues by formula: `floor(period gain × fee basis points / 10000)`, in the 5–10% band (500–1,000; default 800). Any change to the mandate needs the owner’s signature and waits out a notice period. v0 computes and records the whitelist, the cap, the fee, and the notice. The locking script does not read them. A recorded send does not spend the lock. `OP_PUSH_TX` enforcement of destinations, caps, and the fee output is v1.

The public book also writes a 1-sat receipt for each record. It does not pay the fee out. A send counts on the public book only when the manager key signed it with BRC-100 `createSignature`, counterparty `anyone`, and only when its stated time is not before the tx that published it. The tx clock is the overlay block or broadcast time when the lookup record has one, otherwise the tx’s unix lockTime. Notice and manager replacement follow that order, not a backdated `proposedAt` or `sentAt`. Owner records (open, fund, gain, recall, change) are signed the same way, so a reader can verify them. The mandate id is `sha256(ownerKey || nonce)`.

This is not Treasury (a 2-of-3 board vault). This is not Spend Policy (a spender following a payee list and a daily cap). This is not Credit (a draw against an invoice). One owner lock, a hired manager, and a fee that accrues by formula.

The walkthrough stores the mandate in the browser. No wallet on first paint. Open, fund, mark a gain, send, recall, and propose a change all run locally. **Record on the public book** is last: after `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at the public overlay. The desk queries `ls_anytx` and keeps only this app’s PushDrop fields (MAGIC `mandate`).

Message Box at `https://gmb.bsvblockchain.tech` (box `mandate`) is an optional nudge when the receipt is recorded. Overlay is the public book.

Public UI: `https://sirdeggen.github.io/business-ideas/mandate/`

Deep links are query params: `?m=<mandateId>&tx=<txid>`. Do not use a path like `/m/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Record on the public book**.

## Stack

- Wallet interface: BRC-100. The app never keeps keys. It calls `createAction`, `getPublicKey`, and `createSignature` via the visitor’s Desktop, and only when recording.
- State: the mandate, funds, gains, sends, recalls, and changes are a local walkthrough until you record. Wallet basket `mandate`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `mandate`).
- Encoding: PushDrop fields — open (org, manager, whitelist, cap, period, fee, notice, owner key, nonce, owner lock), fund, gain, send, recall, change.
- Script: the funded output locks to the owner signing key and `OP_CHECKSIG`. Recall spends it. v0 does not check the whitelist, the cap, the fee, or the notice in script. A recorded send does not spend the lock. `OP_PUSH_TX` output enforcement is v1.
- Fee: performance fee default 800 basis points, from 500 to 1,000. `floor(gain × bps / 10000)`.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you record
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Leave the org as Harbor HOA Reserve, the sample manager key, the sample whitelist destination, the cap at 100,000 sats, the period at 30 days, the fee at 800 basis points, and the notice at 14 days. Click **Open the mandate**. No wallet.
3. Leave the fund at 1,000,000 sats and click **Record a fund**. The balance is recorded. The sats move into the owner lock when you record.
4. Leave the gain at 50,000 sats and click **Mark the period gain**. The fee line shows 4,000 sats. That number is recorded. It is not paid out.
5. Leave the destination on the whitelist and the amount at 25,000. Click **Send under the mandate**. Try a destination that is not listed, or an amount over the remaining cap. The page shows a sentence and does not open the wallet.
6. Click **Pull everything back**. Recording spends the owner-lock output and returns those sats to the owner.
7. Set the new cap to 50,000 and click **Propose the change**. The page shows the date the change applies. Until then the current cap stays. The script does not read that clock.
8. **Record on the public book** asks for the wallet and writes the owner-signed mandate to `tm_anytx`. A send is counted there only after the manager key signs it. Install Desktop appears only if the wallet is missing.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd mandate/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5189.

### Tests

```bash
cd mandate/frontend
npm test
npm run build
```

Encode/decode, fee floor math in the 5–10% band, whitelist and cap refusal, full recall, notice period, owner `OP_CHECKSIG` lock, BRC-100 `createSignature` with counterparty `anyone`, MAGIC `mandate` filter, overlay topic is `tm_anytx` even on localhost, first-paint copy (no wallet gate, no Install Desktop until a wallet failure). Deep links use `?m=` not `/m/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `mandate` |
| Protocol ID | `[0, "mandate"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `mandate`) |
| Protocol string | `mandate` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `mandate`) |
| Performance fee | 800 bps default, 500–1,000 |
| Period cap | 100,000 sats default |
| Period | 30 days default |
| Notice | 14 days default |
| Owner lock | BRC-42 `mandate-lock`, counterparty `anyone`, plus `OP_CHECKSIG` |
| Fund output | the funded sats, under that lock |
| Record receipt | 1 sat, beside the lock |

## Layout

```
mandate/
  protocol/          field encode/decode, owner OP_CHECKSIG, mandate rules
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
