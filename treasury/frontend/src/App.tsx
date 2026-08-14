import { useEffect, useMemo, useState } from 'react'
import {
  FEE_SATS,
  ROLE_LABEL,
  heldRoles,
  nextOpenRole,
  shortKey,
  thresholdMet,
  uniqueApprovers,
  vaultKeyID,
  type Role
} from '../../protocol/treasury'
import { downloadCsv, downloadPdf } from '../../protocol/export'
import { fundGate, inviteHeadline, proposeGate } from '../../protocol/events'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  createTreasury,
  getTreasury,
  joinTreasury,
  pingOverlay,
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
import { pullSignerMessages } from './lib/messagebox'
import { rememberEvents } from './lib/overlay'
import {
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

function mySeats(treasury: Treasury, identityKey: string | null) {
  return heldRoles(treasury.signers, identityKey)
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

  const seats = treasury ? mySeats(treasury, identityKey) : []
  const joinable = treasury ? openSeat(treasury, identityKey) : undefined
  const invite = treasury ? inviteHeadline(treasury) : null
  const fund = fundGate({ wallet, treasury, busy: Boolean(busy) })
  const propose = proposeGate({ wallet, treasury, busy: Boolean(busy) })
  const vaultSats = useMemo(
    () => treasury?.vault.reduce((sum, utxo) => sum + utxo.satoshis, 0) ?? 0,
    [treasury]
  )

  const refresh = async (id = treasuryId): Promise<void> => {
    if (!id) return
    const next = await getTreasury(id)
    if (!next) {
      setTreasury(null)
      throw new Error('No policy-treasury tokens for that id on ls_anytx yet')
    }
    setTreasury(next)
    setTreasuryId(next.id)
    localStorage.setItem(TREASURY_STORAGE_KEY, next.id)
  }

  useEffect(() => {
    void pingOverlay().then(setOnline)
  }, [])

  useEffect(() => {
    if (!treasuryId) return
    void refresh(treasuryId).catch((err) => setFail(errorMessage(err)))
  }, [treasuryId])

  useEffect(() => {
    if (!wallet || !treasuryId) return
    void pullSignerMessages(wallet).then((events) => {
      if (events.length === 0) return
      rememberEvents(treasuryId, events)
      return refresh(treasuryId)
    }).catch((err) => setFail(errorMessage(err)))
  }, [wallet, treasuryId])

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
            Board minutes are public on overlay — a wallet is only needed to act.
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
        {online ? 'overlay-us-1 online' : online === false ? 'overlay-us-1 unreachable — cached minutes still show' : 'checking overlay-us-1'}
        {' · tm_anytx / ls_anytx · Message Box gmb.bsvblockchain.tech'}
        {seats.length ? ` · you are ${seats.map((role) => ROLE_LABEL[role]).join(', ')}` : ''}
      </p>

      {fail && <div className="status err">{fail}</div>}
      {notice && <div className="status ok">{notice}</div>}
      {busy && <div className="status">{busy}</div>}

      <div className="grid">
        <div>
          <section className="panel">
            <h2>1. Create a treasury</h2>
            <p>Name the board and invite two other signers. 2-of-2 is allowed if you skip the bookkeeper. Creating publishes a 1-sat PushDrop on tm_anytx.</p>
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
            <input value={inviteTreasurer} onChange={(event) => setInviteTreasurer(event.target.value)} placeholder="leave blank to use the connected wallet" />
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
                disabled={!wallet || !identityKey || Boolean(busy)}
                onClick={() => void run('Creating treasury…', async () => {
                  if (!wallet || !identityKey) throw new Error('Connect a BSV wallet to create a treasury')
                  const created = await createTreasury(wallet, {
                    name,
                    signerCount,
                    treasurerIdentityKey: inviteTreasurer || identityKey,
                    signers: [
                      { role: 'treasurer', identityKey: inviteTreasurer || identityKey },
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
                  setNotice(`Created ${created.name}. ${inviteHeadline(created) ?? 'Board is complete'}.`)
                })}
              >
                Create treasury
              </button>
              <button
                className={invite ? 'btn primary' : 'btn'}
                disabled={!treasury}
                onClick={() => void copyInvite()}
              >
                Copy invite link
              </button>
            </div>
          </section>

          {treasury && invite && (
            <section className="panel">
              <h2>{invite}</h2>
              <p>
                The 2-of-{treasury.signers.length} vault does not exist until every seat has joined.
                Copy the invite link and send it to the empty seats. Fund stays locked until then.
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => void copyInvite()}>
                  Copy invite link
                </button>
              </div>
            </section>
          )}

          <section className="panel">
            <h2>2. Join as a signer</h2>
            <p>Connect a wallet and join an open seat. One wallet may hold more than one remaining seat. The app asks for a derived vault pubkey; it never sees a private key. Anyone can load `?treasury=` without connecting.</p>
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
                  if (!wallet || !identityKey || !joinable || !treasury) return
                  const keyID = vaultKeyID(treasury.id, joinable.role, identityKey, treasury.signers)
                  const derived = await derivedVaultKey(wallet, keyID)
                  const next = await joinTreasury(wallet, treasury, {
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
              Anyone with sats can fund once every seat has joined. Current vault: {vaultSats.toLocaleString()} sats.
            </p>
            {fund.reason && <p className="hint">{fund.reason}</p>}
            {!fund.reason && vaultSats === 0 && (
              <p className="hint">Empty vault — fund from this wallet.</p>
            )}
            <label>Amount (sats)</label>
            <input value={fundSats} onChange={(event) => setFundSats(event.target.value)} />
            <div className="row">
              <button
                className="btn primary"
                disabled={fund.disabled}
                title={fund.reason || undefined}
                onClick={() => void run('Funding vault…', async () => {
                  if (!wallet || !treasury) return
                  const funded = await fundVault(wallet, treasury, Number(fundSats))
                  const next = await recordFund(wallet, treasury, {
                    satoshis: funded.satoshis,
                    txid: funded.txid,
                    vout: funded.vout,
                    beef: funded.beef,
                    lockingScriptHex: treasury.lockingScriptHex as string
                  })
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
            {propose.reason && <p className="hint">{propose.reason}</p>}
            <div className="row">
              <button
                className="btn primary"
                disabled={propose.disabled}
                title={propose.reason || undefined}
                onClick={() => void run('Proposing…', async () => {
                  if (!wallet || !identityKey || !treasury) return
                  if (!isIdentityKey(payee)) throw new Error('Payee must be a 66-hex identity key')
                  const proposalId = newId()
                  const payeeLockingScriptHex = await lockPayeeOutput(wallet, payee, proposalId, memo)
                  const proposeRole = heldRoles(treasury.signers, identityKey)[0]
                  const keyID = proposeRole
                    ? vaultKeyID(treasury.id, proposeRole, identityKey, treasury.signers)
                    : treasury.id
                  const derivedPubkey = await derivedVaultKey(wallet, keyID)
                  const signature = await signProposal(wallet, {
                    v: 1,
                    treasuryId: treasury.id,
                    proposalId,
                    amountSats: Number(amountSats),
                    payeeIdentityKey: payee,
                    memo,
                    payeeLockingScriptHex
                  }, keyID)
                  const next = await postProposal(wallet, treasury, {
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
                  setNotice('Proposal posted. A remaining role still needs to approve.')
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
            <p>
              Reconstructed from 1-sat PushDrop announcements on overlay-us-1
              (`tm_anytx` / `ls_anytx`). The P2MS vault UTXO itself is not a PushDrop,
              so it does not appear in the lookup — only these event tokens do.
            </p>
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
              <p className="hint">Nothing yet. Create a treasury to start the minute book, or open an invite link.</p>
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
                  const role = nextOpenRole(heldRoles(treasury.signers, identityKey), proposal.approvals)
                  if (!role) throw new Error('Every seat you hold has already approved')
                  const keyID = vaultKeyID(treasury.id, role, identityKey, treasury.signers)
                  const derivedPubkey = await derivedVaultKey(wallet, keyID)
                  const signature = await signProposal(wallet, {
                    v: 1,
                    treasuryId: treasury.id,
                    proposalId: proposal.id,
                    amountSats: proposal.amountSats,
                    payeeIdentityKey: proposal.payeeIdentityKey,
                    memo: proposal.memo,
                    payeeLockingScriptHex: proposal.payeeLockingScriptHex
                  }, keyID)
                  setTreasury(await postApproval(wallet, treasury, {
                    proposalId: proposal.id,
                    identityKey,
                    derivedPubkey,
                    signature,
                    memo: proposal.memo,
                    role
                  }))
                })}
                onVaultSign={() => void run('Signing vault…', async () => {
                  if (!wallet || !identityKey || !treasury) return
                  const role = nextOpenRole(heldRoles(treasury.signers, identityKey), proposal.p2msSigs)
                  if (!role) throw new Error('Every seat you hold has already signed the vault')
                  const keyID = vaultKeyID(treasury.id, role, identityKey, treasury.signers)
                  const derivedPubkey = await derivedVaultKey(wallet, keyID)
                  const signature = await signVaultSpend(wallet, treasury, proposal, keyID)
                  setTreasury(await postP2msSig(wallet, treasury, {
                    proposalId: proposal.id,
                    identityKey,
                    derivedPubkey,
                    signature,
                    memo: proposal.memo,
                    role
                  }))
                })}
                onPay={() => void run('Broadcasting payment…', async () => {
                  if (!wallet || !treasury) return
                  const paid = await broadcastVaultSpend(wallet, treasury, proposal)
                  setTreasury(await postPaid(wallet, treasury, {
                    proposalId: proposal.id,
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
            <p>CSV and PDF are built in this browser from the reconstructed board. No Express export route.</p>
            <label>Month</label>
            <input value={month} onChange={(event) => setMonth(event.target.value)} placeholder="YYYY-MM" />
            <div className="row">
              <button
                className="btn"
                disabled={!treasury}
                onClick={() => treasury && downloadCsv(treasury, month)}
              >
                CSV
              </button>
              <button
                className="btn primary"
                disabled={!treasury}
                onClick={() => treasury && downloadPdf(treasury, month)}
              >
                PDF
              </button>
            </div>
          </section>
        </div>
      </div>

      <footer>
        Needs BSV Desktop or BSV Browser to create, join, fund, propose, approve, or pay.
        Reading `?treasury=` minutes uses ls_anytx only. Private keys never leave the wallet.
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
  const held = heldRoles(treasury.signers, identityKey)
  const nextApprove = nextOpenRole(held, proposal.approvals)
  const nextVault = nextOpenRole(held, proposal.p2msSigs)
  const approvedEnough = thresholdMet(uniqueApprovers(proposal.approvals).length, treasury.threshold)
  const signedEnough = uniqueApprovers(proposal.p2msSigs).length >= treasury.threshold
  const already = Boolean(identityKey) && (!nextApprove || approvedEnough)
  const signedVault = Boolean(identityKey) && (!nextVault || signedEnough)
  const priorApprove = held.some((role) => proposal.approvals.some((row) => row.role === role))
  const priorVault = held.some((role) => proposal.p2msSigs.some((row) => row.role === role))
  const approveLabel = already
    ? 'Approved'
    : priorApprove && nextApprove
      ? `Approve as ${ROLE_LABEL[nextApprove]}`
      : 'Approve'
  const vaultLabel = signedVault
    ? 'Vault signed'
    : priorVault && nextVault
      ? `Sign vault as ${ROLE_LABEL[nextVault]}`
      : 'Sign vault spend'
  const canPay = proposal.status !== 'paid' && uniqueApprovers(proposal.p2msSigs).length >= treasury.threshold
  return (
    <article className="proposal">
      <h3>{proposal.amountSats.toLocaleString()} sats</h3>
      <p>{proposal.memo}</p>
      <p className="meta">
        To {shortKey(proposal.payeeIdentityKey, 10)} · {proposal.status} ·
        {' '}{uniqueApprovers(proposal.approvals).length}/{treasury.threshold} approvals ·
        {' '}{uniqueApprovers(proposal.p2msSigs).length}/{treasury.threshold} vault signatures
      </p>
      {proposal.txid && <p className="meta">txid {proposal.txid}</p>}
      <div className="row">
        {proposal.status !== 'paid' && (
          <button className="btn" disabled={disabled || already} onClick={onApprove}>
            {approveLabel}
          </button>
        )}
        {proposal.status === 'approved' && (
          <button className="btn" disabled={disabled || signedVault} onClick={onVaultSign}>
            {vaultLabel}
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
