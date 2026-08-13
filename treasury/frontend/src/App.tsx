import { useEffect, useMemo, useState } from 'react'
import {
  FEE_SATS,
  ROLE_LABEL,
  shortKey,
  type Role
} from '../../protocol/treasury'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  createTreasury,
  exportCsvUrl,
  exportPdfUrl,
  getTreasury,
  joinTreasury,
  pingFeed,
  postApproval,
  postP2msSig,
  postPaid,
  postProposal,
  recordFund,
  type Proposal,
  type Treasury
} from './lib/api'
import {
  derivedVaultKey,
  fundVault,
  isIdentityKey,
  lockPayeeOutput,
  signProposal,
  signVaultSpend,
  broadcastVaultSpend
} from './lib/actions'
import {
  DEFAULT_FEED_URL,
  FEED_STORAGE_KEY,
  TREASURY_STORAGE_KEY,
  errorMessage,
  newId
} from './lib/config'

function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback
  } catch {
    return fallback
  }
}

function monthNow(): string {
  return new Date().toISOString().slice(0, 7)
}

function mySeat(treasury: Treasury, identityKey: string | null) {
  if (!identityKey) return undefined
  return treasury.signers.find((signer) => signer.identityKey.toLowerCase() === identityKey.toLowerCase())
}

function openSeat(treasury: Treasury, identityKey: string | null) {
  if (!identityKey) return undefined
  return treasury.signers.find((signer) => {
    if (signer.derivedPubkey) return false
    if (!signer.identityKey) return true
    return signer.identityKey.toLowerCase() === identityKey.toLowerCase()
  })
}

function Shell() {
  const { wallet, identityKey, connecting, error, connect } = useWallet()
  const [feedUrl, setFeedUrl] = useState(() => stored(FEED_STORAGE_KEY, DEFAULT_FEED_URL))
  const [online, setOnline] = useState<boolean | null>(null)
  const [treasuryId, setTreasuryId] = useState(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('treasury')
    return fromUrl || stored(TREASURY_STORAGE_KEY, '')
  })
  const [treasury, setTreasury] = useState<Treasury | null>(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [fail, setFail] = useState('')
  const [copied, setCopied] = useState(false)

  const [name, setName] = useState('Demo Club')
  const [signerCount, setSignerCount] = useState<2 | 3>(3)
  const [inviteTreasurer, setInviteTreasurer] = useState('')
  const [inviteChair, setInviteChair] = useState('')
  const [inviteBookkeeper, setInviteBookkeeper] = useState('')
  const [fundSats, setFundSats] = useState('20000')
  const [amountSats, setAmountSats] = useState('12000')
  const [payee, setPayee] = useState('')
  const [memo, setMemo] = useState('hall hire')
  const [month, setMonth] = useState(monthNow())

  const seat = treasury ? mySeat(treasury, identityKey) : undefined
  const joinable = treasury ? openSeat(treasury, identityKey) : undefined
  const vaultSats = useMemo(
    () => treasury?.vault.reduce((sum, utxo) => sum + utxo.satoshis, 0) ?? 0,
    [treasury]
  )

  const refresh = async (id = treasuryId): Promise<void> => {
    if (!id) return
    const next = await getTreasury(feedUrl, id)
    setTreasury(next)
    setTreasuryId(next.id)
    localStorage.setItem(TREASURY_STORAGE_KEY, next.id)
  }

  useEffect(() => {
    localStorage.setItem(FEED_STORAGE_KEY, feedUrl)
    void pingFeed(feedUrl).then(setOnline)
  }, [feedUrl])

  useEffect(() => {
    if (!treasuryId) return
    void refresh(treasuryId).catch((err) => setFail(errorMessage(err)))
  }, [treasuryId, feedUrl])

  const run = async (label: string, work: () => Promise<void>): Promise<void> => {
    setBusy(label)
    setFail('')
    setNotice('')
    try {
      await work()
    } catch (err) {
      setFail(errorMessage(err))
    } finally {
      setBusy('')
    }
  }

  const copyIdentity = async (): Promise<void> => {
    if (!identityKey) return
    await navigator.clipboard.writeText(identityKey)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }

  const copyInvite = async (): Promise<void> => {
    if (!treasury) return
    const url = `${window.location.origin}${window.location.pathname}?treasury=${treasury.id}`
    await navigator.clipboard.writeText(url)
    setNotice('Invite link copied. Chair and bookkeeper open it, connect, and join.')
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">BRC-100 · BRC-47 P2MS</p>
          <h1>Policy treasury</h1>
          <p className="lede">
            Not one person’s wallet. Treasurer, chair, and bookkeeper hold a
            2-of-3 BSV vault. The app proposes; keys stay in BSV Desktop or BSV Browser.
          </p>
        </div>
        <div className="identity">
          {connecting && <div>Connecting BSV wallet…</div>}
          {identityKey && (
            <>
              Identity key
              <code>{shortKey(identityKey, 12)}</code>
              <button className="btn" style={{ marginTop: 8 }} onClick={() => void copyIdentity()}>
                {copied ? 'Copied' : 'Copy identity key'}
              </button>
            </>
          )}
          {error && (
            <>
              <div className="status err">{error}</div>
              <button className="btn" onClick={() => void connect()}>Retry wallet</button>
            </>
          )}
          {!connecting && !identityKey && !error && (
            <button className="btn primary" onClick={() => void connect()}>Connect BSV wallet</button>
          )}
        </div>
      </header>

      <p className="banner">
        Board feed {online ? 'online' : online === false ? 'offline — start docker compose' : 'checking'} · {feedUrl}
        {seat ? ` · you are ${ROLE_LABEL[seat.role]}` : ''}
      </p>

      {fail && <div className="status err">{fail}</div>}
      {notice && <div className="status ok">{notice}</div>}
      {busy && <div className="status">{busy}</div>}

      <div className="grid">
        <div>
          <section className="panel">
            <h2>1. Create a treasury</h2>
            <p>Name the board and invite two other signers. 2-of-2 is allowed if you skip the bookkeeper.</p>
            <label>Name</label>
            <input value={name} onChange={(event) => setName(event.target.value)} />
            <label>Signers</label>
            <select
              value={signerCount}
              onChange={(event) => setSignerCount(Number(event.target.value) === 2 ? 2 : 3)}
            >
              <option value={3}>2-of-3 (treasurer, chair, bookkeeper)</option>
              <option value={2}>2-of-2 (treasurer, chair)</option>
            </select>
            <label>Treasurer identity key (optional)</label>
            <input value={inviteTreasurer} onChange={(event) => setInviteTreasurer(event.target.value)} placeholder="leave blank to fill on join" />
            <label>Chair identity key (optional)</label>
            <input value={inviteChair} onChange={(event) => setInviteChair(event.target.value)} />
            {signerCount === 3 && (
              <>
                <label>Bookkeeper identity key (optional)</label>
                <input value={inviteBookkeeper} onChange={(event) => setInviteBookkeeper(event.target.value)} />
              </>
            )}
            <div className="row">
              <button
                className="btn primary"
                disabled={Boolean(busy)}
                onClick={() => void run('Creating treasury…', async () => {
                  const created = await createTreasury(feedUrl, {
                    name,
                    signerCount,
                    signers: [
                      { role: 'treasurer', identityKey: inviteTreasurer || identityKey || undefined },
                      { role: 'chair', identityKey: inviteChair || undefined },
                      ...(signerCount === 3
                        ? [{ role: 'bookkeeper' as Role, identityKey: inviteBookkeeper || undefined }]
                        : [])
                    ]
                  })
                  setTreasury(created)
                  setTreasuryId(created.id)
                  const url = new URL(window.location.href)
                  url.searchParams.set('treasury', created.id)
                  window.history.replaceState({}, '', url)
                  setNotice(`Created ${created.name}. Invite the other signers.`)
                })}
              >
                Create treasury
              </button>
              <button className="btn" disabled={!treasury} onClick={() => void copyInvite()}>
                Copy invite link
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>2. Join as a signer</h2>
            <p>Each seat connects their own wallet. The app asks for a derived vault pubkey; it never sees a private key.</p>
            <label>Treasury id</label>
            <input value={treasuryId} onChange={(event) => setTreasuryId(event.target.value.trim())} />
            <div className="row">
              <button className="btn" disabled={!treasuryId || Boolean(busy)} onClick={() => void run('Loading…', () => refresh())}>
                Load
              </button>
              <button
                className="btn primary"
                disabled={!wallet || !identityKey || !joinable || Boolean(busy)}
                onClick={() => void run('Joining…', async () => {
                  if (!wallet || !identityKey || !joinable) return
                  const derived = await derivedVaultKey(wallet, treasuryId)
                  const next = await joinTreasury(feedUrl, treasuryId, {
                    role: joinable.role,
                    identityKey,
                    derivedPubkey: derived
                  })
                  setTreasury(next)
                  setNotice(`Joined as ${ROLE_LABEL[joinable.role]}.`)
                })}
              >
                Join{joinable ? ` as ${ROLE_LABEL[joinable.role]}` : ''}
              </button>
            </div>
            {treasury && treasury.signers.map((signer) => (
              <div className="seat" key={signer.role}>
                <div>
                  <strong>{ROLE_LABEL[signer.role]}</strong>
                  <span className="meta">
                    {signer.identityKey ? shortKey(signer.identityKey, 10) : 'awaiting invite'}
                  </span>
                </div>
                <div className="meta">{signer.derivedPubkey ? 'joined' : 'not joined'}</div>
              </div>
            ))}
          </section>

          <section className="panel">
            <h2>3. Fund the vault</h2>
            <p>
              Pays a BRC-47 2-of-{treasury?.signers.length ?? 3} locking script.
              Anyone with sats can fund. Current vault: {vaultSats.toLocaleString()} sats.
            </p>
            <label>Amount (sats)</label>
            <input value={fundSats} onChange={(event) => setFundSats(event.target.value)} />
            <div className="row">
              <button
                className="btn primary"
                disabled={!wallet || !treasury?.lockingScriptHex || Boolean(busy)}
                onClick={() => void run('Funding vault…', async () => {
                  if (!wallet || !treasury) return
                  const funded = await fundVault(wallet, treasury, Number(fundSats))
                  const next = await recordFund(feedUrl, treasury.id, funded)
                  setTreasury(next)
                  setNotice(`Funded ${funded.satoshis.toLocaleString()} sats.`)
                })}
              >
                Fund from this wallet
              </button>
            </div>
          </section>

          <section className="panel">
            <h2>4. Propose a payment</h2>
            <p>Amount in sats, payee identity key, and a memo the board can read. The proposer signs first.</p>
            <label>Amount (sats)</label>
            <input value={amountSats} onChange={(event) => setAmountSats(event.target.value)} />
            <label>Payee identity key</label>
            <input value={payee} onChange={(event) => setPayee(event.target.value)} placeholder="02… or 03…" />
            <label>Memo</label>
            <input value={memo} onChange={(event) => setMemo(event.target.value)} />
            <p className="hint">Fee is {FEE_SATS} sats, taken from the vault. Change returns to the same 2-of-n script.</p>
            <div className="row">
              <button
                className="btn primary"
                disabled={!wallet || !identityKey || !treasury || Boolean(busy)}
                onClick={() => void run('Proposing…', async () => {
                  if (!wallet || !identityKey || !treasury) return
                  if (!isIdentityKey(payee)) throw new Error('Payee must be a 66-hex identity key')
                  const proposalId = newId()
                  const payeeLockingScriptHex = await lockPayeeOutput(wallet, payee, proposalId, memo)
                  const derivedPubkey = await derivedVaultKey(wallet, treasury.id)
                  const signature = await signProposal(wallet, {
                    v: 1,
                    treasuryId: treasury.id,
                    proposalId,
                    amountSats: Number(amountSats),
                    payeeIdentityKey: payee,
                    memo,
                    payeeLockingScriptHex
                  })
                  const next = await postProposal(feedUrl, treasury.id, {
                    proposalId,
                    identityKey,
                    derivedPubkey,
                    amountSats: Number(amountSats),
                    payeeIdentityKey: payee,
                    memo,
                    payeeLockingScriptHex,
                    signature
                  })
                  setTreasury(next)
                  setNotice('Proposal posted. The other signer approves next.')
                })}
              >
                Propose
              </button>
            </div>
          </section>
        </div>

        <div>
          <section className="panel">
            <h2>Board feed</h2>
            <p>Plain-language log of proposals, approvals, and payments. This is a local feed server, not overlay-express.</p>
            {treasury?.feed.length ? (
              <ol className="feed">
                {treasury.feed.map((event) => (
                  <li key={event.id}>
                    <time>{event.at.replace('T', ' ').slice(0, 16)}</time>
                    {event.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="hint">Nothing yet. Create a treasury to start the minute book.</p>
            )}
          </section>

          <section className="panel">
            <h2>5. Approve and pay</h2>
            {treasury?.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                treasury={treasury}
                identityKey={identityKey}
                disabled={!wallet || Boolean(busy)}
                onApprove={() => void run('Approving…', async () => {
                  if (!wallet || !identityKey || !treasury) return
                  const derivedPubkey = await derivedVaultKey(wallet, treasury.id)
                  const signature = await signProposal(wallet, {
                    v: 1,
                    treasuryId: treasury.id,
                    proposalId: proposal.id,
                    amountSats: proposal.amountSats,
                    payeeIdentityKey: proposal.payeeIdentityKey,
                    memo: proposal.memo,
                    payeeLockingScriptHex: proposal.payeeLockingScriptHex
                  })
                  setTreasury(await postApproval(feedUrl, treasury.id, proposal.id, {
                    identityKey,
                    derivedPubkey,
                    signature
                  }))
                })}
                onVaultSign={() => void run('Signing vault…', async () => {
                  if (!wallet || !identityKey || !treasury) return
                  const derivedPubkey = await derivedVaultKey(wallet, treasury.id)
                  const signature = await signVaultSpend(wallet, treasury, proposal)
                  setTreasury(await postP2msSig(feedUrl, treasury.id, proposal.id, {
                    identityKey,
                    derivedPubkey,
                    signature
                  }))
                })}
                onPay={() => void run('Broadcasting payment…', async () => {
                  if (!wallet || !treasury) return
                  const paid = await broadcastVaultSpend(wallet, treasury, proposal)
                  setTreasury(await postPaid(feedUrl, treasury.id, proposal.id, {
                    txid: paid.txid,
                    changeVout: paid.changeVout,
                    beef: paid.tx
                  }))
                  setNotice(`Paid. txid ${paid.txid}`)
                })}
              />
            ))}
            {!treasury?.proposals.length && <p className="hint">No proposals yet.</p>}
          </section>

          <section className="panel">
            <h2>6. Export the month</h2>
            <label>Month</label>
            <input value={month} onChange={(event) => setMonth(event.target.value)} placeholder="YYYY-MM" />
            <div className="row">
              <a
                className="btn"
                href={treasury ? exportCsvUrl(feedUrl, treasury.id, month) : '#'}
              >
                CSV
              </a>
              <a
                className="btn primary"
                href={treasury ? exportPdfUrl(feedUrl, treasury.id, month) : '#'}
              >
                PDF
              </a>
            </div>
          </section>

          <section className="panel">
            <h2>Feed URL</h2>
            <p>Point this UI at the Dockerized board server (default localhost:8080).</p>
            <input value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} />
          </section>
        </div>
      </div>

      <footer>
        Needs BSV Desktop or BSV Browser. The app calls waitForAuthentication,
        getPublicKey, createSignature, and createAction. Private keys never leave the wallet.
      </footer>
    </div>
  )
}

function ProposalCard(props: {
  proposal: Proposal
  treasury: Treasury
  identityKey: string | null
  disabled: boolean
  onApprove: () => void
  onVaultSign: () => void
  onPay: () => void
}) {
  const { proposal, treasury, identityKey, disabled, onApprove, onVaultSign, onPay } = props
  const already = proposal.approvals.some(
    (row) => identityKey && row.identityKey === identityKey.toLowerCase()
  )
  const signedVault = proposal.p2msSigs.some(
    (row) => identityKey && row.identityKey === identityKey.toLowerCase()
  )
  const canPay = proposal.status !== 'paid' && proposal.p2msSigs.length >= treasury.threshold
  return (
    <article className="proposal">
      <h3>{proposal.amountSats.toLocaleString()} sats</h3>
      <p>{proposal.memo}</p>
      <p className="meta">
        To {shortKey(proposal.payeeIdentityKey, 10)} · {proposal.status} ·
        {' '}{proposal.approvals.length}/{treasury.threshold} approvals ·
        {' '}{proposal.p2msSigs.length}/{treasury.threshold} vault signatures
      </p>
      {proposal.txid && <p className="meta">txid {proposal.txid}</p>}
      <div className="row">
        {proposal.status !== 'paid' && (
          <button className="btn" disabled={disabled || already} onClick={onApprove}>
            {already ? 'Approved' : 'Approve'}
          </button>
        )}
        {proposal.status === 'approved' && (
          <button className="btn" disabled={disabled || signedVault} onClick={onVaultSign}>
            {signedVault ? 'Vault signed' : 'Sign vault spend'}
          </button>
        )}
        {canPay && (
          <button className="btn primary" disabled={disabled} onClick={onPay}>
            Broadcast pay
          </button>
        )}
      </div>
    </article>
  )
}

export default function App() {
  return (
    <WalletProvider>
      <Shell />
    </WalletProvider>
  )
}
