# BSV business ideas

First versions of BSV product ideas, shipped fast.

Switcher on GitHub Pages: https://sirdeggen.github.io/business-ideas/

Six v0s share this repo. The Pages site is a static catalog: tickets and the receivable desk are live there; invoices, treasury, and the 402 apps are servers (run locally / Docker, later on a cluster).

## Event tickets (live)

Tickets as BSV UTXOs: mint into a BRC-100 basket, hold/show a QR, transfer by spend, redeem at the door.

- Demo: https://sirdeggen.github.io/business-ideas/tickets/
- How to run overlay + frontend: [event-tickets/README.md](./event-tickets/README.md)

## Receivable desk (live)

Public invoice registry (who is owed, by whom, amount, due, status). Advance 70% is a stub. BSV only. Not a bank.

- Demo: https://sirdeggen.github.io/business-ideas/receivables/
- Overlay is localhost. Settle does not work from GitHub Pages until you run `cd receivable-desk && docker compose up --build` (overlay :8082, UI :5175).
- How to run overlay + frontend: [receivable-desk/README.md](./receivable-desk/README.md)

## 402 publisher (coming / run via Docker)

Pay-per-crawl Ghost-class page. HTTP 402 invoice in sats for readers and crawlers. Express server — not a static Pages app.

- Repo: [402-publisher/](./402-publisher/)
- How to run: [402-publisher/README.md](./402-publisher/README.md)
- Live cluster path will be `/402-publisher`

## 402 MCP (coming / run via Docker)

Paid MCP tools in sats. Payment is the credential — no signup, no API key. Express / MCP server — not a static Pages app.

- Repo: [402-mcp/](./402-mcp/)
- How to run: [402-mcp/README.md](./402-mcp/README.md)
- Live cluster path will be `/402-mcp`

## Invoices (coming / run via Docker)

Payable invoices on BSV. Payee creates a PushDrop UTXO; payer settles with BRC-29. Overlay is the audit trail. Local Docker, not a Pages demo.

- Repo: [invoices/](./invoices/)
- How to run: `cd invoices && docker compose up --build` — overlay :8081, UI :5174 — [invoices/README.md](./invoices/README.md)
- Live cluster path will be `/invoices`

## Treasury (PR / run via Docker)

Grassroots BSV treasury, 2-of-3 (BRC-47 P2MS). Create, invite signers, fund, propose, approve, export CSV. Not an EVM Safe, not a custodian.

- Open PR: https://github.com/sirdeggen/business-ideas/pull/7 (`treasury/` is not on main yet)
- How to run: `cd treasury && docker compose up --build` — feed :8080, UI :5173 — [treasury/README.md](https://github.com/sirdeggen/business-ideas/blob/cursor/bsv-policy-treasury-5b3a/treasury/README.md)
