# Private Pay Desk (v0)

Confidential payments for payroll and suppliers. An auditor sees only the view they were granted.

A payer seals an amount and a line note to the payee. The public record shows the payment id, the time, the fee, a counterparty key id, and whether a view was granted. The payee attests receipt. The payer can grant an auditor a scoped view, and can revoke that view. The fee is 25 basis points of the sealed amount, plus 250 sats when a view is granted.

## Distinct from Spend Policy / Treasury

This is not Spend Policy (rules on what a key can spend). Not Treasury (org money and a multi-sig feed). Those desks stay what they are. This one seals a business payment and lets the payer open a scoped view for an auditor.

Pages defaults to the public overlay: `https://overlay-us-1.bsvb.tech`, topic `tm_anytx`, lookup `ls_anytx`. After `createAction`, the app broadcasts with `@bsv/sdk` `TopicBroadcaster(['tm_anytx'])` pointed at that host. The desk queries `ls_anytx` via a raw `/lookup` POST (then `LookupResolver` if that fails), then keeps only this app’s PushDrop fields (MAGIC `private-pay`). No custom topic.

Public UI: `https://sirdeggen.github.io/business-ideas/private-pay/`

Deep links are query params: `?p=<paymentId>&tx=<txid>`. Do not use a path like `/p/:id` — GitHub Pages 404s those.

Catalog: **Server** + **View**. Not Live. Live remains StreamPay and Grant receipt.

Chrome hides BSV Desktop until you Allow “sirdeggen.github.io wants to Access other apps and services on this device,” then Retry with Desktop unlocked. Use the shared funded Desktop. Do not create a new wallet. Wallet is only asked on **Pay**, **Attest**, **Grant view**, **Revoke view**, and **Open view**. The quote, the business case, the list, and a stranger export work with no wallet.

## What a stranger can read

Without a view key, a stranger can read:

- payment id, run name, counterparty key id
- when it was paid, and the fee in sats
- whether the payee attested
- whether a view was granted, and whether that view is still open

A stranger cannot read the amount or the line note. Those bytes are sealed to the payee’s identity key. An auditor gets a second seal only after a grant, and only until it expires or the payer revokes it.

The public fee is 25 basis points of the amount, rounded down, and at least 1 sat. A reader who knows that rate can estimate the amount to within 400 sats. v0 does not hide that band. The exact amount and the line note stay sealed. This is selective disclosure. There is no pooled set of payments.

Revoke stops this desk from opening the grant. The sealed bytes remain on the overlay. Someone who already opened the view still has the figure.

## What is paid vs attested

Real satoshi payments, via `createAction`, labeled in the wallet approval:

- **Payment fee.** `floor(amount × 25 / 10000)` sats, at least 1. Paid to the desk key. The output is labeled **Payment fee**.
- **Audit-view grant fee.** 250 sats, paid to the desk key when a view is granted. The output is labeled **Audit-view grant fee**.

The sealed amount is not a visible output. A visible output of that size would publish the payroll or supplier figure. v0 collects the fee. It does not settle the sealed amount.

Overlay records (PushDrop):

- The payment: run name, payer and payee keys, counterparty key id, sealed amount, fee, time, signed by the payer’s private-pay key.
- The payee attestation, signed by the payee signing key named on the payment. Renaming the signer fails verification.
- The view grant: auditor identity, scope `amount`, expiry, a second seal of the amount for that auditor, the 250 sat fee, signed by the payer.
- An optional revoke, signed by the payer.

Reading the record shows the fee figure. The labeled output is in the same transaction. v0 does not add a separate proof that the fee output was paid beyond that transaction.

## First success

1. Open `/private-pay/` with no wallet. Read the business case. The quote for a 400,000 sat October payroll is already on the page: payment fee 1,000 sats, audit-view grant fee 250 sats.
2. Leave the payee keys blank to pay this wallet, or paste the payee identity key and signing key. Click **Pay**. Approve Desktop. The payment fee is its own output. The amount is sealed.
3. Share `?p=<paymentId>&tx=<txid>`.
4. A stranger opens that link and clicks **Export reading**. No wallet. The file has no amount.
5. The payee **Attest**. The attestation is bound to that payment id.
6. The payer **Grant view** to an auditor identity key. The audit-view grant fee is labeled.
7. The auditor **Open view** and sees the amount and the line note. **Revoke view** closes it for that auditor.

## Stack

- Wallet interface: BRC-100. The app never holds keys. It calls `createAction`, `getPublicKey`, `createSignature`, `encrypt`, and `decrypt` via the visitor’s Desktop (`WalletClient('auto', originator())`, originator = page hostname).
- Identity: 66-hex compressed keys. The amount is sealed to identity keys (BRC-42 `encrypt` / `decrypt`, protocol `[0, "privatepay"]`, key id = the per-payment counterparty key id). Signatures use the derived key `privatepay` with counterparty `self`. BRC-42 protocol names allow only letters, numbers, and spaces, so the wallet protocol id is `privatepay`. MAGIC, the basket, and Message Box stay `private-pay`.
- State: wallet basket `private-pay`. Public Pages uses overlay topic `tm_anytx` / lookup `ls_anytx` (client-filtered on MAGIC `private-pay`).
- Encoding: PushDrop fields — payment, attest, grant, revoke.
- Payment: payment fee on pay, audit-view grant fee on grant. Satoshis only. No other chain.
- Signatures: BRC-100 `createSignature` over canonical bytes. Read-side checks use the same SHA-256-then-ECDSA verify as the treasury desk. An attestation verifies against the payee signing key committed on the payment. A grant and a revoke verify against the payer signing key committed on the payment. Renaming a signer field fails.
- Frontend: Vite + React. Overlay via `@bsv/sdk` `TopicBroadcaster` and a raw `/lookup` POST.
- Overlay: `https://overlay-us-1.bsvb.tech`. Message Box: `https://gmb.bsvblockchain.tech` (box `private-pay`) can nudge the payee, the payer, or the auditor. Overlay is the public book.

## Prerequisites

- [BSV Desktop](https://github.com/bsv-blockchain/bsv-desktop) (shared, funded) only if you pay, attest, grant, revoke, or open a view
- Node 22+ for local frontend and tests

## How to try

1. Open the UI. The quote loads with no wallet prompt.
2. Leave the amount at 400,000 sats. Read Payment fee (1,000 sats) and Audit-view grant fee (250 sats).
3. Leave the payee blank, or paste both payee keys. Click **Pay**. Approve Desktop.
4. Share `?p=<paymentId>&tx=<txid>`.
5. Stranger: read the payment and **Export reading**. No wallet. The amount is sealed.
6. Payee: **Attest**.
7. Payer: paste an auditor identity key and **Grant view**.
8. Auditor: **Open view**. Payer: **Revoke view**. The desk stops opening that grant.

```bash
cd private-pay/frontend
npm install
npm run dev
```

Vite serves at http://localhost:5187.

### Tests

```bash
cd private-pay/frontend
npm test
npm run typecheck
npm run build
```

Protocol encode/decode, fee quote, sealed amount roundtrip, renamed signer rejected, overlay topic `tm_anytx` even on localhost, wallet-missing is not overlay/network/decline, first-paint copy, stranger export has no amount.

## Public overlay

| Path | Host | Broadcast | Lookup |
| --- | --- | --- | --- |
| Pages / default | `https://overlay-us-1.bsvb.tech` | `tm_anytx` | `ls_anytx` + client filter |

## Protocol constants

| Thing | Value |
| --- | --- |
| Basket | `private-pay` |
| MAGIC | `private-pay` |
| Protocol ID | `[0, "privatepay"]` |
| Signing key id | `privatepay` |
| Topic (public / Pages) | `tm_anytx` |
| Lookup (public / Pages) | `ls_anytx` (filter to `private-pay`) |
| Message Box | `https://gmb.bsvblockchain.tech` (box `private-pay`) |
| Payment fee | 25 bps of the sealed amount, at least 1 sat, labeled |
| Audit-view grant fee | 250 sats, labeled, paid when a view is granted |
| Scope | `amount` |
| Default grant length | 90 days |
| Payment link | `?p=<paymentId>` |

Quote for 400,000 sats: payment fee 1,000 sats. A later view grant adds 250 sats.

## Layout

```
private-pay/
  protocol/          field encode/decode, fee, seal, signatures
  frontend/          GitHub Pages static app
```

## License

Open BSV License, matching the BSV ts-stack.
