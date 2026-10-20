# Capture Desk (v0)

A requester posts a capture of one specific place. The reward is locked before anyone films. A contributor sends a watermarked preview. The requester accepts one capture, or takes the full reward back after the deadline.

Raw footage stays with the contributor. Only the hash and the receipt go on chain.

What the script enforces: the escrow output is a PushDrop lock on a real UTXO. The key id is `escrow-<requestId>` and the counterparty is `anyone`, so any reader re-derives the locking key from the requester's public identity key alone and checks it. The request record carries that root identity as `requesterIdentity`. Only the requester wallet can spend the derived key. An accept is one later transaction: it spends that escrow outpoint and pays three outputs — the contributor receives the reward minus the fees, the desk receives 10% of the reward, and the desk receives the fixed processing fee. The same transaction carries the signed accept record. The script does not read the deadline.

What is desk-recorded: the deadline refund. v0 does not enforce it with nLockTime or OP_CHECKLOCKTIMEVERIFY. The same requester key can spend the escrow before the deadline. The app refuses to build a refund until the deadline has passed and no accept is on the book. A refund record counts only when that derived key signed it, the refund time is not before the deadline, and the amount is the full reward. Readers drop a refund that fails those checks.

The request id is `sha256` of the requester identity concatenated with the nonce stored on the request (`sha256(requesterIdentity || nonce)`). Readers recompute that id and drop any request whose id does not match its requester, and they drop that request's submissions, accept, and refund. The canonical request is the one named by `?tx=` when that param is present. Otherwise it is the oldest valid request from the same key, and only from the key pinned by `?p=` when that param is present. Oldest `postedAt` is only a tie-break among records from that key. It is not an order across keys.

The request, the accept, and the refund are signed by the escrow key. A submission is signed by the contributor identity under key id `capture` and counterparty `anyone`. Readers verify every signature and drop unsigned or forged rows and duplicate requests. An accept must name the submission's receipt hash. The payout goes to the contributor key from that signed submission: a BRC-29 child, key id `capture-pay`, counterparty `anyone`. It is not a key typed in beside the receipt.

The fund transaction is broadcast when you Fund. It is not held with `noSend`. Accept and refund are later spends of that outpoint. The app submits the fund, the submission, the accept, and the refund to overlay topic `tm_anytx`.

`DESK_FEE_KEY` is the desk wallet identity: `02c5313bc21f0a61418640c94a23d3cdb09ea50a8a3dd8daababe93f57a5fa0082`. BRC-100 cannot sign a plain P2PKH of that root, so the fee is not paid to the root. The 10% desk fee and the processing fee are each a P2PKH of a BRC-29 child. Protocol `[2, "3241645161d8"]`, key id `capture-fee`, counterparty `anyone`. Anyone can compute that child from `DESK_FEE_KEY`. The desk wallet spends it with the same protocol and key id, `forSelf: true`. Those capture-fee outputs need a manual sweep by the desk wallet (`forSelf`). They do not arrive as an ordinary payment to the root key. Both fee outputs carry `customInstructions` naming that protocol, key id, and counterparty. The contributor payout (`capture-pay`) and the requester refund (`capture-refund`) are the same kind of child of the payee's identity, and each needs the same manual sweep.

The desk fee is `floor(reward × 1000 / 10000)`, which is 10% rounded down. A reward of 10,001 sats yields a desk fee of 1,000 sats. The processing fee is a fixed sat amount on the request (default 1,000). The contributor receives reward − desk fee − processing fee. A refund returns every sat of the reward.

This is not Job Escrow (one hired worker, released when a deliverable hash lands). This is not Bounty (a security report with commit-reveal). This is not Datasets (selling data that already exists). This is not Trace (provenance of a record). This is an open call for a photo or a video of one place, a watermarked preview before the reward moves, a capture receipt, and a full refund after the deadline.

The walkthrough drafts the request in the browser. No wallet on first paint. Browsing the board, opening a request, and filling in the draft all run without a wallet. **Fund**, **Submit**, **Accept**, and **Refund** ask for the wallet. Install Desktop appears only if that wallet is missing.

Message Box at `https://gmb.bsvblockchain.tech` (box `capture`) carries the watermarked preview. The raw file is not a PushDrop field and is not sent in that message. Overlay is the public book.

There is no live 402 endpoint in v0. The page shows an example `curl` an HTTP client would use to post a funded request. It is copy only.

Public UI: `https://sirdeggen.github.io/business-ideas/capture/`

Deep links are query params: `?r=<requestId>&p=<requester>&tx=<txid>`. Board entries, the link after fund, and the share link carry all three. `?tx=` names the canonical fund transaction. `?p=` pins a requester identity key and drops requests from every other key. Do not use a path like `/r/:id` — GitHub Pages 404s those.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on Fund, Submit, Accept, or Refund. Install Desktop appears only if that wallet is missing.

## Stack

- Wallet interface: BRC-100. The app never keeps keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop, and only on Fund, Submit, Accept, or Refund.
- State: the draft is local until you fund. Wallet basket `capture`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `capture`).
- Encoding: PushDrop fields — request (place, brief, reward, deadline, fees), submit (receipt hash, capture time, geohash), accept (receipt hash, payout lines), refund (full reward). No raw file. No preview body.
- Fee: desk fee 1,000 basis points, floored. Processing fee default 1,000 sats.
- Frontend: Vite + React. Wallet via `WalletClient('auto', originator)` from `@bsv/sdk`. Overlay via `@bsv/sdk` `TopicBroadcaster` and lookup.
- Overlay: `https://overlay-us-1.bsvb.tech`.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you fund, submit, accept, or refund
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. No wallet prompt on first paint. The board and the draft are already there.
2. Name the place and the brief. Leave the reward and the processing fee. Set a deadline. The split shows as you type. No wallet.
3. Click **Fund**. The wallet locks the reward and the app broadcasts that transaction to `tm_anytx`.
4. Choose a file, enter a 5-character geohash, and write the watermarked preview. Click **Submit**. The receipt goes on chain. The preview goes over Message Box. The raw file stays on the device.
5. Click **Accept**. One transaction spends the escrow and pays the contributor, the desk fee, and the processing fee.
6. Or, after the deadline, click **Refund**. The full reward goes back. Before the deadline the button stops, and that stop is a desk record.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

### Frontend

```bash
cd capture/frontend
npm ci
npm run dev
```

Vite serves at http://localhost:5191.

### Tests

```bash
cd capture/frontend
npm test
npm run build
```

Encode/decode, fee floor math, refund only after the deadline, forged copied-key request, backdated request, forged accept, payout to the wrong contributor, MAGIC `capture` filter, overlay topic is `tm_anytx` even on localhost, first-paint copy (no wallet gate, no Install Desktop until a wallet failure). Deep links use `?r=` not `/r/`. Catalog stays Server / View. StreamPay and Grant stay Live.

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `capture` |
| Protocol ID | `[0, "capture"]` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `capture`) |
| Protocol string | `capture` |
| Message Box | `https://gmb.bsvblockchain.tech` (box `capture`) |
| Desk fee | 1,000 bps, floored |
| Processing fee | 1,000 sats default |
| Escrow key id | `escrow-<requestId>`, counterparty `anyone` |
| Request id | `sha256(requesterIdentity \|\| nonce)` |
| Contributor signature | key id `capture`, counterparty `anyone` |
| Desk wallet (`DESK_FEE_KEY`) | `02c5313bc21f0a61418640c94a23d3cdb09ea50a8a3dd8daababe93f57a5fa0082` |
| Desk fee output | BRC-29 `[2, "3241645161d8"]`, key id `capture-fee`, counterparty `anyone`, manual sweep (`forSelf`) |
| Contributor payout | BRC-29, key id `capture-pay`, counterparty `anyone`, manual sweep (`forSelf`) |
| Requester refund | BRC-29, key id `capture-refund`, counterparty `anyone`, manual sweep (`forSelf`) |
| Deadline | desk-recorded. Not nLockTime. Not OP_CHECKLOCKTIMEVERIFY |
| Fund | broadcast on Fund. Accept and refund spend that outpoint later |
| Canonical request | `?tx=` if present, otherwise the oldest request from that key |

## Layout

```
capture/
  protocol/          field encode/decode + capture rules
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
