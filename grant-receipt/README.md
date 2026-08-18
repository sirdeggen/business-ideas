# Grant Receipt Desk (v0)

A gift for a purpose. A receipt bound to that purpose.

A church or community-foundation treasurer takes inbound gifts that already
name a purpose (“roof repair”), acknowledges them, and issues a **signed
receipt bound to that purpose hash**. The app never holds keys. It is not a
US donor-advised fund, not a 501(c)(3) shop, and not a tax letter. It is
not the 2-of-3 policy vault in `treasury/`.

## First success

1. Treasurer opens **Desk**, sets a desk name, copies the give link (wallet
   only to mint that link).
2. Donor opens **Give**, keeps or edits the purpose (default `roof repair`),
   enters dollars, sends the gift.
3. Treasurer **Acknowledge**s.
4. Treasurer **Issue receipt**. The donor sees a signed receipt bound to
   the same purpose.

## How to give

1. Open the give link from the treasurer (`?give=1&org=…`), or paste the
   desk identity under Advanced.
2. Purpose is plain language. Default is `roof repair`.
3. Amount is dollars. The live rate is WhatsOnChain, then CoinGecko. There
   is no invented rate. The wallet is asked for the matching amount only at
   send time.
4. Send gift. Approve in the wallet. The desk is notified.

## How to acknowledge and receipt

On **Desk**, incoming gifts show dollars and a purpose (a name if we have
one). Acknowledge, then issue the receipt. Identity hex sits under
Advanced.

## Purpose hash

Canonical purpose = the typed purpose with **only** leading and trailing
whitespace removed (`String#trim`). No case folding, no Unicode
normalization, no collapsed spaces.

```
purposeHash = lowercase hex(SHA-256(UTF-8 bytes of that exact string))
```

Default purpose is the eleven characters `roof repair`:

```
2b4ad31adad0c899a981c3cfbcdb38e41048a16be77681644faa712e8f0174cc
```

The receipt is canonical JSON with a fixed key order:

```
{ v, purpose, purposeHash, amountUsd, amountSats, donorIdentityKey, orgIdentityKey, giftTxid, at }
```

The treasurer’s wallet signs those bytes. The donor checks that
`purposeHash` matches the purpose and that the signature verifies.

## Message Box

Two-party path (required for first success):

| Thing | Value |
| --- | --- |
| Host | `https://gmb.bsvblockchain.tech` |
| Box name | `grant receipt` |
| Messages | gift notice → ack → signed receipt |

The gift notice carries purpose, purpose hash, dollars, the matching send
amount, donor identity, and the gift transaction if the wallet returned it.

## Public receipt (optional)

If it is cheap, the desk also publishes a small on-chain announcement so a
stranger can open `?receipt=<txid>` without a wallet. Client-side filter
tag is `grant receipt` on the public any-transaction list at overlay-us-1.
That list is optional and can be flaky; last-good copies stay in the
browser. First success does **not** need it. Gift, ack, and the signed
receipt travel on Message Box.

## How to run

Frontend only. No Docker for first success.

```bash
cd grant-receipt
npm i
npm run dev
```

Vite `base` is `./`, so `npm run build` is Pages-ready. Tests:

```bash
cd grant-receipt
npm test
```

Wallet via BRC-100 `WalletClient` / `@bsv/simple/browser` `createWallet()`.
The app never holds keys.

A shared funded Desktop used by humans later has identity `02c5313b…fa0082`.
This tree does not bake private keys.

## Honest blockers

- A wallet is required to **send**, **acknowledge**, and **issue** a
  receipt. The desk page itself explains the job first; it does not lead
  with a dead connect button.
- Incoming gifts on the desk appear after the treasurer opens a wallet
  (Message Box).
- The public receipt link is optional. If that list is down, the donor
  still gets the signed receipt in their inbox.
- Dollar conversion needs WhatsOnChain or CoinGecko. No invented rate.
- This receipt is not a tax document.

## Layout

```
grant-receipt/
  src/lib/     purpose hash, receipt, state machine, Message Box, optional public list
  src/         Give + Desk on one static app
```

Open BSV License, matching the rest of this repo.
