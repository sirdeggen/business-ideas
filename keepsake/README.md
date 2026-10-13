# Keepsake Desk (v0)

An org mints a limited, numbered digital keepsake. A volunteer award, a service year, an opening night, a donor thank-you. It sends one piece to a person's identity key. The holder can keep it, show it on a public profile, give it on, or resell it.

The edition size is fixed when the org opens it. Minting stops when that count is full. There are no packs and no random upgrades.

The mint fee is a flat amount in sats per piece. On a resale, the issuer royalty and the desk cut are basis points of the price (`floor(price × bps / 10000)`). The desk cut stays under 5% (0–499 basis points; default 200, which is 2%). The issuer royalty defaults to 500 (5%) and is capped at 2,000. A gift has no price, so the royalty on that transfer is zero.

v0 computes and records that split. It does not enforce the royalty or the desk cut in script. If a piece lock is kept, it is the holder pubkey and `OP_CHECKSIG` only. `OP_PUSH_TX` output enforcement is v1. v1: send, gift, show, and resale records get signed by the current holder. Who holds the piece, the profile flag, and Message Box delivery are desk state until you record. v0 does not move the sale sats. The public book is the overlay record of the fixed edition. A mint counts only when the issuer key signed it, the serial is inside the edition size, and it is the first signed record for that serial. MAGIC is `keepsake`.

This is not Grants (a purpose-bound gift of money). This is not Memberships (a timed access key). This is not Tickets (admission spent at the door). This is not Vault Claim (a claim on a vaulted item). This is not Raffle (a random draw). This is not Names (a username). One numbered keepsake from a fixed edition, with an issuer royalty on resale.

The walkthrough stores the edition in the browser. No wallet on first paint. Open, mint, send, gift, show, and resell all run locally. **Record on the public book** is last: after `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at the public overlay. The desk queries `ls_anytx` and keeps only this app’s PushDrop fields (MAGIC `keepsake`). The record output is a 1-sat receipt. It does not move the mint fee or the resale sats.

Message Box at `https://gmb.bsvblockchain.tech` (box `keepsake`) delivers the send, gift, or resale note when the receipt is recorded. Overlay is the public book.

Public UI: `https://sirdeggen.github.io/business-ideas/keepsake/`

Deep links are query params: `?k=<keepsakeId>&tx=<txid>`. Do not use a path like `/k/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Record on the public book**.

## Stack

- Wallet interface: BRC-100. The app never keeps keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop, and only when recording.
- State: the edition, mints, sends, gifts, profile marks, and resales are a local walkthrough until you record. Wallet basket `keepsake`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `keepsake`).
- Encoding: PushDrop fields — edition (org, title, size, mint fee, royalty, desk cut, issuer key), mint (serial, issuer signature), send (recipient key), gift, profile mark, resale (price, royalty sats, desk sats, seller sats, holder lock).
- Royalty: the desk computes and records `floor(price × bps / 10000)` for the issuer royalty and the desk cut. v0 does not check that split in script. The piece lock is `OP_CHECKSIG` for the holder. `OP_PUSH_TX` output enforcement is v1. v1: send, gift, show, and resale records get signed by the current holder.
- Fee: mint fee in sats per piece (default 1,000). Desk cut default 200 basis points, under 5%. Issuer royalty default 500 basis points.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you record
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint.
2. Name the org and the keepsake. Leave the edition at 500, the mint fee at 1,000 sats, the issuer royalty at 500 basis points, and the desk cut at 200. Click **Open the edition**. No wallet.
3. Click **Mint the next piece**. The page shows `#1/500` and the remaining count.
4. Send it to a recipient identity key. The sample key is filled in. Click **Send**. Message Box delivery waits until you record.
5. The holder view shows the numbered piece. **Show on a profile** marks it for the public book. That flag stays in the browser until you record.
6. Leave the price at 10,000 sats and click **Resell**. The page shows the issuer royalty, the desk cut, and what the seller receives. The desk recorded that split. The sale sats are not moved.
7. **Record on the public book** asks for the wallet and writes the edition to `tm_anytx`. Install Desktop appears only if the wallet is missing.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd keepsake/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5188.

### Tests

```bash
cd keepsake/frontend
npm test
npm run build
```

Encode/decode, royalty and desk-cut floor math, edition cap, MAGIC `keepsake` filter, overlay topic is `tm_anytx` even on localhost, first-paint copy (no wallet gate, no Install Desktop until a wallet failure). Deep links use `?k=` not `/k/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `keepsake` |
| Protocol ID | `[0, "keepsake"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `keepsake`) |
| Protocol string | `keepsake` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `keepsake`) |
| Mint fee | 1,000 sats per piece default |
| Desk cut | 200 bps default, max 499 |
| Issuer royalty | 500 bps default, max 2,000 |
| Record output | 1 sat receipt |

## Layout

```
keepsake/
  protocol/          field encode/decode, holder OP_CHECKSIG, edition rules
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
