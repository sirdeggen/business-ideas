import { useEffect, useState } from 'react'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  acceptPayment,
  createInvoice,
  parsePaymentPackage,
  payInvoice
} from './lib/actions'
import {
  DESKTOP_INSTALL_URL,
  defaultDueDate,
  errorMessage,
  overlayHint,
  shortKey
} from './lib/config'
import {
  displayAmount,
  duePhrase,
  formatPaidAt,
  humanReceiptId,
  invoiceStatus,
  statusLabel,
  unpaidHeadline,
  type UiStatus
} from './lib/copy'
import { fetchUsdPerBsv, formatUsdInput, parseUsdAmount, usdToSats } from './lib/money'
import { lookupInvoices, type OverlayInvoice } from './lib/overlay'
import {
  goHome,
  goToInvoice,
  invoicePublicUrl,
  parseInvoiceLocation
} from './lib/route'

type View = 'home' | 'create' | 'invoice'

function stampClass(status: UiStatus): string {
  if (status === 'paid') return 'stamp paid'
  if (status === 'overdue') return 'stamp overdue'
  if (status === 'processing') return 'stamp processing'
  return 'stamp unpaid'
}

const CHROME_HINT =
  'Chrome may ask to allow this site to talk to apps on this device. Allow, then Retry, with Desktop unlocked.'

function ChromeHint() {
  return <p className="helper chrome-hint">{CHROME_HINT}</p>
}

function InstallPrompt({
  verb,
  onRetry
}: {
  verb: 'send' | 'pay'
  onRetry: () => void
}) {
  return (
    <div className="install">
      <p>
        To {verb} this, Chrome must be allowed to talk to apps on this device, and
        Desktop must be unlocked. Allow, then Retry.
      </p>
      <div className="row">
        <button className="btn primary" onClick={onRetry}>Retry</button>
        <a className="btn" href={DESKTOP_INSTALL_URL} target="_blank" rel="noreferrer">
          Install BSV Desktop
        </a>
      </div>
    </div>
  )
}

function Advanced() {
  const { url, setUrl, online } = useOverlay()
  const { identityKey, connect } = useWallet()
  const [incoming, setIncoming] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const accept = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const client = await connect()
      await acceptPayment(client, parsePaymentPackage(incoming))
      setStatus('Payment collected into this wallet.')
      setIncoming('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className="advanced">
      <summary>Advanced</summary>
      <label htmlFor="overlay-url">Overlay URL</label>
      <input
        id="overlay-url"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://…"
        autoComplete="off"
      />
      <p className="hint">
        {online === true ? 'Reachable.' : online === false ? 'Not reachable from this browser.' : 'Checking…'}
        {' '}{overlayHint(url)}
      </p>
      {identityKey && (
        <p className="hint">
          Wallet key <code>{shortKey(identityKey, 8)}</code>
        </p>
      )}
      <label htmlFor="internalize">Collect a payment package</label>
      <textarea
        id="internalize"
        rows={4}
        value={incoming}
        onChange={(event) => setIncoming(event.target.value)}
        placeholder="Payee only — paste if you were given a package."
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!incoming.trim() || busy} onClick={() => void accept()}>
          Collect payment
        </button>
      </div>
      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}
    </details>
  )
}

function Home({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1>Invoices</h1>
          <p className="lede">Send a payable. When they pay, it marks itself paid.</p>
        </div>
      </header>

      <section className="panel ghost-wrap">
        <div className="ghost" aria-hidden="true">
          <div className="ghost-head">
            <span className="stamp paid fat">Paid</span>
            <strong>$50.00</strong>
          </div>
          <p className="memo">2026 dues</p>
          <p className="hint">Riverside Community Church</p>
        </div>
        <p className="empty-sell">Get paid for the first time.</p>
        <button className="btn primary" onClick={onCreate}>Create an invoice</button>
      </section>

      <Advanced />
    </div>
  )
}

function Create({
  onSent,
  onBack
}: {
  onSent: (invoiceId: string, txid: string) => void
  onBack: () => void
}) {
  const { url } = useOverlay()
  const { connect, connecting } = useWallet()
  const [orgName, setOrgName] = useState('')
  const [billedTo, setBilledTo] = useState('')
  const [memo, setMemo] = useState('2026 dues')
  const [amount, setAmount] = useState('50')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [usdPerBsv, setUsdPerBsv] = useState<number | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showInstall, setShowInstall] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchUsdPerBsv()
      .then((rate) => {
        if (cancelled) return
        setUsdPerBsv(rate)
        setRateError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setUsdPerBsv(null)
        setRateError(errorMessage(err))
      })
    return () => { cancelled = true }
  }, [])

  const send = async (): Promise<void> => {
    setError(null)
    setShowInstall(false)
    if (!orgName.trim() || !billedTo.trim() || !memo.trim()) {
      setError('Fill in org name, who it’s for, and what it’s for.')
      return
    }
    if (!url) {
      setError('This page needs an overlay URL before it can send. Open Advanced.')
      return
    }
    let rate = usdPerBsv
    if (!rate) {
      try {
        rate = await fetchUsdPerBsv()
        setUsdPerBsv(rate)
        setRateError(null)
      } catch (err) {
        const message = errorMessage(err)
        setRateError(message)
        setError(`Could not fetch a dollar rate. ${message}`)
        return
      }
    }
    if (rate === null) {
      setError('Could not fetch a dollar rate.')
      return
    }
    let usd: number
    try {
      usd = parseUsdAmount(amount)
    } catch (err) {
      setError(errorMessage(err))
      return
    }
    setBusy(true)
    let client
    try {
      client = await connect()
    } catch (err) {
      setError(errorMessage(err))
      setShowInstall(true)
      setBusy(false)
      return
    }
    try {
      const created = await createInvoice(client, url, {
        amountSats: usdToSats(usd, rate),
        memo: memo.trim(),
        dueDate,
        orgName: orgName.trim(),
        billedTo: billedTo.trim(),
        amountUsd: formatUsdInput(usd)
      })
      onSent(created.invoiceId, created.txid)
    } catch (err) {
      setError(errorMessage(err))
      setShowInstall(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <button className="text-link" onClick={onBack}>Invoices</button>
          <h1>Send a payable</h1>
          <p className="lede">When they pay, it marks itself paid.</p>
        </div>
      </header>

      <section className="panel">
        <label htmlFor="org">Org name</label>
        <input
          id="org"
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          placeholder="Riverside Community Church"
          maxLength={80}
        />
        <label htmlFor="billed">Who it’s for</label>
        <input
          id="billed"
          value={billedTo}
          onChange={(event) => setBilledTo(event.target.value)}
          placeholder="Jordan Lee"
          maxLength={80}
        />
        <label htmlFor="memo">What it’s for</label>
        <input
          id="memo"
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="2026 dues"
          maxLength={200}
        />
        <div className="grid">
          <div>
            <label htmlFor="amount">Amount</label>
            <div className="dollar">
              <span>$</span>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="due">Due date</label>
            <input
              id="due"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        </div>
        {rateError && (
          <p className="status err">Couldn’t get the dollar rate. {rateError}</p>
        )}
        <div className="row" style={{ marginTop: 20 }}>
          <button
            className="btn primary"
            disabled={busy || connecting}
            onClick={() => void send()}
          >
            {busy || connecting ? 'Approve in your wallet…' : 'Send'}
          </button>
        </div>
        {!(busy || connecting || showInstall) && (
          <p className="helper">We’ll ask you to approve this in a moment.</p>
        )}
        {(busy || connecting || showInstall) && <ChromeHint />}
        {showInstall && <InstallPrompt verb="send" onRetry={() => void send()} />}
        {error && <p className="status err">{error}</p>}
      </section>

      <Advanced />
    </div>
  )
}

function InvoicePage({
  invoiceId,
  createTxid,
  onHome
}: {
  invoiceId: string
  createTxid: string | null
  onHome: () => void
}) {
  const { url } = useOverlay()
  const { connect, connecting } = useWallet()
  const [invoice, setInvoice] = useState<OverlayInvoice | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showInstall, setShowInstall] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      if (!url) {
        if (!cancelled) {
          setInvoice(null)
          setError('This invoice isn’t available right now.')
        }
        return
      }
      try {
        const rows = await lookupInvoices(url, {
          invoiceId,
          txid: createTxid || undefined
        })
        if (cancelled) return
        const row = rows[0] ?? null
        setInvoice(row)
        setError(row ? null : 'This invoice wasn’t found.')
        if (row?.status === 'paid') setProcessing(false)
      } catch (err) {
        if (!cancelled) setError(errorMessage(err))
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 3000)
    const onVis = (): void => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [url, invoiceId, createTxid])

  const copyLink = async (): Promise<void> => {
    await navigator.clipboard.writeText(invoicePublicUrl(invoiceId, invoice?.txid || createTxid))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  const pay = async (): Promise<void> => {
    if (!invoice || !url) return
    setError(null)
    setShowInstall(false)
    setBusy(true)
    setProcessing(true)
    let client
    try {
      client = await connect()
    } catch (err) {
      setError(errorMessage(err))
      setShowInstall(true)
      setProcessing(false)
      setBusy(false)
      return
    }
    try {
      await payInvoice(client, url, invoice)
      const rows = await lookupInvoices(url, {
        invoiceId,
        txid: invoice.txid || createTxid || undefined
      })
      setInvoice(rows[0] ?? invoice)
    } catch (err) {
      const message = errorMessage(err, 'pay')
      setError(message)
      if (!/already paid/i.test(message)) {
        setShowInstall(true)
        setProcessing(false)
      }
    } finally {
      setBusy(false)
    }
  }

  const status: UiStatus = invoice ? invoiceStatus(invoice, processing) : 'unpaid'
  const amount = invoice ? displayAmount(invoice) : ''
  const paid = status === 'paid'

  return (
    <div className="app">
      <header className="masthead invoice-mast">
        <div>
          <button className="text-link" onClick={onHome}>Invoices</button>
          <h1>{invoice?.orgName || 'Invoice'}</h1>
          {amount && <p className="amount-xl">{amount}</p>}
        </div>
        <span className={`${stampClass(status)} fat`}>{statusLabel(status)}</span>
      </header>

      {!invoice && (
        <section className="panel">
          <p className="hint">{error || 'Loading invoice…'}</p>
        </section>
      )}

      {invoice && !paid && (
        <section className="panel">
          <p className="memo">{invoice.memo || 'Payable'}</p>
          <p className="lede">{unpaidHeadline(invoice, status)}</p>
          {invoice.billedTo && <p className="hint">Waiting on {invoice.billedTo}.</p>}
          <dl>
            <div><dt>Who</dt><dd>{invoice.billedTo || '—'}</dd></div>
            <div><dt>Due</dt><dd>{duePhrase(invoice.dueDate)}</dd></div>
            <div><dt>Receipt</dt><dd>{humanReceiptId(invoice.invoiceId)}</dd></div>
          </dl>
          <p className="helper">Send this link. When they pay, this page says Paid.</p>
          <div className="stack-actions">
            <button className="btn copy-link" onClick={() => void copyLink()}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <button
              className="btn primary"
              disabled={busy || connecting || status === 'processing'}
              onClick={() => void pay()}
            >
              {busy || connecting || status === 'processing' ? 'Approve in your wallet…' : 'Pay'}
            </button>
          </div>
          {(busy || connecting || showInstall) && <ChromeHint />}
          {showInstall && <InstallPrompt verb="pay" onRetry={() => void pay()} />}
          {error && <p className="status err">{error}</p>}
        </section>
      )}

      {invoice && paid && (
        <section className="panel receipt">
          <div className="paid-hero">
            <span className="stamp paid fat">Paid</span>
            {amount && <p className="amount-xl">{amount}</p>}
          </div>
          <p className="memo">{invoice.memo || 'Payable'}</p>
          <dl>
            <div><dt>From</dt><dd>{invoice.orgName || '—'}</dd></div>
            <div><dt>Who</dt><dd>{invoice.billedTo || '—'}</dd></div>
            <div><dt>When</dt><dd>{formatPaidAt(invoice.paidAt) || 'Just now'}</dd></div>
            <div><dt>Receipt</dt><dd>{humanReceiptId(invoice.invoiceId)}</dd></div>
          </dl>
          <p className="helper">You’re done. The receipt is this page.</p>
          <div className="row">
            <button className="btn" onClick={() => void copyLink()}>
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
          <details className="advanced">
            <summary>Details</summary>
            <dl>
              {invoice.paymentTxid && (
                <div><dt>Payment</dt><dd><code>{invoice.paymentTxid}</code></dd></div>
              )}
              <div><dt>Invoice id</dt><dd><code>{invoice.invoiceId}</code></dd></div>
            </dl>
          </details>
        </section>
      )}
    </div>
  )
}

function readRoute(): { invoiceId: string | null, createTxid: string | null } {
  if (typeof window === 'undefined') return { invoiceId: null, createTxid: null }
  return parseInvoiceLocation(window.location.pathname, window.location.search, window.location.hash)
}

function Shell() {
  const initial = readRoute()
  const [view, setView] = useState<View>(() => (initial.invoiceId ? 'invoice' : 'home'))
  const [invoiceId, setInvoiceId] = useState<string | null>(() => initial.invoiceId)
  const [createTxid, setCreateTxid] = useState<string | null>(() => initial.createTxid)

  useEffect(() => {
    const sync = (): void => {
      const route = readRoute()
      if (route.invoiceId) {
        setInvoiceId(route.invoiceId)
        setCreateTxid(route.createTxid)
        setView('invoice')
        return
      }
      setInvoiceId(null)
      setCreateTxid(null)
      setView((current) => (current === 'create' ? 'create' : 'home'))
    }
    window.addEventListener('popstate', sync)
    window.addEventListener('hashchange', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hashchange', sync)
    }
  }, [])

  if (view === 'create') {
    return (
      <Create
        onBack={() => { goHome(); setView('home') }}
        onSent={(id, txid) => {
          goToInvoice(id, txid)
          setInvoiceId(id)
          setCreateTxid(txid)
          setView('invoice')
        }}
      />
    )
  }

  if (view === 'invoice' && invoiceId) {
    return (
      <InvoicePage
        invoiceId={invoiceId}
        createTxid={createTxid}
        onHome={() => { goHome(); setView('home') }}
      />
    )
  }

  return <Home onCreate={() => setView('create')} />
}

export default function App() {
  return (
    <WalletProvider>
      <OverlayProvider>
        <Shell />
      </OverlayProvider>
    </WalletProvider>
  )
}
