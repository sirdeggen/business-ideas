# Scrip Desk (v0)

An org issues its own branded stored value. A holder can see whether a posted reserve covers what is outstanding, and can redeem on demand.

A credit union, festival, co-op, school, or campus names a brand, a ticker, and a unit (Campus Cash is the example). The setup fee is a flat amount in sats. Mint and redeem fees are basis points of the sats on the receipt (defaults 50 and 25). `floor(amount × bps / 10000)`. The mint fee is taken from the sats paid. The redeem receipt shows gross sats, the fee, and net sats.

The org posts a reserve attestation: the amount it claims backs outstanding scrip, a timestamp, and a hash of that claim. A stranger compares outstanding liability with that attested reserve and sees under-collateral, covered, or over-collateral. Redeem is blocked when the attestation is missing or the attested reserve is below the outstanding liability.

v0 records and attests. It does not hold custody and it does not move reserves. The reserve attestation is a hashed claim the org posts. It is not a bank API. v0 is not a bank-grade custodian, not FDIC insurance, and not a licensed trust. There is no yield oracle. A simulated yield-share line is desk economics copy only.

This is not Treasury (a multi-approver vault and dual-control spending). This is not Memberships (a timed access key). This is not StreamPay (continuous payment flows). This is not Registry (a register of units and transfers). This is not Vault Claim (a claim on a vaulted item). One branded balance, with a public reserve attestation and redeem on demand.

The walkthrough stores the brand in the browser. No wallet on first paint. Issue, mint, attest, and redeem all run locally. **Record on the public book** is last: after `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at the public overlay. The desk queries `ls_anytx` and keeps only this app’s PushDrop fields (MAGIC `scrip`). The record output is a 1-sat receipt. It does not move the setup fee, the mint, or the reserve.

Message Box at `https://gmb.bsvblockchain.tech` (box `scrip`) is an optional nudge when the receipt is recorded. Overlay is the public book.

Public UI: `https://sirdeggen.github.io/business-ideas/scrip/`

Deep links are query params: `?s=<scripId>&tx=<txid>`. Do not use a path like `/s/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Record on the public book**.

## Stack

- Wallet interface: BRC-100. The app never keeps keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop, and only when recording.
- State: the brand, mints, redeems, and attestations are a local walkthrough until you record. Wallet basket `scrip`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `scrip`).
- Encoding: PushDrop fields — issue (org, brand, ticker, unit, setup fee, mint and redeem basis points), mint (units, sats paid, fee, net), reserve attestation (reserve, outstanding, liability, hash), redeem (gross, fee, net).
- Fee: setup fee in sats. Mint default 50 basis points. Redeem default 25 basis points.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you record
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Name the org, the brand, the ticker, and the unit. Leave the setup fee, mint fee at 50 basis points, and redeem fee at 25. Click **Issue the brand**. No wallet.
3. Name a holder and an amount in units. Click **Mint**. Outstanding liability increases. The receipt shows sats paid, the mint fee, and net sats.
4. Enter a reserve in sats and click **Attest the reserve**. The page shows whether that claim covers the outstanding liability.
5. Redeem is blocked, and the page says so, until an attestation exists and the attested reserve covers the outstanding liability. Then **Redeem** shows gross sats, the fee, and net sats.
6. **Record on the public book** asks for the wallet and writes the receipts to `tm_anytx`. Install Desktop appears only if the wallet is missing.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd scrip/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5187.

### Tests

```bash
cd scrip/frontend
npm test
npm run build
```

Setup fee, mint and redeem basis-point floor math, redeem blocked when the reserve is under the liability, attestation updates, encode/decode, MAGIC `scrip` filter, overlay topic is `tm_anytx` even on localhost, first-paint copy (no wallet gate, no Install Desktop until a wallet failure). Deep links use `?s=` not `/s/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `scrip` |
| Protocol ID | `[0, "scrip"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `scrip`) |
| Protocol string | `scrip` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `scrip`) |
| Setup fee | flat sats, recorded on the brand |
| Mint fee | 50 bps default |
| Redeem fee | 25 bps default |
| Record output | 1 sat receipt |

## Layout

```
scrip/
  protocol/          field encode/decode + scrip rules
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
