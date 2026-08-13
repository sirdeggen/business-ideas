import { useEffect, useMemo, useState } from 'react'
import { OverlayProvider, useOverlay } from './context/OverlayContext'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  acceptPayment,
  createInvoice,
  parsePaymentPackage,
  payInvoice,
  type PaymentPackage
} from './lib/actions'
import { errorMessage, formatSats, shortKey, todayIsoDate } from './lib/config'
import { lookupInvoices, type OverlayInvoice } from './lib/overlay'

function isOverdue(invoice: OverlayInvoice): boolean {
  return invoice.status === 'open' && invoice.dueDate < todayIsoDate()
}

function Shell() {
  const { identityKey, connecting, error: walletError, connect, wallet } = useWallet()
  const { url, setUrl, online } = useOverlay()
  const [amount, setAmount] = useState('1500')
  const [memo, setMemo] = useState('Hall hire')
  const [dueDate, setDueDate] = useState(todayIsoDate())
  const [open, setOpen] = useState<OverlayInvoice[]>([])
  const [paid, setPaid] = useState<OverlayInvoice[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<PaymentPackage | null>(null)
  const [incoming, setIncoming] = useState('')
  const [copied, setCopied] = useState(false)

  const refresh = async (): Promise<void> => {
    const [openRows, paidRows] = await Promise.all([
      lookupInvoices(url, { status: 'open' }),
      lookupInvoices(url, { status: 'paid' })
    ])
    setOpen(openRows)
    setPaid(paidRows)
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => setError(errorMessage(err)))
  }, [url])

  const copyIdentity = async (): Promise<void> => {
    if (!identityKey) return
    await navigator.clipboard.writeText(identityKey)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const issue = async (): Promise<void> => {
    if (!wallet) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const created = await createInvoice(wallet, url, {
        amountSats: Number(amount),
        memo: memo.trim(),
        dueDate
      })
      setStatus(`Invoice ${created.invoiceId} is open at ${created.outpoint}`)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const pay = async (invoice: OverlayInvoice): Promise<void> => {
    if (!wallet) return
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const pack = await payInvoice(wallet, url, invoice)
      setReceipt(pack)
      setStatus(`Paid. Receipt: invoice ${pack.invoiceId} · txid ${pack.txid}`)
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const accept = async (): Promise<void> => {
    if (!wallet) return
    setBusy(true)
    setError(null)
    try {
      await acceptPayment(wallet, parsePaymentPackage(incoming))
      setStatus('BRC-29 payment internalized. The sats are in this wallet.')
      setIncoming('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const overlayLabel = useMemo(() => {
    if (online === null) return 'checking'
    return online ? 'online' : 'offline — start docker compose'
  }, [online])

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">BRC-100 · BSV payable</p>
          <h1>Invoices</h1>
          <p className="lede">
            An invoice is a UTXO. The payer settles it with BRC-29. Status is
            public. Church treasurer and a 50-person shop both get a receipt.
          </p>
        </div>
        <div className="identity">
          {connecting && <div>Connecting BSV wallet…</div>}
          {identityKey && (
            <>
              Payee / payer identity
              <code>{shortKey(identityKey, 12)}</code>
              <button className="btn" style={{ marginTop: 8 }} onClick={() => void copyIdentity()}>
                {copied ? 'Copied' : 'Copy identity key'}
              </button>
            </>
          )}
          {walletError && (
            <>
              <div className="status err">{walletError}</div>
              <button className="btn" onClick={() => void connect()}>Retry wallet</button>
            </>
          )}
          {!connecting && !identityKey && !walletError && (
            <button className="btn primary" onClick={() => void connect()}>Connect BSV wallet</button>
          )}
        </div>
      </header>

      <p className="banner">
        Overlay {overlayLabel} · {url}. Custom topic <code>tm_invoices</code> is
        not on overlay-us-1.bsvb.tech — run the Docker overlay in this folder.
      </p>

      <section className="panel">
        <h2>Create invoice</h2>
        <p>
          Persists as a 1-sat PushDrop in the <code>invoices</code> basket.
          Amount is billed in sats; the payee is this connected identity.
        </p>
        <div className="grid">
          <label htmlFor="amount">Amount (sats)</label>
          <input
            id="amount"
            type="number"
            min={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <label htmlFor="due">Due date</label>
          <input
            id="due"
            type="date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
          />
        </div>
        <label htmlFor="memo">Memo</label>
        <input
          id="memo"
          maxLength={200}
          value={memo}
          onChange={(event) => setMemo(event.target.value)}
          placeholder="Choir robes, hall hire, April catering…"
        />
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn primary" disabled={!wallet || busy} onClick={() => void issue()}>
            {busy ? 'Working…' : 'Create invoice'}
          </button>
          <button className="btn" onClick={() => void refresh()}>Refresh overlay</button>
        </div>
      </section>

      <section className="panel">
        <h2>Open</h2>
        <p>Public overlay lookup of unpaid invoices. Pay with BSV Desktop / BSV Browser (BRC-29).</p>
        {open.length === 0 && <p className="hint">No open invoices.</p>}
        {open.map((invoice) => (
          <article className="payable" key={invoice.invoiceId}>
            <div className="payable-head">
              <span className={`stamp ${isOverdue(invoice) ? 'overdue' : 'open'}`}>
                {isOverdue(invoice) ? 'Overdue' : 'Open'}
              </span>
              <strong>{formatSats(invoice.amountSats)}</strong>
            </div>
            <p className="memo">{invoice.memo || 'No memo'}</p>
            <dl>
              <div><dt>Invoice</dt><dd><code>{invoice.invoiceId}</code></dd></div>
              <div><dt>Payee</dt><dd><code>{shortKey(invoice.payeeIdentity, 10)}</code></dd></div>
              <div><dt>Due</dt><dd>{invoice.dueDate}</dd></div>
            </dl>
            <button
              className="btn primary"
              disabled={!wallet || busy}
              onClick={() => void pay(invoice)}
            >
              Pay with BSV
            </button>
          </article>
        ))}
      </section>

      <section className="panel">
        <h2>Paid</h2>
        <p>Settled invoices. Each row is the receipt: invoice id plus payment txid.</p>
        {paid.length === 0 && <p className="hint">No paid invoices yet.</p>}
        {paid.map((invoice) => (
          <article className="payable paid" key={invoice.invoiceId}>
            <div className="payable-head">
              <span className="stamp paid">Paid</span>
              <strong>{formatSats(invoice.amountSats)}</strong>
            </div>
            <p className="memo">{invoice.memo || 'No memo'}</p>
            <dl>
              <div><dt>Invoice</dt><dd><code>{invoice.invoiceId}</code></dd></div>
              <div><dt>Payment txid</dt><dd><code>{invoice.paymentTxid || '—'}</code></dd></div>
            </dl>
          </article>
        ))}
      </section>

      {receipt && (
        <section className="panel receipt">
          <h2>Receipt</h2>
          <p>Give this to the payee so they can internalize the BRC-29 output.</p>
          <dl>
            <div><dt>Invoice id</dt><dd><code>{receipt.invoiceId}</code></dd></div>
            <div><dt>Payment txid</dt><dd><code>{receipt.txid}</code></dd></div>
            <div><dt>Amount</dt><dd>{formatSats(receipt.amountSats)}</dd></div>
          </dl>
          <textarea rows={8} readOnly value={JSON.stringify(receipt)} />
          <div className="row" style={{ marginTop: 12 }}>
            <button
              className="btn"
              onClick={() => void navigator.clipboard.writeText(JSON.stringify(receipt))}
            >
              Copy package
            </button>
          </div>
        </section>
      )}

      <section className="panel">
        <h2>Accept a payment</h2>
        <p>
          Payee: paste the JSON package. This calls <code>internalizeAction</code> with
          BRC-29 <code>wallet payment</code> remittance so the billed sats land in this wallet.
        </p>
        <textarea rows={6} value={incoming} onChange={(event) => setIncoming(event.target.value)} />
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={!wallet || !incoming.trim() || busy} onClick={() => void accept()}>
            Internalize payment
          </button>
        </div>
      </section>

      {status && <p className="status ok">{status}</p>}
      {error && <p className="status err">{error}</p>}

      <section className="panel">
        <h2>Overlay URL</h2>
        <p>
          The page is static (GitHub Pages later). Point it at a reachable
          overlay-express node. Default is <code>http://localhost:8081</code>.
        </p>
        <input value={url} onChange={(event) => setUrl(event.target.value)} />
      </section>

      <footer>
        BSV only. Needs BSV Desktop or BSV Browser. The app calls createAction,
        getPublicKey, listOutputs, signAction, and internalizeAction. Keys stay
        in the wallet. This is not Request Finance on 18 chains.
      </footer>
    </div>
  )
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
