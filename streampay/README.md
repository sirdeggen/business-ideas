# StreamPay (v0)

Pay as they work. A treasurer opens a time-accruing stream to a contractor. The contractor claims what’s accrued. The treasurer can freeze the clock. Both get a human receipt.

This is not Superfluid, Deel, Rise, or Bitwage. BSV only. Money accrues with time (client math). The worker claims. The treasurer freezes. Distinct from invoices: an invoice is a fixed payable; a stream keeps earning until it ends or is frozen.

This folder is exclusive. Do not look here for tickets, desk, invoices, or treasury.

## First success

She opens a 14-day stream (default **100,000 sats**) to one contractor, with start set three days in the past. He opens the public link, claims day-3 accrued pay, and both see a receipt. Settlement is sats. Dollars are display only.

## Stack

- Wallet: BRC-100 via `createWallet()` from `@bsv/simple/browser` (falls back to `WalletClient('auto', originator)`). Keys never leave the wallet. Protocol `[0, "streampay"]`, basket `streampay`. Wallet is not opened until **Open**, **Claim**, or **Freeze** (~8s timeout).
- Record: one PushDrop whose satoshis are the funded pot (`amountSats` at Open). Field 0 tag `streampay`. The worker unlocks it (PushDrop counterparty = contractor, keyID = streamId). Freeze is a separate 1-sat treasurer snapshot and does not move the pot.
- Overlay: public `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. Submit is `HTTPSOverlayBroadcastFacilitator.send` then `POST /submit` (`content-type: application/octet-stream`, `x-topics: ["tm_anytx"]`). Success = STEAK `outputsToAdmit` length &gt; 0. No `TopicBroadcaster` with `networkPreset: 'local'`.
- Lookup: page `{limit, skip, sortOrder}` and/or `{txid}`. Filter `field[0] === 'streampay'` in the browser. `ls_anytx` has no tag filter.
- Notify: MessageBoxClient to `https://gmb.bsvblockchain.tech`, box `streampay`. Overlay is source of truth; a Message Box failure does not block open, claim, or freeze.
- Frontend: Vite + React. GitHub Pages. No Docker required.

## Accrual

```
elapsed = max(0, min(now, start+duration, freezeIso or ∞) − start)
earned  = min(amountSats, floor(rateSatsPerSec × elapsed))
claimable = max(0, earned − claimedSats)
```

Rate is `amountSats / durationSec`. Freeze stops the clock. Already-claimable stays claimable.

## Create

1. **Open a stream.** Org name, contractor name, contractor identity (needed so they can unlock the pot), what it’s for, amount in **sats** (default **100,000 over 14 days**), start (a past start is allowed so day 3 is demoable).
2. Approve in the wallet. The treasurer **funds** the stream: the PushDrop output is those sats, not a $400 spot conversion and not 1 sat. If the wallet cannot cover that, you get a human “not enough to fund this stream.”
3. Copy the public URL (`/streampay/?s=<streamId>`). An auditor can open it with no wallet and see rate, accrued, claimed, and Open / Frozen / Finished.

## Claim

The worker spends **the stream UTXO** — the sats the treasurer locked at Open. Accrual stays client math: `claimable = accrued − claimed`. The same transaction pays `claimable` **BRC-29** to the contractor and re-emits the PushDrop with `claimedSats += claimable` and the remaining pot. `createAction` is those accrued sats (plus fee), not a dollar spot amount.

Self-funded pay from the contractor’s pocket is not StreamPay. A 1-sat `$400` Open (token only) is demo-broken; Claim refuses with “this stream isn’t funded” and does not invent sats.

1. Open the stream link. Accrued ticks on the page.
2. Click **Claim**. Approve. Inputs include the stream UTXO. Outputs are claimable plus remaining pot (and fee/change), not the full notional from contractor funds.
3. Both parties get a receipt on this page: fat stamp, org, contractor, amount claimed, time, human id. Txid and protocol sit under **Details**. No JSON package.

## Freeze

1. Treasurer clicks **Freeze**. Approve.
2. A new snapshot is emitted with `frozen=1` and `freezeIso`. Accrual stops.
3. Already-claimable can still be claimed.

## Lookup

`POST /lookup`, service `ls_anytx`:

| Query | Result |
| --- | --- |
| `{ "limit", "skip", "sortOrder": "desc" }` | recent anytx outputs; client keeps `streampay` |
| `{ "txid" }` | that transaction, then the same filter |
| latest row per `streamId` | max `claimedSats`, sticky freeze |

## Run the frontend (no Docker)

```bash
cd streampay/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5176. The page talks to the public overlay. [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) or [BSV Browser](https://github.com/bsv-blockchain/bsv-browser) is needed only to Open, Claim, or Freeze.

```bash
npm run build    # tsc -b && vite build (what Pages runs)
npm test         # accrual math + humanized overlay errors
```

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `streampay` |
| Protocol ID | `[0, "streampay"]` |
| Topic | `tm_anytx` |
| Lookup | `ls_anytx` |
| Tag | `streampay` |
| Message Box host | `https://gmb.bsvblockchain.tech` |
| Message Box | `streampay` |
| BRC-29 | `[2, "3241645161d8"]` |
| Default pot | `100,000` sats over 14 days |

## Layout

```
streampay/
  protocol/     field encode/decode + accrual math
  frontend/     static app (GitHub Pages)
  README.md
```

## License

Open BSV License, matching the BSV ts-stack.
