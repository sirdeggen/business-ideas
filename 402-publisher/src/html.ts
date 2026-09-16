import { articles, type Article } from './articles.js'
import { crawlerSats, humanSats } from './pricing.js'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function formatDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  })
}

const styles = `
:root {
  --bg: #f7f3ea;
  --ink: #1c1916;
  --muted: #5c564d;
  --rule: #d8d0c0;
  --card: #fffdf7;
  --accent: #9a3412;
  --accent-soft: #f3e2d4;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #161412;
    --ink: #f3eee4;
    --muted: #b3aa9c;
    --rule: #3a342c;
    --card: #1f1b18;
    --accent: #e8b298;
    --accent-soft: #2a211c;
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  background: var(--bg);
  color: var(--ink);
  line-height: 1.7;
  min-height: 100vh;
}
a { color: inherit; }
.wrap { max-width: 720px; margin: 0 auto; padding: 28px 20px 64px; }
header.mast {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 2px solid var(--ink);
  padding-bottom: 16px;
  margin-bottom: 28px;
}
.brand { text-decoration: none; display: flex; align-items: baseline; gap: 10px; }
.mark {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-weight: 700;
  letter-spacing: 0.04em;
  border: 2px solid var(--ink);
  padding: 2px 8px;
  font-size: 0.95rem;
}
.word { font-size: 1.7rem; font-weight: 700; letter-spacing: -0.02em; }
.tag { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.75rem; color: var(--muted); }
.prices {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin: 0 0 28px;
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
}
.prices span {
  background: var(--accent-soft);
  color: var(--accent);
  padding: 4px 10px;
  border-radius: 999px;
}
.lede { font-size: 1.15rem; color: var(--muted); margin-bottom: 28px; }
.business-case {
  background: var(--card);
  border: 1px solid var(--rule);
  border-left: 3px solid var(--accent);
  padding: 20px 22px 16px;
  margin: 0 0 28px;
}
.business-case > h2 {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--accent);
  margin-bottom: 16px;
}
.business-case dl { margin: 0; }
.business-case .field { margin-bottom: 14px; }
.business-case .field:last-child { margin-bottom: 0; }
.business-case dt {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 4px;
}
.business-case dd { margin: 0; font-size: 0.98rem; }
.business-case dd p { margin: 0; }
.business-case ul {
  margin: 0;
  padding-left: 1.15em;
}
.business-case li + li { margin-top: 4px; }
.cite-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.cite-chip {
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.72rem;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 3px 9px;
  border-radius: 999px;
  text-decoration: none;
}
.card {
  display: block;
  text-decoration: none;
  background: var(--card);
  border: 1px solid var(--rule);
  padding: 20px 22px;
  margin-bottom: 14px;
}
.card h2 { font-size: 1.35rem; letter-spacing: -0.02em; margin-bottom: 8px; }
.card p { color: var(--muted); }
.meta { font-family: ui-sans-serif, system-ui, sans-serif; font-size: 0.75rem; color: var(--muted); margin-top: 10px; }
article h1 { font-size: 2rem; letter-spacing: -0.03em; line-height: 1.25; margin-bottom: 10px; }
article .lead { font-size: 1.2rem; color: var(--muted); margin: 20px 0 18px; }
article p { margin-bottom: 16px; }
article pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.82rem;
  background: var(--card);
  border: 1px solid var(--rule);
  padding: 14px;
  overflow-x: auto;
  margin-bottom: 16px;
}
article code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.88em; }
footer {
  margin-top: 40px;
  padding-top: 16px;
  border-top: 1px solid var(--rule);
  color: var(--muted);
  font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: 0.78rem;
}
`

export function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>
  <div class="wrap">
    <header class="mast">
      <a class="brand" href="/">
        <span class="mark">402</span>
        <span class="word">Press</span>
      </a>
      <p class="tag">One site. Paid pages. Two prices.</p>
    </header>
    ${body}
    <footer>
      Paid per fetch with BRC-121 · no accounts · humans ${humanSats()} sats · crawlers ${crawlerSats()} sats
    </footer>
  </div>
</body>
</html>`
}

function businessCaseSection(): string {
  return `
<section class="business-case" aria-labelledby="business-case-title">
  <h2 id="business-case-title">Business case</h2>
  <dl>
    <div class="field">
      <dt>Why it exists</dt>
      <dd>Publishers want readers and crawlers to pay differently for the same page: humans a small fetch price, AI crawlers a higher one — a price tag, not a hard wall. The publisher keeps the meter and the audience relationship, without a membership middleman taking a cut of every paid unlock.</dd>
    </div>
    <div class="field">
      <dt>Who pays</dt>
      <dd>Independent publishers and media brands testing pay-per-crawl; writers leaving high-take platforms. Crawlers and AI labs that choose to pay for access. Hosting customers already pay for the press; 402 is an extra monetization surface.</dd>
    </div>
    <div class="field">
      <dt>Market signal</dt>
      <dd>
        <p>Ghost: ~$11.1M ARR, ~30.6K active customers (ghost.org/about, Sep 2026). x402 (Coinbase): ~500K transactions in one Oct 2025 week; peak day ~$332K volume — early protocol activity, not publisher ARR. Cloudflare Pay Per Crawl public GMV is unknown.</p>
        <p class="cite-chips">
          <a class="cite-chip" href="https://ghost.org/about/" target="_blank" rel="noopener noreferrer">Ghost about</a>
          <a class="cite-chip" href="https://crypto.news/coinbase-x402-protocol-logs-500000-transactions/" target="_blank" rel="noopener noreferrer">x402</a>
          <a class="cite-chip" href="https://blog.cloudflare.com/introducing-pay-per-crawl/" target="_blank" rel="noopener noreferrer">Cloudflare PPC</a>
        </p>
      </dd>
    </div>
    <div class="field">
      <dt>Proof people pay</dt>
      <dd>
        <ul>
          <li>Other-chain analog: Coinbase x402 — agents and humans paying on 402 challenges with measurable Oct 2025 spikes.</li>
          <li>Non-chain analog: Ghost(Pro) hosting ARR and Cloudflare Pay Per Crawl prove both sides of “readers/crawlers pay for content access.”</li>
        </ul>
      </dd>
    </div>
    <div class="field">
      <dt>Demo goal</dt>
      <dd>Publish a few articles → human fetch at one price → crawler fetch at a higher price → payment unlocks content.</dd>
    </div>
  </dl>
</section>`
}

export function indexPage(): string {
  const cards = articles
    .map(
      (article) => `
<a class="card" href="/articles/${encodeURIComponent(article.slug)}">
  <h2>${escapeHtml(article.title)}</h2>
  <p>${escapeHtml(article.excerpt)}</p>
  <p class="meta">${escapeHtml(formatDate(article.date))} · 402 until paid</p>
</a>`
    )
    .join('')

  const body = `
<div class="prices">
  <span>Readers ${humanSats()} sats</span>
  <span>Crawlers ${crawlerSats()} sats</span>
</div>
<p class="lede">A Ghost-class page that charges people and bots for the same articles — HTTP 402 on BSV, priced in sats. The index is free. The essays are not.</p>
${businessCaseSection()}
${cards}`

  return pageShell('402 Press', body)
}

export function articlePage(article: Article): string {
  const body = `
<article>
  <h1>${escapeHtml(article.title)}</h1>
  <p class="meta">${escapeHtml(formatDate(article.date))}</p>
  ${article.content}
</article>`
  return pageShell(article.title, body)
}

export function notFoundPage(): string {
  return pageShell('Not found', `<p>That article is not on this press.</p><p><a href="/">Back to the index.</a></p>`)
}

/** HTML body for a 402 so Chrome will render the challenge instead of failing the navigation. */
export function paywallPage(sats: number, articleTitle?: string): string {
  const heading = articleTitle ?? 'This essay'
  const body = `
<article>
  <h1>This essay is ${sats} sats.</h1>
  <p class="lead">Pay with <strong>BSV Browser</strong> (native 402), the <strong>402-extension</strong>, or <strong>BSV Desktop</strong>. There is no account.</p>
  <p><a href="/">Back to the index</a> (free)</p>
</article>`
  return pageShell(`402 · ${heading}`, body)
}
