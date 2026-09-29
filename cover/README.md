# Cover Desk (v0)

Buy cover. Get a policy record. File a claim that releases only when the right people agree.

A cover desk for clubs, co-ops, event hosts, and small enterprises that want cover against one operational risk: contract failure, event cancellation, or contractor default. The buyer sees a premium quote and a labeled premium cut, pays that premium, and gets a policy record. A claim carries an evidence hash. Named approvers each agree. When enough of them have agreed, the claim shows Released, with the payout amount and a labeled claim-admin fee.

## Distinct from Vouch / Credit / Grants

This is not Vouch (a slashable trust bond). Not Credit (a loan against an invoice or receivable). Not Grants (a gift for a purpose). Not Job Escrow (labor funds locked until a deliverable hash). Not Vault Claim (burn a claim to redeem a vaulted item). Those desks stay what they are. This one sells cover and records a claim.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx` via a raw `/lookup` POST (then `LookupResolver` if that fails), then keeps only this app’s PushDrop fields (MAGIC `cover`). No custom topic.

Public UI: `https://sirdeggen.github.io/business-ideas/cover/`

Deep links are query params: `?p=<policyId>&tx=<txid>`. Do not use a path like `/p/:id` — GitHub Pages 404s those.

Catalog: **Server** + **View**. Not Live. Live remains StreamPay and Grant receipt.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Buy cover**, **File claim**, **Approve**, and **Release**. The quote, the business case, and a `?p=` reading work with no wallet.

## What is on-chain vs attested

Real satoshi payments, via `createAction`, labeled in the wallet approval:

- **Premium.** The full premium is paid to the desk key. It is split into two outputs so nothing is skimmed: a **premium cut** (the desk fee, 10% of the premium) and the rest of the premium. Both are labeled.
- **Claim-admin fee.** 500 sats, paid to the desk key when a claim is released. The output is labeled **Claim-admin fee**.

Overlay records only (a policy sheet, not custody of the insured amount):

- The policy: kind, subject, insured amount, term, premium, premium cut, three approver keys, and how many must agree.
- The claim: a sha256 evidence hash of text or a file the filer picked. The note is trimmed before it is hashed. The file is not uploaded. The holder signs the claim with their cover key.
- Each approval, signed by that approver’s cover key. Unsigned or badly signed approvals are ignored, and each approver key counts once.
- The release, once quorum is met, signed by an approver who already agreed. It records the payout amount and the claim-admin fee. The fee output is labeled. Reading the record does not prove the fee was paid.

v0 does **not** lock a capital pool and does **not** pay the insured amount. Job Escrow can pay a provider because the client locked that exact sum. This desk does not lock the insured sum, so the payout figure on a Released claim is attested, not settled. The money that actually moves is the premium and the claim-admin fee.

## First success

1. Open `/cover/` with no wallet. Read the business case. The quote for a spring-fair policy is already on the page, with Premium and Premium cut labeled.
2. Name three approver keys (2 of 3). Click **Buy cover**. Approve Desktop. The premium cut is its own output.
3. Share `?p=<policyId>&tx=<txid>`.
4. A stranger opens that link and clicks **Export reading**. No wallet.
5. The holder **File claim** with a note or a file. Only the hash is stored.
6. Two approvers **Approve**. Message Box (`cover`) can nudge them; the overlay is the book.
7. **Release**. The page says Released and shows the payout amount. The claim-admin fee is labeled and recorded. The page does not prove that fee was paid.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, and `signAction` via the visitor’s Desktop (`WalletClient('auto', originator())`, originator = page hostname).
- Identity: 66-hex compressed pubkey. The buyer is the holder. Approver keys and an optional desk key sit on the form; hex stays readable, not as the pitch.
- State: wallet basket `cover`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `cover`).
- Encoding: PushDrop fields — policy, claim, approval, release.
- Payment: premium (premium cut + remainder) on buy, claim-admin fee on release. Satoshis only. No other chain.
- Evidence: sha256 of pasted text (trimmed first) or of a local file. Nothing is uploaded.
- Signatures: claims, approvals, and releases are BRC-100 `createSignature` over canonical bytes (`protocolID [0, "cover"]`, `keyID` `cover`, `counterparty` `self`). Read-side checks use the same SHA-256-then-ECDSA verify as the treasury desk. The cover key is not the wallet’s payment identity. Approver fields must be those cover keys. The desk key still defaults to the buyer’s payment key and only receives fees. It cannot release.
- Frontend: Vite + React. Overlay via `@bsv/sdk` `TopicBroadcaster` and a raw `/lookup` POST.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `cover`) delivers policy, claim, approval, and release notices. Overlay is the public book.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded)
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. The quote loads with no wallet prompt.
2. Pick a cover kind, insured amount, and term. Read Premium and Premium cut.
3. Name three approvers. Click **Buy cover**. Approve Desktop.
4. Share `?p=<policyId>&tx=<txid>`.
5. Stranger: read the policy and **Export reading**. No wallet.
6. Holder: **File claim**.
7. Approvers: **Approve** until quorum, then **Release**.

```bash
cd cover/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5186.

### Tests

```bash
cd cover/frontend
npm test
npm run typecheck
npm run build
```

Protocol encode/decode and admission (quote, quorum, evidence hash), overlay topic `tm_anytx` even on localhost, wallet-missing is not overlay/network/decline, first-paint copy, stranger export.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `cover` |
| Protocol ID | `[0, "cover"]` |
| MAGIC | `cover` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to cover MAGIC) |
| Message Box | `https://gmb.bsvblockchain.tech` (box `cover`) |
| Cover kinds | `contract` (200 bps), `event` (300 bps), `contractor` (250 bps), per 30 days of the insured amount |
| Minimum premium | 100 sats |
| Premium cut | 10% of the premium, labeled, at least 1 sat |
| Claim-admin fee | 500 sats, labeled, paid on release |
| Approvers | 3 named cover keys. Quorum is 2 or 3. The holder cannot be an approver. |
| Signatures | cover key (`keyID` `cover`). Claims, approvals, and releases. |
| Policy id | first 32 hex chars of sha256 of the policy body. A different body cannot reuse it. |
| Policy link | `?p=<policyId>` |

Quote for event cover, 100,000 sats insured, 30 days: premium 3,000 sats, premium cut 300 sats.

## Layout

```
cover/
  protocol/          field encode/decode, quote, quorum admission
  frontend/          GitHub Pages static app
```
