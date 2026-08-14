import {
  HTTPSOverlayBroadcastFacilitator,
  LookupResolver,
  PushDrop,
  TopicBroadcaster,
  Transaction,
  type LookupAnswer,
  type OverlayBroadcastFacilitator,
  type STEAK,
  type TaggedBEEF
} from '@bsv/sdk'
import {
  DEMO_EVENT,
  LOOKUP_SERVICE,
  MAGIC,
  TICKET_TYPE,
  TOPIC,
  parseTicketFields,
  type TicketPayload
} from '../../../protocol/ticket'
import {
  PUBLIC_LOOKUP,
  PUBLIC_TOPIC,
  isLocalhostUrl
} from './config'

export interface OverlayTicket extends TicketPayload {
  txid: string
  outputIndex: number
  createdAt?: string
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
}

export interface TicketQuery {
  outpoint?: string
  serial?: string
  eventId?: string
}

function overlayUrl(base: string): string {
  return base.replace(/\/$/, '')
}

export function usesPublicAnytx(base: string): boolean {
  return !isLocalhostUrl(base)
}

export function overlayTopic(base: string): string {
  return usesPublicAnytx(base) ? PUBLIC_TOPIC : TOPIC
}

export function overlayLookupService(base: string): string {
  return usesPublicAnytx(base) ? PUBLIC_LOOKUP : LOOKUP_SERVICE
}

class HostPinnedFacilitator implements OverlayBroadcastFacilitator {
  readonly host: string
  readonly allowHTTP: boolean

  constructor(host: string, allowHTTP: boolean) {
    this.host = host
    this.allowHTTP = allowHTTP
  }

  async send(_url: string, taggedBEEF: TaggedBEEF): Promise<STEAK> {
    return new HTTPSOverlayBroadcastFacilitator(undefined, this.allowHTTP).send(this.host, taggedBEEF)
  }
}

function createBroadcaster(host: string, topic: string): TopicBroadcaster {
  const allowHTTP = host.startsWith('http://')
  return new TopicBroadcaster([topic], {
    // Skip SHIP discovery; the facilitator always posts to `host`.
    networkPreset: 'local',
    facilitator: new HostPinnedFacilitator(host, allowHTTP),
    requireAcknowledgmentFromAllHostsForTopics: [],
    requireAcknowledgmentFromAnyHostForTopics: 'any'
  })
}

function createResolver(host: string, service: string): LookupResolver {
  const allowHTTP = host.startsWith('http://')
  return new LookupResolver({
    networkPreset: allowHTTP ? 'local' : 'mainnet',
    hostOverrides: { [service]: [host] }
  })
}

function ticketOutputIndexes(tx: Transaction): number[] {
  const indexes: number[] = []
  for (const [index, output] of tx.outputs.entries()) {
    try {
      if (parseTicketFields(PushDrop.decode(output.lockingScript).fields)) {
        indexes.push(index)
      }
    } catch {
      // Change and unrelated outputs are ignored.
    }
  }
  return indexes
}

export async function submitTicketTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = Transaction.fromBEEF(beef)
  const overlay = createBroadcaster(host, topic)
  const result = await tx.broadcast(overlay)
  if (result.status !== 'success') {
    const description = 'description' in result ? result.description : ''
    throw new Error(
      description
        ? `Overlay broadcast to ${topic} at ${host} failed: ${description}`
        : `Overlay broadcast to ${topic} at ${host} failed`
    )
  }
  return {
    admitted: ticketOutputIndexes(tx),
    raw: result
  }
}

export async function lookupTickets(base: string, query: TicketQuery = {}): Promise<OverlayTicket[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const resolver = createResolver(host, service)
  const answers = usesPublicAnytx(host)
    ? await queryAnytx(resolver, service, query)
    : [await resolver.query(localLookupQuestion(service, query), 15000)]

  const tickets = answers.flatMap(ticketsFromAnswer)
  return tickets.filter((ticket) => matchesTicketQuery(ticket, query))
}

function localLookupQuestion(service: string, query: TicketQuery): { service: string, query: TicketQuery } {
  return { service, query }
}

async function queryAnytx(
  resolver: LookupResolver,
  service: string,
  query: TicketQuery
): Promise<LookupAnswer[]> {
  if (query.outpoint) {
    const [txid] = query.outpoint.split('.')
    return [await resolver.query({ service, query: { txid } }, 20000)]
  }

  const answers: LookupAnswer[] = []
  const pageSize = 100
  for (let page = 0; page < 5; page++) {
    const answer = await resolver.query({
      service,
      query: { limit: pageSize, skip: page * pageSize, sortOrder: 'desc' }
    }, 20000)
    answers.push(answer)
    const count = answer.type === 'output-list' ? answer.outputs.length : 0
    if (count < pageSize) break
  }
  return answers
}

function ticketsFromAnswer(answer: LookupAnswer): OverlayTicket[] {
  if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) return []
  return answer.outputs.flatMap((output) => {
    const fromScript = ticketFromBeef(output.beef, output.outputIndex)
    if (fromScript) return [fromScript]
    const fromCtx = fromContext(output.context, output.outputIndex)
    return fromCtx ? [fromCtx] : []
  })
}

function ticketFromBeef(beef: number[] | undefined, outputIndex: number): OverlayTicket | null {
  if (!beef || beef.length === 0) return null
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    const ticket = parseTicketFields(PushDrop.decode(output.lockingScript).fields)
    if (!ticket) return null
    return {
      ...ticket,
      txid: tx.id('hex'),
      outputIndex
    }
  } catch {
    return null
  }
}

function matchesTicketQuery(ticket: OverlayTicket, query: TicketQuery): boolean {
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (ticket.txid !== txid || ticket.outputIndex !== Number(vout)) return false
  }
  if (query.serial && ticket.serial !== query.serial) return false
  if (query.eventId && ticket.eventId !== query.eventId) return false
  return true
}

function ticketStub(partial: Partial<OverlayTicket> & { outputIndex: number }): OverlayTicket {
  return {
    magic: MAGIC,
    eventId: typeof partial.eventId === 'string' ? partial.eventId : DEMO_EVENT.eventId,
    serial: typeof partial.serial === 'string' ? partial.serial : '',
    kind: TICKET_TYPE,
    name: typeof partial.name === 'string' ? partial.name : DEMO_EVENT.name,
    venue: typeof partial.venue === 'string' ? partial.venue : DEMO_EVENT.venue,
    startsAt: typeof partial.startsAt === 'string' ? partial.startsAt : DEMO_EVENT.startsAt,
    txid: typeof partial.txid === 'string' ? partial.txid : '',
    outputIndex: partial.outputIndex,
    createdAt: partial.createdAt
  }
}

function fromContext(context: number[] | undefined, outputIndex: number): OverlayTicket | null {
  if (!context || context.length === 0) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(context))) as OverlayTicket
    return ticketStub({ ...parsed, outputIndex: parsed.outputIndex ?? outputIndex })
  } catch {
    return null
  }
}

export async function pingOverlay(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${overlayUrl(base)}/version`)
    if (response.ok) return true
    const health = await fetch(`${overlayUrl(base)}/health/live`)
    return health.ok
  } catch {
    return false
  }
}
