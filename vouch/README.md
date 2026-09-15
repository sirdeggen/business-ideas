# Vouch Desk (v0)

Stake a slashable vouch. Attest. Slash on bad faith.

A local org or finance team onboards a supplier with a slashable bond from a known party. A stranger looks the vouch up with no wallet. A paid attestation records what was checked. The voucher or a designated slasher can slash on proven bad faith while the bond is live. Optional release returns the bond.

This is **not** a name lease (Names), **not** a titled document (Titles), **not** a timed key (Memberships), **not** a provenance receipt (Trace), and **not** a reputation trading market.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The page queries `ls_anytx` via a raw `/lookup` POST so a stranger never waits on a wallet, then keeps only this app’s PushDrop fields (MAGIC `vouch`). Wallet is asked only on **Vouch**, **Attest**, **Slash**, and **Release**.

Public UI: `https://sirdeggen.github.io/business-ideas/vouch/`

Shareable links are query params: `?v=a1b2c3d4e5f67890`. Do not use a path route for the id — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet.

## First success

1. A stranger opens `/vouch/` with no wallet and looks up a vouch or attestation (empty / not found / a live bond).
2. Vouch: label, supplier, bond. Pay the small write fee with `createAction`. Overlay publishes the vouch.
3. Attest: what was checked. Pay the write fee. Overlay posts the attestation receipt.
4. Slash on proven bad faith while the bond is live, or **Release** to unwind.
5. Share `?v=`.

## Pricing

A small fixed write fee on **Vouch** and **Attest**. The bond is separate and slashable. Dollars on the face when a live BSV rate is available; sats on `createAction` and under Advanced.

| Thing | Value |
| --- | ---: |
| `FEE_SATS` | 100,000 |
| Default bond | 1,000,000 |

v0 has no protocol treasury — the write fee is locked as a payment output on the same `createAction` as the bond or attestation token.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `listOutputs`, and `signAction` via the visitor’s Desktop.
- Identity: 66-hex compressed pubkey. The supplier name sits on the face; keys stay under Advanced.
- State: wallet basket `vouch`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered). No custom overlay topic.
- Encoding: PushDrop fields — vouch (label, subject, voucher, slasher, bond, write fee), attest, slash, release. MAGIC `vouch`.
- Payment: `FEE_SATS` payment output on vouch and attest, plus the bond UTXO or a 1-sat attestation token.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and `LookupResolver`.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box at `https://gmb.bsvblockchain.tech` is an optional nudge only.
- Last-good cache: if `ls_anytx` fails or returns empty, the desk keeps the last vouch it already saw.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to run

1. Open the UI. No wallet prompt on first paint. Overlay list and look up load without a wallet.
2. Type a vouch id or a supplier. Click **Look up**. Empty, not found, or a vouch.
3. Fill label, supplier, and a bond. Click **Vouch**. Approve Desktop.
4. Attest what was checked. Approve Desktop.
5. Slash on proven bad faith, or **Release**. Share `?v=`.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd vouch/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5183.

### Tests

```bash
cd vouch/frontend
npm test
npm run build
```

Encode/parse, live bond helpers, MAGIC filter, first-paint copy. No live overlay required.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `vouch` |
| Protocol ID | `[0, "vouch"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `vouch`) |
| Protocol string | `vouch` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `vouch`, optional) |

## Layout

```
vouch/
  protocol/          field encode/decode + live bond
  frontend/          GitHub Pages static app
```
