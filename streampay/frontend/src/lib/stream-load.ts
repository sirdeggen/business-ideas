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
  keepBoard: boolean
  offerRetry: boolean
  offerOpen: boolean
  message: string | null
} {
  if (stream) {
    return {
      loading: false,
      keepBoard: true,
      offerRetry: Boolean(error),
      offerOpen: false,
      message: error
    }
  }
  if (error) {
    return {
      loading: false,
      keepBoard: false,
      offerRetry: true,
      offerOpen: false,
      message: error
    }
  }
  return {
    loading: true,
    keepBoard: false,
    offerRetry: false,
    offerOpen: false,
    message: LOADING_STREAM
  }
}
