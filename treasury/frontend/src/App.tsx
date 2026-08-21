import { useEffect, useMemo, useState } from 'react'
import {
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
import {
  DEMO_CLUB_CREATE_TX,
  DEMO_CLUB_ID,
  minutesAgo,
  minutesEmptyCopy,
  resolveCreateTxid,
  type OverlayLookupStatus
} from '../../protocol/lookup'
import {
  boardBanner,
  minutesAsDocument,
  motionSentence,
  motionStatusWord,
  pageTitle,
  spendSentence
} from './lib/copy'
import {
  displayUsd,
  fetchUsdPerBsv,
  formatUsd,
  formatUsdInput,
  parseUsdAmount,
  satsToUsd,
  usdToSats
} from '../../protocol/money'
import { WalletProvider, useWallet } from './context/WalletContext'
import {
  createTreasury,
  getTreasury,
  joinTreasury,
  postApproval,
  postDecline,
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
import { readCreatedTxid, rememberEvents } from './lib/overlay'
import {
  TREASURY_STORAGE_KEY,
  boardHref,
  errorMessage,
  newId
} from './lib/config'

function monthNow(): string {
  return new Date().toISOString().slice(0, 7)
}

function urlParam(name: string): string {
  return new URLSearchParams(window.location.search).get(name) || ''
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

function payeeOnBoard(proposal: Proposal): string {
  if (proposal.payeeName?.trim()) return proposal.payeeName.trim()
  return 'a payee'
}

function proposalAmount(proposal: Proposal, rate: number | null): string {
  return displayUsd(proposal.amountUsd, proposal.amountSats, rate)
}

function Shell() {
  const { wallet, identityKey, connecting, error, connect } = useWallet()
  const fromUrl = urlParam('treasury')
  const [treasuryId, setTreasuryId] = useState(() => fromUrl)
  const [lookupDraft, setLookupDraft] = useState('')
  const [createdTxid, setCreatedTxid] = useState(() =>
    urlParam('tx') || (fromUrl ? readCreatedTxid(fromUrl) : undefined) || resolveCreateTxid(fromUrl) || ''
  )
  const [treasury, setTreasury] = useState<Treasury | null>(null)
  const [overlayStatus, setOverlayStatus] = useState<OverlayLookupStatus>(fromUrl ? 'checking' : 'online')
  const [usedCache, setUsedCache] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [fail, setFail] = useState('')
  const [toolsOpen, setToolsOpen] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [inviteNext, setInviteNext] = useState(false)

  const [name, setName] = useState('Demo Club')
  const [signerCount, setSignerCount] = useState<2 | 3>(3)
  const [inviteTreasurer, setInviteTreasurer] = useState('')
  const [inviteChair, setInviteChair] = useState('')
  const [inviteBookkeeper, setInviteBookkeeper] = useState('')
  const [fundUsd, setFundUsd] = useState('25.00')
  const [amountUsd, setAmountUsd] = useState('25.00')
  const [payeeName, setPayeeName] = useState('')
  const [payee, setPayee] = useState('')
  const [memo, setMemo] = useState('hall hire')
  const [month, setMonth] = useState(monthNow())
  const [usdPerBsv, setUsdPerBsv] = useState<number | null>(null)
  const [rateError, setRateError] = useState('')

  const boardMode = Boolean(treasuryId)
  const seats = treasury ? mySeats(treasury, identityKey) : []
  const vacant = treasury?.signers.find((signer) => !signer.derivedPubkey)
  const joinable = treasury ? openSeat(treasury, identityKey) ?? vacant : undefined
  const invite = treasury ? inviteHeadline(treasury) : null
  const fund = fundGate({ wallet, treasury, busy: Boolean(busy) })
  const propose = proposeGate({ wallet, treasury, busy: Boolean(busy) })
  const vaultSats = useMemo(
    () => treasury?.vault.reduce((sum, utxo) => sum + utxo.satoshis, 0) ?? 0,
    [treasury]
  )
  const vaultUsd = usdPerBsv ? formatUsd(satsToUsd(vaultSats, usdPerBsv)) : null
  const hasMinutes = Boolean(treasury?.feed.length)
  const emptyCopy = minutesEmptyCopy({
    status: overlayStatus,
    hasMinutes,
    usedCache
  })
  const banner = boardBanner({
    boardMode,
    status: overlayStatus,
    usedCache,
    hasMinutes
  })
  const minutes = treasury ? minutesAsDocument(treasury.feed) : []
  const openProposals = treasury?.proposals.filter((proposal) => proposal.status === 'open' || proposal.status === 'approved') ?? []

  useEffect(() => {
    document.title = pageTitle(treasury?.name)
  }, [treasury?.name])

  const adopt = (next: Treasury, txid?: string): void => {
    setTreasury(next)
    setTreasuryId(next.id)
    localStorage.setItem(TREASURY_STORAGE_KEY, next.id)
    if (txid) setCreatedTxid(txid)
    const url = new URL(window.location.href)
    url.searchParams.set('treasury', next.id)
    const linkTx = txid || createdTxid || readCreatedTxid(next.id)
    if (linkTx) url.searchParams.set('tx', linkTx)
    window.history.replaceState({}, '', url)
  }

  const refresh = async (id = treasuryId): Promise<void> => {
    if (!id) return
    setOverlayStatus('checking')
    const load = await getTreasury(id, { txid: createdTxid || urlParam('tx') || readCreatedTxid(id) })
    setOverlayStatus(load.status)
    setUsedCache(load.usedCache)
    if (load.createdTxid) setCreatedTxid(load.createdTxid)
    if (load.error && !load.treasury) setFail(load.error)
    if (load.treasury) {
      setTreasury(load.treasury)
      setTreasuryId(load.treasury.id)
      localStorage.setItem(TREASURY_STORAGE_KEY, load.treasury.id)
      return
    }
    setTreasury((current) => (current && current.id === id ? current : null))
  }

  useEffect(() => {
    let cancelled = false
    void fetchUsdPerBsv()
      .then((rate) => {
        if (!cancelled) {
          setUsdPerBsv(rate)
          setRateError('')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setRateError(errorMessage(err))
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!treasuryId) return
    void refresh(treasuryId).catch((err) => {
      setOverlayStatus('failed')
      setFail(errorMessage(err))
    })
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

  const ensureWallet = async () => {
    if (wallet && identityKey) return { wallet, identityKey }
    return connect()
  }

  const dollarsToSats = async (raw: string): Promise<{ usd: number; sats: number; amountUsd: string }> => {
    let rate = usdPerBsv
    if (!rate) {
      rate = await fetchUsdPerBsv()
      setUsdPerBsv(rate)
      setRateError('')
    }
    const usd = parseUsdAmount(raw)
    return { usd, sats: usdToSats(usd, rate), amountUsd: formatUsdInput(usd) }
  }

  const copyInvite = async (): Promise<void> => {
    if (!treasury) return
    const tx = createdTxid || readCreatedTxid(treasury.id) || resolveCreateTxid(treasury.id)
    await navigator.clipboard.writeText(boardHref(treasury.id, tx))
    setNotice('Invite link copied. Chair and bookkeeper open it — they can read minutes without a wallet.')
  }

  const onApprove = async (proposal: Proposal): Promise<void> => {
    await run('Approving…', async () => {
      const session = await ensureWallet()
      if (!treasury) return
      const role = nextOpenRole(heldRoles(treasury.signers, session.identityKey), proposal.approvals)
      if (!role) throw new Error('Every seat you hold has already approved')
      const keyID = vaultKeyID(treasury.id, role, session.identityKey, treasury.signers)
      const derivedPubkey = await derivedVaultKey(session.wallet, keyID)
      const signature = await signProposal(session.wallet, {
        v: 1,
        treasuryId: treasury.id,
        proposalId: proposal.id,
        amountSats: proposal.amountSats,
        payeeIdentityKey: proposal.payeeIdentityKey,
        memo: proposal.memo,
        payeeLockingScriptHex: proposal.payeeLockingScriptHex
      }, keyID)
      adopt(await postApproval(session.wallet, treasury, {
        proposalId: proposal.id,
        identityKey: session.identityKey,
        derivedPubkey,
        signature,
        memo: proposal.memo,
        role
      }))
    })
  }

  const onDecline = async (proposal: Proposal): Promise<void> => {
    await run('Declining…', async () => {
      const session = await ensureWallet()
      if (!treasury) return
      const role = heldRoles(treasury.signers, session.identityKey)[0]
      if (!role) throw new Error('Join this board before declining a proposal')
      adopt(await postDecline(session.wallet, treasury, {
        proposalId: proposal.id,
        identityKey: session.identityKey,
        memo: proposal.memo,
        role
      }))
    })
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <p className="eyebrow">{boardMode ? 'Board' : 'Treasury'}</p>
          <h1>{treasury?.name || (boardMode ? 'Board' : 'Treasury')}</h1>
          <p className="lede">
            {boardMode
              ? 'Two people have to say yes.'
              : 'A board anyone can read.'}
          </p>
        </div>
        {identityKey && (
          <div className="identity">
            You are {seats.length ? seats.map((role) => ROLE_LABEL[role]).join(', ') : 'connected'}
          </div>
        )}
      </header>

      {banner && (
        <p className={`banner ${overlayStatus}`}>
          {banner}
          {seats.length ? ` · you are ${seats.map((role) => ROLE_LABEL[role]).join(', ')}` : ''}
        </p>
      )}

      {fail && <div className="status err">{fail}</div>}
      {notice && <div className="status ok">{notice}</div>}
      {busy && <div className="status">{busy}</div>}
      {busy && connecting && <div className="status">Waiting for a wallet…</div>}
      {busy && error && <div className="status err">{error}</div>}

      {boardMode && (
        <div className="board">
          <section className="panel">
            <h2>Minutes</h2>
            {minutes.length ? (
              <ol className="feed">
                {minutes.map((event) => (
                  <li key={event.id}>
                    <time>{minutesAgo(event.at)}</time>
                    {event.text}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="hint">{emptyCopy}</p>
            )}
          </section>

          <section className="panel">
            <h2>Open proposals</h2>
            {openProposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                treasury={treasury as Treasury}
                identityKey={identityKey}
                amount={proposalAmount(proposal, usdPerBsv)}
                payee={payeeOnBoard(proposal)}
                mode="board"
                disabled={Boolean(busy)}
                onApprove={() => void onApprove(proposal)}
                onDecline={() => void onDecline(proposal)}
              />
            ))}
            {!openProposals.length && overlayStatus !== 'checking' && (
              <p className="hint">No open proposals.</p>
            )}
          </section>

          {inviteNext && invite && treasury && (
            <section className="panel">
              <h2>{invite}</h2>
              <p>Copy invite is the next step.</p>
              <div className="row">
                <button className="btn primary" onClick={() => void copyInvite()}>
                  Copy invite
                </button>
              </div>
            </section>
          )}
        </div>
      )}

      {!boardMode && (
        <section className="panel">
          <h2>Open a board</h2>
          <p>Paste a board id. Minutes load from overlay.</p>
          <label>Board id</label>
          <input
            value={lookupDraft}
            onChange={(event) => setLookupDraft(event.target.value.trim())}
            placeholder={DEMO_CLUB_ID}
          />
          <div className="row">
            <button
              className="btn primary"
              disabled={!lookupDraft || Boolean(busy)}
              onClick={() => void run('Loading minutes…', async () => {
                setTreasuryId(lookupDraft)
                await refresh(lookupDraft)
              })}
            >
              Open board
            </button>
          </div>
          <p className="quiet-link">
            <a href={`?treasury=${DEMO_CLUB_ID}&tx=${DEMO_CLUB_CREATE_TX}`}>Demo Club minutes</a>
          </p>
        </section>
      )}

      <details className="tools" open={toolsOpen} onToggle={(event) => setToolsOpen(event.currentTarget.open)}>
        <summary>Treasurer tools</summary>
        {toolsOpen && (
        <>
        <p className="hint">
          Create, join, fund, propose, and pay. Minutes and Approve / Decline stay on the board.
        </p>

        <section className="panel">
          <h2>Create a board</h2>
          <p>Name it, then copy the invite. Fund stays disabled until every required seat has joined.</p>
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
          <div className="row">
            <button
              className="btn primary"
              disabled={Boolean(busy)}
              onClick={() => void run('Creating board…', async () => {
                const session = await ensureWallet()
                const created = await createTreasury(session.wallet, {
                  name,
                  signerCount,
                  treasurerIdentityKey: inviteTreasurer || session.identityKey,
                  signers: [
                    { role: 'treasurer', identityKey: inviteTreasurer || session.identityKey },
                    { role: 'chair', identityKey: inviteChair || undefined },
                    ...(signerCount === 3
                      ? [{ role: 'bookkeeper' as Role, identityKey: inviteBookkeeper || undefined }]
                      : [])
                  ]
                })
                adopt(created.treasury, created.createdTxid)
                setToolsOpen(false)
                setInviteNext(true)
                setNotice(`Created ${created.treasury.name}. Copy invite is the next step.`)
              })}
            >
              Create board
            </button>
            <button className={invite ? 'btn primary' : 'btn'} disabled={!treasury} onClick={() => void copyInvite()}>
              Copy invite
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Join</h2>
          <p>
            {identityKey
              ? 'Open seats can join from this wallet. One wallet may hold more than one remaining seat.'
              : 'Open seats can join. One wallet may hold more than one remaining seat.'}
          </p>
          {treasury && treasury.signers.map((signer) => (
            <div className="seat" key={signer.role}>
              <div>
                <strong>{ROLE_LABEL[signer.role]}</strong>
                <span className="meta">{signer.derivedPubkey ? 'joined' : 'awaiting invite'}</span>
              </div>
            </div>
          ))}
          <div className="row">
            <button
              className="btn primary"
              disabled={!vacant || Boolean(busy)}
              onClick={() => void run('Joining…', async () => {
                const session = await ensureWallet()
                if (!treasury) return
                const seat = openSeat(treasury, session.identityKey) ?? vacant
                if (!seat) throw new Error('No open seat on this board')
                const keyID = vaultKeyID(treasury.id, seat.role, session.identityKey, treasury.signers)
                const derived = await derivedVaultKey(session.wallet, keyID)
                adopt(await joinTreasury(session.wallet, treasury, {
                  role: seat.role,
                  identityKey: session.identityKey,
                  derivedPubkey: derived
                }))
                setNotice(`Joined as ${ROLE_LABEL[seat.role]}.`)
              })}
            >
              Join{joinable ? ` as ${ROLE_LABEL[joinable.role]}` : ''}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Fund</h2>
          <p>
            Anyone can fund once every seat has joined.
            {vaultSats > 0 && vaultUsd ? ` Balance ${vaultUsd}.` : ''}
          </p>
          {fund.reason && <p className="hint">{fund.reason}</p>}
          {rateError && <p className="hint">{rateError}</p>}
          <label>Amount (USD)</label>
          <input
            className="amount-field"
            value={fundUsd}
            onChange={(event) => setFundUsd(event.target.value)}
            placeholder="25.00"
          />
          <div className="row">
            <button
              className="btn primary"
              disabled={fund.disabled}
              title={fund.reason || undefined}
              onClick={() => void run('Funding vault…', async () => {
                const session = await ensureWallet()
                if (!treasury) return
                const { sats, amountUsd: usd } = await dollarsToSats(fundUsd)
                const funded = await fundVault(session.wallet, treasury, sats)
                adopt(await recordFund(session.wallet, treasury, {
                  satoshis: funded.satoshis,
                  txid: funded.txid,
                  vout: funded.vout,
                  beef: funded.beef,
                  lockingScriptHex: treasury.lockingScriptHex as string,
                  amountUsd: usd
                }))
                setNotice(`Funded ${formatUsd(usd)}.`)
              })}
            >
              {identityKey ? 'Fund from this wallet' : 'Fund'}
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Propose a payment</h2>
          <p>Amount in dollars, a payee name the board can read, and a memo.</p>
          <label>Amount (USD)</label>
          <input
            className="amount-field"
            value={amountUsd}
            onChange={(event) => setAmountUsd(event.target.value)}
            placeholder="25.00"
          />
          <label>Payee name</label>
          <input value={payeeName} onChange={(event) => setPayeeName(event.target.value)} placeholder="Hall Committee" />
          <label>Memo</label>
          <input value={memo} onChange={(event) => setMemo(event.target.value)} />
          {propose.reason && <p className="hint">{propose.reason}</p>}
          <div className="row">
            <button
              className="btn primary"
              disabled={propose.disabled}
              title={propose.reason || undefined}
              onClick={() => void run('Proposing…', async () => {
                const session = await ensureWallet()
                if (!treasury) return
                if (!isIdentityKey(payee)) throw new Error('Add the payee’s identity key under Advanced')
                const { sats, amountUsd: usd } = await dollarsToSats(amountUsd)
                const proposalId = newId()
                const payeeLockingScriptHex = await lockPayeeOutput(session.wallet, payee, proposalId, memo)
                const proposeRole = heldRoles(treasury.signers, session.identityKey)[0]
                const keyID = proposeRole
                  ? vaultKeyID(treasury.id, proposeRole, session.identityKey, treasury.signers)
                  : treasury.id
                const derivedPubkey = await derivedVaultKey(session.wallet, keyID)
                const signature = await signProposal(session.wallet, {
                  v: 1,
                  treasuryId: treasury.id,
                  proposalId,
                  amountSats: sats,
                  payeeIdentityKey: payee,
                  memo,
                  payeeLockingScriptHex
                }, keyID)
                adopt(await postProposal(session.wallet, treasury, {
                  proposalId,
                  identityKey: session.identityKey,
                  derivedPubkey,
                  amountSats: sats,
                  amountUsd: usd,
                  payeeIdentityKey: payee,
                  payeeName: payeeName.trim() || undefined,
                  memo,
                  payeeLockingScriptHex,
                  signature
                }))
                setNotice('Proposal posted. A remaining role still needs to approve.')
              })}
            >
              Propose
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Sign vault and pay</h2>
          <p>Pay only after two people have said yes.</p>
          {treasury?.proposals.map((proposal) => (
            <ProposalCard
              key={`tools-${proposal.id}`}
              proposal={proposal}
              treasury={treasury}
              identityKey={identityKey}
              amount={proposalAmount(proposal, usdPerBsv)}
              payee={payeeOnBoard(proposal)}
              mode="tools"
              disabled={!wallet || Boolean(busy)}
              onApprove={() => void onApprove(proposal)}
              onDecline={() => void onDecline(proposal)}
              onVaultSign={() => void run('Signing vault…', async () => {
                if (!wallet || !identityKey || !treasury) return
                const role = nextOpenRole(heldRoles(treasury.signers, identityKey), proposal.p2msSigs)
                if (!role) throw new Error('Every seat you hold has already signed the vault')
                const keyID = vaultKeyID(treasury.id, role, identityKey, treasury.signers)
                const derivedPubkey = await derivedVaultKey(wallet, keyID)
                const signature = await signVaultSpend(wallet, treasury, proposal, keyID)
                adopt(await postP2msSig(wallet, treasury, {
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
                adopt(await postPaid(wallet, treasury, {
                  proposalId: proposal.id,
                  txid: paid.txid,
                  changeVout: paid.changeVout,
                  beef: paid.tx
                }))
                setNotice(`Paid ${proposalAmount(proposal, usdPerBsv)}.`)
              })}
            />
          ))}
          {!treasury?.proposals.length && <p className="hint">No proposals yet.</p>}
        </section>

        <section className="panel">
          <h2>Export the month</h2>
          <label>Month</label>
          <input value={month} onChange={(event) => setMonth(event.target.value)} placeholder="YYYY-MM" />
          <div className="row">
            <button className="btn" disabled={!treasury} onClick={() => treasury && downloadCsv(treasury, month)}>
              CSV
            </button>
            <button className="btn primary" disabled={!treasury} onClick={() => treasury && downloadPdf(treasury, month)}>
              PDF
            </button>
          </div>
        </section>

        <details className="advanced" open={showAdvanced} onToggle={(event) => setShowAdvanced(event.currentTarget.open)}>
          <summary>Advanced</summary>
          <p className="hint">Identity keys and hex stay here. The board shows names and dollars.</p>
          <label>Treasurer identity key (optional)</label>
          <input value={inviteTreasurer} onChange={(event) => setInviteTreasurer(event.target.value)} />
          <label>Chair identity key (optional)</label>
          <input value={inviteChair} onChange={(event) => setInviteChair(event.target.value)} />
          {signerCount === 3 && (
            <>
              <label>Bookkeeper identity key (optional)</label>
              <input value={inviteBookkeeper} onChange={(event) => setInviteBookkeeper(event.target.value)} />
            </>
          )}
          <label>Payee identity key</label>
          <input value={payee} onChange={(event) => setPayee(event.target.value)} placeholder="02… or 03…" />
          {identityKey && (
            <p className="meta">Connected key {shortKey(identityKey, 10)}</p>
          )}
        </details>
        </>
        )}
      </details>

      <footer>
        Reading minutes never needs a wallet. A wallet is requested after Approve (or Decline).
      </footer>
    </div>
  )
}

function ProposalCard(props: {
  proposal: Proposal
  treasury: Treasury
  identityKey: string | null
  amount: string
  payee: string
  mode: 'board' | 'tools'
  disabled: boolean
  onApprove: () => void
  onDecline: () => void
  onVaultSign?: () => void
  onPay?: () => void
}) {
  const { proposal, treasury, identityKey, amount, payee, mode, disabled, onApprove, onDecline, onVaultSign, onPay } = props
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
  const canPay = proposal.status !== 'paid' && proposal.status !== 'declined' && uniqueApprovers(proposal.p2msSigs).length >= treasury.threshold
  const open = proposal.status === 'open' || proposal.status === 'approved'
  const statusWord = motionStatusWord(proposal, treasury)
  const pending = motionSentence(proposal, treasury)
  const spend = mode === 'tools' ? spendSentence(proposal, treasury) : ''
  return (
    <article className="motion">
      <div className="motion-head">
        <h3 className="amount">{amount}</h3>
        <p className={`status-word ${statusWord.toLowerCase()}`}>{statusWord}</p>
      </div>
      <p>{proposal.memo}</p>
      <p className="meta">To {payee}</p>
      {pending && <p className="meta">{pending}</p>}
      {spend && <p className="meta">{spend}</p>}
      <div className="row">
        {open && (
          <button className="btn primary" disabled={disabled || already} onClick={onApprove}>
            {approveLabel}
          </button>
        )}
        {proposal.status === 'open' && (
          <button className="btn" disabled={disabled} onClick={onDecline}>
            Decline
          </button>
        )}
        {mode === 'tools' && proposal.status === 'approved' && onVaultSign && (
          <button className="btn" disabled={disabled || signedVault} onClick={onVaultSign}>
            {vaultLabel}
          </button>
        )}
        {mode === 'tools' && canPay && onPay && (
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
