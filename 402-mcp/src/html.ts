import { PRICE_SATS } from './config.js'

const styles = `
:root {
  color-scheme: light;
  --paper: #f7f5f2;
  --sheet: #fffcf8;
  --ink: #1a1916;
  --title: #1b5e3b;
  --muted: #5c5a56;
  --rule: #e4e1db;
  --navy: #1f3a5f;
  --chip: #1b5e3b;
  --shadow: 0 2px 4px rgba(26, 25, 22, 0.04);
  --sans: ui-sans-serif, system-ui, sans-serif;
  --serif: "Source Serif 4", "Iowan Old Style", Georgia, "Times New Roman", serif;
  --mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  min-height: 100%;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--serif);
  font-size: 16px;
  line-height: 1.45;
}
.app {
  max-width: 600px;
  margin: 0 auto;
  padding: 28px 16px 64px;
}
.sheet {
  background: var(--sheet);
  border: 1px solid var(--rule);
  border-radius: 6px;
  box-shadow: var(--shadow);
  padding: 32px 32px 28px;
}
.sheet-head { margin-bottom: 28px; }
.product-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 8px;
  font-family: var(--mono);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--title);
}
.chip {
  flex: 0 0 10px;
  width: 10px;
  height: 10px;
  background: var(--chip);
}
h1 {
  font-size: 22px;
  line-height: 1.25;
  margin: 0;
  font-weight: 560;
}
.lede {
  color: var(--muted);
  max-width: 46ch;
  margin: 8px 0 0;
  font-size: 16px;
}
.business-case {
  margin: 0 0 28px;
  padding: 16px 18px 14px;
  border: 1px solid var(--rule);
  border-left: 3px solid var(--title);
  border-radius: 6px;
  background: #f6f3ee;
}
.business-case > h2 {
  font-family: var(--sans);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.01em;
  color: var(--title);
  margin: 0 0 12px;
}
.business-case dl { margin: 0; }
.business-case .field { margin-bottom: 12px; }
.business-case .field:last-child { margin-bottom: 0; }
.business-case dt {
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 0 0 4px;
}
.business-case dd {
  margin: 0;
  font-size: 15px;
  line-height: 1.45;
  color: var(--ink);
}
.business-case dd p { margin: 0; }
.business-case ul {
  margin: 0;
  padding-left: 1.15em;
}
.business-case li + li { margin-top: 6px; }
.desk {
  padding-top: 20px;
  border-top: 1px solid var(--rule);
}
.desk p { margin: 0 0 10px; }
.desk p:last-child { margin-bottom: 0; }
.desk .endpoint {
  font-family: var(--mono);
  font-size: 14px;
}
`

export function businessCaseSection(): string {
  return `
<section class="business-case" aria-labelledby="business-case-heading">
  <h2 id="business-case-heading">Business case</h2>
  <dl>
    <div class="field">
      <dt>Why it exists</dt>
      <dd>Agents and tools need pay-per-call access without signing up for API keys or monthly seats. Payment on the tool call closes the loop: pay → unlock → useful result — payment is the credential.</dd>
    </div>
    <div class="field">
      <dt>Who pays</dt>
      <dd>Tool hosts who want a take rate on usage (enterprise AI ops and indie MCP authors). Buyers are agent builders and teams whose agents call paid tools — not humans filling a checkout form.</dd>
    </div>
    <div class="field">
      <dt>Market signal</dt>
      <dd>OpenRouter’s public pricing: 5.5% platform fee on card top-ups (5% crypto); BYOK overage 5% after free allowance. Sacra estimates ~$160M annualized revenue (Aug 2026) — third-party, not a filing. a16z wash-filtered x402 volume ~$1.6M in the prior 30 days (as of 11 Mar 2026). Demo share of paid-MCP GMV is unknown.</dd>
    </div>
    <div class="field">
      <dt>Proof people pay</dt>
      <dd>
        <ul>
          <li>Other-chain analog: Coinbase x402 / Base-facilitated 402 — agents and humans already settle stablecoins on 402 challenges; a16z’s ~$1.6M wash-filtered month shows early but real pay-per-query spend.</li>
          <li>Non-chain analog: OpenRouter’s published ~5–5.5% take rate on credits/BYOK — developers pay a gateway fee for one key across many models; Cloudflare paid-tool patterns chase the same habit.</li>
        </ul>
      </dd>
    </div>
    <div class="field">
      <dt>Demo goal</dt>
      <dd>Agent hits a paid tool call → pays → gets a useful result (e.g. clean page extract). Prove pay-per-call without keys or seats — not an ops flex.</dd>
    </div>
  </dl>
</section>`
}

export function indexPage(priceSats = PRICE_SATS): string {
  const body = `
<header class="sheet-head">
  <p class="product-title"><span class="chip" aria-hidden="true"></span>402 MCP</p>
  <h1>Charge per call. No API keys.</h1>
  <p class="lede">402-mcp — paid MCP tools in sats (BRC-121, not Coinbase x402).</p>
</header>
${businessCaseSection()}
<section class="desk">
  <p>Price: ${priceSats} sats per tools/call. initialize and tools/list are free.</p>
  <p class="endpoint">MCP endpoint: POST /mcp</p>
  <p>Paid tool: extract_article (main article text).</p>
  <p>Payment is the credential. No signup, no API key.</p>
</section>`

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>402 MCP</title>
  <style>${styles}</style>
</head>
<body>
  <div class="app">
    <article class="sheet">
      ${body}
    </article>
  </div>
</body>
</html>`
}
