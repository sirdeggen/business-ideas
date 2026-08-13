export interface Article {
  slug: string
  title: string
  excerpt: string
  date: string
  content: string
}

export const articles: Article[] = [
  {
    slug: 'why-402-not-subscriptions',
    title: 'Why 402, not subscriptions',
    excerpt:
      'A subscription is an account with a calendar. A 402 is a price on a fetch. Those are different products.',
    date: '2026-08-13',
    content: `
<p class="lead">Subscriptions optimize for lock-in. HTTP 402 optimizes for the page you actually asked for.</p>
<p>A membership is a relationship: email, card, renewal, a wall that treats every URL as a club. That model pays for newsrooms that ship a daily bundle. It is a poor fit for a single essay, a single API response, or a single crawl. The reader who wants one piece still has to join the list. The agent that wants one document still has to pretend to be a user.</p>
<p>HTTP already named the other product. Status <code>402 Payment Required</code> means the resource is for sale, not that you failed a login. <a href="https://bsv.brc.dev/payments/0121">BRC-121</a> makes that status machine-readable: the server states a satoshi amount and an identity key; the client pays and retries with a transaction. No Stripe customer, no cookie session, no “subscribe to continue.”</p>
<p>That is the point of this site. The index is free so you can see the menu. Each article is a fetch with a price. Pay once for the bytes you wanted, then leave. If you come back tomorrow, you pay again — the same way you pay for a paper at a kiosk instead of a year of Sundays.</p>
<p>Subscriptions will keep existing. They are good at bundling and at predicting revenue. They are bad at pricing a single GET from a stranger, a script, or a model. 402 is the status code for that GET. Sats are small enough that the price can sit on the request instead of on a membership team.</p>
`
  },
  {
    slug: 'pay-per-crawl-vs-robots-txt',
    title: 'Pay-per-crawl is not robots.txt',
    excerpt:
      'Disallow is a preference. A hard block is a disappearance. A 402 is an invoice.',
    date: '2026-08-13',
    content: `
<p class="lead"><code>robots.txt</code> asks crawlers to stay out. Most training crawlers treat that as optional. The other extreme — IP blocks, challenge pages, cloaking — takes the work off the open web.</p>
<p>Pay-per-crawl is a third move. This publisher does not <code>Disallow</code> GPTBot, ClaudeBot, Googlebot, Bingbot, or the everyday tools (<code>curl</code>, <code>wget</code>, <code>python-requests</code>, <code>Go-http-client</code>). Those clients get the article route like anyone else. They also get a <em>different</em> price. The response is still HTTP 402. The headers are still <code>x-bsv-sats</code> and <code>x-bsv-server</code>. The number is higher because a crawl is not a pair of eyes: it is a copy that can be reused, embedded, and trained on without another visit.</p>
<p>That is not a hard block. A hard block says “you may not have this.” A 402 says “you may have this when the output pays for the input.” The crawler that can attach BRC-121 headers is a customer. The crawler that cannot still sees a machine-readable invoice instead of an HTML maze or a silent drop.</p>
<p>We publish a <a href="/robots.txt">robots.txt</a> that says the same thing in the old dialect: we do not forbid you. We meter you. If your agent only understands <code>Disallow</code>, you will misread this site. If it understands 402, you already know what to do next.</p>
<p>Two prices on one site keep the human web cheap and the bulk web honest. Browsers and BSV Browser stay on the reader rate. Anything that looks like a bot, or that asks for <code>application/json</code> without HTML, pays the crawl rate. Spoofing a Mozilla string is possible. So is ignoring <code>robots.txt</code>. The difference is that a paid fetch leaves a transaction, not a log line we cannot invoice.</p>
`
  },
  {
    slug: 'how-a-human-or-agent-pays',
    title: 'How a human or an agent pays',
    excerpt:
      'No account. The payment headers are the credential — in a browser wallet or in create402Fetch.',
    date: '2026-08-13',
    content: `
<p class="lead">A human and an agent hit the same URL. Both receive 402. They pay with the same five headers. Only the satoshi amount changes.</p>
<p><strong>If you are a person.</strong> Open the article in <em>BSV Browser</em> (native 402), or in a regular browser with the <em>402-extension</em> and <em>BSV Desktop</em> unlocked. The client reads <code>x-bsv-sats</code> and <code>x-bsv-server</code>, builds a BRC-121 payment from your wallet, and retries with <code>x-bsv-beef</code>, <code>x-bsv-sender</code>, <code>x-bsv-nonce</code>, <code>x-bsv-time</code>, and <code>x-bsv-vout</code>. There is no signup. The paid GET is the login.</p>
<p><strong>If you are a fetch.</strong> Do the same thing in code. <code>@bsv/402-pay</code> ships <code>create402Fetch({ wallet })</code>: it catches 402, pays, and retries. Or inspect the challenge yourself:</p>
<pre><code>curl -i \\
  -H 'Accept: application/json' \\
  http://localhost:3000/articles/how-a-human-or-agent-pays</code></pre>
<p>You should see <code>402</code>, a crawler <code>x-bsv-sats</code>, and <code>x-bsv-server</code>. Construct headers with <code>constructPaymentHeaders(wallet, url, sats, serverKey)</code> and repeat the GET. A browser-like <code>User-Agent</code> plus <code>Accept: text/html</code> is the human price; a bot UA or JSON Accept is the crawler price.</p>
<p>The server does not keep a member table. It internalizes the transaction, rejects replays, and serves the HTML. Clock skew over thirty seconds fails closed. That is the whole protocol. Humans use a wallet UI. Agents use a wallet library. Both are customers of the same page.</p>
`
  }
]

const bySlug = new Map(articles.map((article) => [article.slug, article]))

export function getAllArticles(): Article[] {
  return articles
}

export function getArticle(slug: string): Article | undefined {
  return bySlug.get(slug)
}
