# Bounty Desk (v0)

A project funds a severity-tiered bug bounty pool. A researcher pays a small anti-spam fee and posts a hash of the report, which proves priority without revealing the bug. The full report goes privately over Message Box. A triage verdict releases the matching tier. The desk keeps an append-only disclosure timeline (received, acknowledged, fixed, disclosed) that can be exported as a record of CRA-style 24h / 72h / 14-day clocks.

The report body never goes on-chain. Only its hash does.

What the script enforces: the pool output is a locking script only the project key can spend. When you record a verdict, that spend pays the researcher the tier minus the desk fee. The withheld fee stays in the project lock with the unreleased tiers. The script does not read the severity label.

What is desk-state: which tier matches the report, hash priority, and the disclosure timeline. The export is a record of those timestamps. It is not legal compliance advice.

v0 records the per-submission fee and the export fee on the receipt. It does not collect them into a platform key. The payout fee is a percentage of the tier, priced under 10% (default 800 basis points, which is 8%). `floor(tier × bps / 10000)`.

This is not Job Escrow (one hired job, released when a deliverable hash lands). This is not Grants (a purpose-bound gift). This is not Cover (an insurance claim). This is not Vouch (a staked attestation). This is a tiered pool, a hash before the report, and a disclosure clock.

The walkthrough stores the pool in the browser. No wallet on first paint. Fund, post the hash, release a tier, append the timeline, and export all run locally. **Record on the public book** is last: after `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at the public overlay. The desk queries `ls_anytx` and keeps only this app’s PushDrop fields (MAGIC `bounty`).

Message Box at `https://gmb.bsvblockchain.tech` (box `bounty`) carries the report body when you record and a counterparty key is set. Overlay is the public book. The body is not a PushDrop field.

Public UI: `https://sirdeggen.github.io/business-ideas/bounty/`

Deep links are query params: `?b=<bountyId>&tx=<txid>`. Do not use a path like `/b/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Record on the public book**. Install Desktop appears only if that wallet is missing.

## Stack

- Wallet interface: BRC-100. The app never keeps keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop, and only when recording.
- State: the pool, the hash, the verdict, and the timeline are a local walkthrough until you record. Wallet basket `bounty`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `bounty`).
- Encoding: PushDrop fields — fund (project, scope, tier amounts, fees), submit (researcher, report hash, submission fee), verdict (tier, fee, researcher sats), timeline (stage, time). No report body.
- Fee: payout fee default 800 basis points, hard cap 999 (under 10%). Submission fee default 1,000 sats. Export fee default 2,500 sats.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you record
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Name the project and the scope. Leave the tier amounts, the payout fee at 800 basis points, the submission fee, and the export fee. Click **Fund the pool**. No wallet.
3. Name the researcher and write the report. Click **Post the hash**. The page shows the hash. The body is not on-chain. Copy it into Message Box.
4. Pick a tier and click **Release this tier**. The page shows the desk fee, the researcher sats, and what stays locked.
5. Append the timeline in order: **Acknowledge**, **Mark fixed**, **Disclose**.
6. Click **Export the timeline**. The record shows the 24h, 72h, and 14-day clocks. It says it is not legal compliance advice.
7. **Record on the public book** asks for the wallet, locks the remaining pool, and posts the hash. Add the researcher key under Advanced before recording a release. Install Desktop appears only if the wallet is missing.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd bounty/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5188.

### Tests

```bash
cd bounty/frontend
npm test
npm run build
```

Encode/decode, tier release math, fee math under 10%, timeline append-only ordering, export format, MAGIC `bounty` filter, overlay topic is `tm_anytx` even on localhost, first-paint copy (no wallet gate, no Install Desktop until a wallet failure). Deep links use `?b=` not `/b/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `bounty` |
| Protocol ID | `[0, "bounty"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `bounty`) |
| Protocol string | `bounty` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `bounty`) |
| Payout fee | 800 bps default, max 999 |
| Submission fee | 1,000 sats default |
| Export fee | 2,500 sats default |
| Pool lock | remaining tiers plus withheld fee |

## Layout

```
bounty/
  protocol/          field encode/decode + bounty rules
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
