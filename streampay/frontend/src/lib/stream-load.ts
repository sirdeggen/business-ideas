import { OVERLAY_LOOKUP_FAILED } from './config'
import { parseStreamLocation } from './route'

export const LOADING_STREAM = 'This takes a moment.'

export { OVERLAY_LOOKUP_FAILED }

export function routeNeedsStreamLookup(
  pathname: string,
  search: string,
  hash: string
): boolean {
  return parseStreamLocation(pathname, search, hash).streamId !== null
}

export function streamPageState(
  stream: { streamId: string } | null,
  error: string | null
): {
  loading: boolean
  offerOpen: boolean
  message: string | null
} {
  if (stream) return { loading: false, offerOpen: false, message: null }
  if (error) return { loading: false, offerOpen: true, message: error }
  return { loading: true, offerOpen: false, message: LOADING_STREAM }
}
