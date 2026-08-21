import { useEffect, useState, type ReactNode } from 'react'
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
  formatPaidAt,
  humanReceiptId,
  invoiceStatus,
  moneyActionLabel,
  statusLabel,
  statusWordClass,
  unpaidHeadline,
  type UiStatus
} from './lib/copy'
import {
  fetchUsdPerBsv,
  formatUsd,
  formatUsdInput,
  parseUsdAmount,
  tryParseUsdAmount,
  usdToSats
} from './lib/money'
import { lookupInvoices, type OverlayInvoice } from './lib/overlay'
import {
  goHome,
  goToInvoice,
  invoicePublicUrl,
  parseInvoiceLocation
} from './lib/route'

type View = 'home' | 'create' | 'invoice'

const NOT_FOUND = 'This invoice wasn’t found.'

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

function Page({
  variant,
  advanced,
  children
}: {
  variant: 'create' | 'invoice'
  advanced?: boolean
  children: ReactNode
}) {
  return (
    <div className={`app ${variant}`}>
      <article className="sheet">{children}</article>
      {advanced ? <Advanced /> : null}
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
      <p className="meta">
        {online === true ? 'Reachable.' : online === false ? 'Not reachable from this browser.' : 'Checking…'}
        {' '}{overlayHint(url)}
      </p>
      {identityKey && (
        <p className="meta">
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
      <div className="row">
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
    <Page variant="create" advanced>
      <header className="sheet-head">
        <h1>Invoices</h1>
        <p className="lede">Send a payable. When they pay, it marks itself paid.</p>
      </header>

      <div className="ghost" aria-hidden="true">
        <div className="ghost-head">
          <p className="memo">2026 dues</p>
          <strong className="money">$50.00</strong>
        </div>
        <p className="meta">Riverside Community Church</p>
        <p className="status-word paid">Paid</p>
      </div>
      <p className="empty-sell">Get paid for the first time.</p>
      <button className="btn primary" onClick={onCreate}>Create an invoice</button>
    </Page>
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
  const [amount, setAmount] = useState('50.00')
  const [dueDate, setDueDate] = useState(defaultDueDate)
  const [usdPerBsv, setUsdPerBsv] = useState<number | null>(null)
  const [rateError, setRateError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{
    org?: string
    billed?: string
    memo?: string
    amount?: string
  }>({})
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

  const parsedAmount = tryParseUsdAmount(amount)
  const amountDisplay = parsedAmount != null ? formatUsd(parsedAmount) : ''

  const commitAmount = (): void => {
    if (parsedAmount != null) setAmount(formatUsdInput(parsedAmount))
  }

  const send = async (): Promise<void> => {
    setError(null)
    setShowInstall(false)
    const nextErrors: typeof fieldErrors = {}
    if (!orgName.trim()) nextErrors.org = 'Enter an org name.'
    if (!billedTo.trim()) nextErrors.billed = 'Enter who it’s for.'
    if (!memo.trim()) nextErrors.memo = 'Enter what it’s for.'
    let usd: number | null = null
    try {
      usd = parseUsdAmount(amount)
    } catch (err) {
      nextErrors.amount = errorMessage(err)
    }
    setFieldErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return
    if (usd == null) return
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
    setAmount(formatUsdInput(usd))
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
    <Page variant="create" advanced>
      <header className="sheet-head">
        <button className="text-link" onClick={onBack}>Invoices</button>
        <div className="title-row">
          <h1>New invoice</h1>
          <span className={statusWordClass('draft')}>Draft</span>
        </div>
        {amountDisplay && <p className="amount-run">{amountDisplay}</p>}
      </header>

      <div className="fields">
        <div className="field">
          <label htmlFor="org">Org name</label>
          <input
            id="org"
            value={orgName}
            onChange={(event) => setOrgName(event.target.value)}
            placeholder="Riverside Community Church"
            maxLength={80}
            aria-invalid={Boolean(fieldErrors.org)}
            aria-describedby={fieldErrors.org ? 'org-error' : undefined}
          />
          {fieldErrors.org && <p id="org-error" className="field-error">{fieldErrors.org}</p>}
        </div>
        <div className="field">
          <label htmlFor="billed">Who it’s for</label>
          <input
            id="billed"
            value={billedTo}
            onChange={(event) => setBilledTo(event.target.value)}
            placeholder="Jordan Lee"
            maxLength={80}
            aria-invalid={Boolean(fieldErrors.billed)}
            aria-describedby={fieldErrors.billed ? 'billed-error' : undefined}
          />
          {fieldErrors.billed && <p id="billed-error" className="field-error">{fieldErrors.billed}</p>}
        </div>
        <div className="field">
          <label htmlFor="memo">What it’s for</label>
          <input
            id="memo"
            value={memo}
            onChange={(event) => setMemo(event.target.value)}
            placeholder="2026 dues"
            maxLength={200}
            aria-invalid={Boolean(fieldErrors.memo)}
            aria-describedby={fieldErrors.memo ? 'memo-error' : undefined}
          />
          {fieldErrors.memo && <p id="memo-error" className="field-error">{fieldErrors.memo}</p>}
        </div>
        <div className="grid">
          <div className="field">
            <label htmlFor="amount">Amount</label>
            <div className="dollar">
              <span>$</span>
              <input
                id="amount"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                onBlur={commitAmount}
                aria-invalid={Boolean(fieldErrors.amount)}
                aria-describedby={fieldErrors.amount ? 'amount-error' : undefined}
              />
            </div>
            {fieldErrors.amount && <p id="amount-error" className="field-error">{fieldErrors.amount}</p>}
          </div>
          <div className="field">
            <label htmlFor="due">Due date</label>
            <input
              id="due"
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </div>
        </div>
      </div>
      {rateError && (
        <p className="status err">Couldn’t get the dollar rate. {rateError}</p>
      )}
      <div className="actions">
        <button
          className="btn primary"
          disabled={busy || connecting}
          onClick={() => void send()}
        >
          {busy || connecting ? 'Approve in your wallet…' : moneyActionLabel('Send', parsedAmount)}
        </button>
      </div>
      {(busy || connecting || showInstall) && <ChromeHint />}
      {showInstall && <InstallPrompt verb="send" onRetry={() => void send()} />}
      {error && <p className="status err">{error}</p>}
    </Page>
  )
}

function InvoicePage({
  invoiceId,
  createTxid,
  onHome,
  onCreate
}: {
  invoiceId: string
  createTxid: string | null
  onHome: () => void
  onCreate: () => void
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
        setError(row ? null : NOT_FOUND)
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

  if (!invoice && error === NOT_FOUND) {
    return (
      <Page variant="invoice">
        <header className="sheet-head">
          <button className="text-link" onClick={onHome}>Invoices</button>
          <div className="title-row">
            <h1>Invoice</h1>
            <span className={statusWordClass('missing')}>Not found</span>
          </div>
        </header>
        <p className="memo">{NOT_FOUND}</p>
        <div className="actions">
          <button className="btn primary" onClick={onCreate}>Create an invoice</button>
        </div>
      </Page>
    )
  }

  if (!invoice) {
    return (
      <Page variant="invoice">
        <header className="sheet-head">
          <button className="text-link" onClick={onHome}>Invoices</button>
          <h1>Invoice</h1>
        </header>
        <p className="meta">{error || 'Loading invoice…'}</p>
      </Page>
    )
  }

  const status: UiStatus = invoiceStatus(invoice, processing)
  const amount = displayAmount(invoice)
  const paid = status === 'paid'
  const payUsd = tryParseUsdAmount(invoice.amountUsd || '')

  if (paid) {
    return (
      <Page variant="invoice">
        <header className="sheet-head">
          <button className="text-link" onClick={onHome}>Invoices</button>
          <div className="paid-hero">
            <h1 className={statusWordClass('paid')}>Paid</h1>
            {amount && <p className="amount-xl">{amount}</p>}
          </div>
        </header>
        <p className="memo">{invoice.memo || 'Payable'}</p>
        {invoice.orgName && <p className="from">{invoice.orgName}</p>}
        {invoice.billedTo && <p className="who">{invoice.billedTo}</p>}
        <p className="when">{formatPaidAt(invoice.paidAt) || 'Just now'}</p>
        <p className="helper">You’re done. The receipt is this page.</p>
        <div className="actions">
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
      </Page>
    )
  }

  return (
    <Page variant="invoice">
      <header className="sheet-head">
        <button className="text-link" onClick={onHome}>Invoices</button>
        <div className="title-row">
          {amount && <h1 className="amount-xl">{amount}</h1>}
          <span className={statusWordClass(status)}>{statusLabel(status)}</span>
        </div>
      </header>
      <p className="memo">{invoice.memo || 'Payable'}</p>
      {invoice.billedTo && <p className="who">{invoice.billedTo}</p>}
      {invoice.orgName && <p className="from">{invoice.orgName}</p>}
      <p className="meta">{unpaidHeadline(invoice, status)}</p>
      <p className="meta">Invoice # <code>{humanReceiptId(invoice.invoiceId)}</code></p>
      <p className="helper">Send this link. When they pay, this page says Paid.</p>
      <div className="stack-actions">
        <button
          className="btn primary"
          disabled={busy || connecting || status === 'processing'}
          onClick={() => void pay()}
        >
          {busy || connecting || status === 'processing'
            ? 'Approve in your wallet…'
            : moneyActionLabel('Pay', payUsd)}
        </button>
        <button className="btn" onClick={() => void copyLink()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {(busy || connecting || showInstall) && <ChromeHint />}
      {showInstall && <InstallPrompt verb="pay" onRetry={() => void pay()} />}
      {error && <p className="status err">{error}</p>}
    </Page>
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
        onCreate={() => { goHome(); setView('create') }}
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
