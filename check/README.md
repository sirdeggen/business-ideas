# Check Desk (v0)

Enterprise AP teams subscribe to screen a vendor file before a batch payment. One payee is a small fee. A wallet can call the same check before it signs.

Paste a payer’s prior payees and the proposed payee. The verdict is:

- a reporter’s flag on that identity key, paymail, or script hash → block or warn, with the flag
- a lookalike of a prior payee (same prefix and suffix, or a small edit distance, and not the same payee) → warn
- a first-time payee above the threshold → warn
- otherwise pass

Every check returns a verdict receipt. The receipt hash binds the payee, the amount, the payer ref, the verdict, the flags consulted, and the time. The check fee defaults to 10 sats. When the payer cancels after a block or warn that cited a flag, the receipt credits the reporter `floor(check fee × share / 10000)`. The default share is 50 percent, so 10 sats credits 5. A 1 sat fee at 50 percent credits 0.

Batch mode takes a small vendor-file CSV (paste or upload) and returns a verdict per row. The enterprise batch subscription is a quote only: 50,000 sats a month. This page does not charge it.

Coverage is not part of this desk. Cover Desk is optional: https://sirdeggen.github.io/business-ideas/cover/

v0 is a shared risk lookup plus receipts. It does not move or hold the payment, and it does not promise that a payee is safe. Reporter stakes and slashing are a local simulation unless they are actually recorded. Seed flags are demo data. The names on those flags are fictional.

This is not Closing (a payee bound inside one closing). This is not KYA (who runs an agent). This is not Vouch (a general staked attestation). This is not Cover (a payout). This is not Spend Policy (internal rules). Check is a shared external risk lookup on any payment.

The walkthrough stores the check in the browser. No wallet on first paint. A check, a batch, and browsing flags all run locally. **Record the receipt** and **Record the flag** are last: after `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at the public overlay. The desk queries `ls_anytx` and keeps only this app’s PushDrop fields (MAGIC `check`). The receipt output is the check fee. A recorded flag output is the stake. The payment itself does not move.

Message Box at `https://gmb.bsvblockchain.tech` (box `check`) is an optional nudge when the receipt or flag is recorded. Overlay is the public book.

Public UI: `https://sirdeggen.github.io/business-ideas/check/`

Deep links are query params: `?c=<checkId>&tx=<txid>`. Do not use a path like `/c/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Record the receipt** or **Record the flag**.

## Stack

- Wallet interface: BRC-100. The app never keeps keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop, and only when recording.
- State: checks, batch rows, and local flags are a walkthrough until you record. Wallet basket `check`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `check`).
- Encoding: PushDrop fields — flag (reporter, subject, severity, note, stake) and receipt (payee, amount, payer ref, verdict, flags consulted, hash, fee, reporter share).
- Fee: 10 sats per check by default. Reporter share 50 percent of that fee, floored, and only after a cited flag stops the payment. Batch subscription is a quote only.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you record
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Read the business case. The prior-payee list and the 10 sat check fee are already on the page.
3. Click **Try a flagged lookalike** or **Try a clean payee**, or paste your own payee and click **Check this payee**. No wallet.
4. Paste or upload a vendor file and click **Check the vendor file**. Each row has a verdict. The batch subscription line is a quote only.
5. After a block or warn that cites a flag, **Cancel the payment** credits the reporter share on the fee line.
6. **Record the receipt** or **Record the flag** asks for the wallet and writes to `tm_anytx`. Install Desktop appears only if the wallet is missing.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd check/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5188.

### Tests

```bash
cd check/frontend
npm test
npm run build
```

Verdict rules (flag hit, lookalike, first-time over the threshold, pass), receipt hash binding, check-fee and reporter-share floor math, encode/decode, MAGIC `check` filter, overlay topic is `tm_anytx` even on localhost, first-paint copy (no wallet gate, no Install Desktop until a wallet failure). Deep links use `?c=` not `/c/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `check` |
| Protocol ID | `[0, "check"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `check`) |
| Protocol string | `check` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `check`) |
| Check fee | 10 sats default |
| Reporter share | 50 percent of the check fee, floored, on a cited stop |
| Batch quote | 50,000 sats a month, quote only |
| Record output | the check fee, or the flag stake |

## Layout

```
check/
  protocol/          field encode/decode + verdict rules
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
