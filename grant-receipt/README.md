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

Incoming gifts on **Desk** list without a wallet. Overlay-us-1 is the
stranger path. Acknowledge, issue receipt, and copy give link still ask
for a wallet (the give link needs the org identity).

## How to give

1. Open the give link from the treasurer (`?give=1&org=…`), or paste the
   desk identity under Advanced.
2. Purpose is plain language. Default is `roof repair`.
3. Amount is dollars. The live rate is WhatsOnChain, then CoinGecko. There
   is no invented rate. The wallet is asked for the matching amount only at
   send time.
4. Send gift. Approve in the wallet. Message Box notifies the desk first.
   A 1-sat PushDrop gift announcement is also published on overlay-us-1
   so a stranger desk can see the gift.

## How to acknowledge and receipt

On **Desk**, incoming gifts show dollars and a purpose (a name if we have
one) with no wallet open. Acknowledge, then issue the receipt — those two
buttons ask for a wallet. Identity hex sits under Advanced.

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

Two-party path for ack and the signed receipt (and the first-success gift
notice):

| Thing | Value |
| --- | --- |
| Host | `https://gmb.bsvblockchain.tech` |
| Box name | `grant receipt` |
| Messages | gift notice → ack → signed receipt |

The gift notice carries purpose, purpose hash, dollars, the matching send
amount, donor identity, and the gift transaction if the wallet returned it.

## Public list (overlay-us-1)

Host `https://overlay-us-1.bsvb.tech`. Topic `tm_anytx`, lookup `ls_anytx`.
Client-side filter tag is `grant receipt`. Do not invent another topic.

Gift announcements are a 1-sat PushDrop: fields
`[grant receipt, gift, giftJson]`. Receipt announcements stay
`[grant receipt, receiptJson, signature, signingKey]`. The `gift` kind
discriminator means a gift output is never parsed as a receipt.

The desk lists gifts from that public index with no wallet. `ls_anytx` is
flaky — last-good incoming gifts stay in localStorage, and a failed lookup
is surfaced instead of pretending the desk is empty. If the desk URL or
give-link carries `?org=`, the list is filtered to that org; with no org
key yet, every protocol-tagged gift is listed rather than an empty
stranger desk.

The public receipt link (`?receipt=<txid>`) is still optional. First
success for ack and the signed receipt travels on Message Box.

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
  receipt. Copy give link also needs the org identity. The desk page
  itself lists incoming gifts without a wallet.
- The public gift list can blink. Last-good stays in the browser; a failed
  lookup is not shown as an empty desk.
- The public receipt link is optional. If that list is down, the donor
  still gets the signed receipt in their inbox.
- Dollar conversion needs WhatsOnChain or CoinGecko. No invented rate.
- This receipt is not a tax document.

## Layout

```
grant-receipt/
  src/lib/     purpose hash, receipt, state machine, Message Box, public list
  src/         Give + Desk on one static app
```

Open BSV License, matching the rest of this repo.
