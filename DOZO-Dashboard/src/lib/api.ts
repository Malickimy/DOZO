/**
 * Typed client for the Papier redirect server API.
 *
 * Every `/api/*` request is sent with the `X-Api-Token` header. `GET /health`
 * is public. Endpoints that are still being implemented may answer `404`; the
 * UI treats that as a "not available yet" state rather than a hard failure.
 */

export type ActiveFlag = boolean | number

export interface Merchant {
  merchant_id: string
  google_place_id: string | null
  created_at: string
}

export interface Terminal {
  terminal_id: string
  label: string | null
  active: ActiveFlag
  last_seen: string | null
  scan_count: number
  last_scan_at: string | null
}

export interface ScansByTerminal {
  terminal_id: string
  label: string | null
  scan_count: number
}

export interface MerchantSummary {
  merchant_id: string
  total_scans: number
  terminal_count: number
  scans_by_terminal: ScansByTerminal[]
}

export interface Scan {
  id: number
  terminal_id: string
  scanned_at: string
  user_agent: string | null
}

export interface ClaimedStore {
  terminal_id: string
  merchant_id: string
  google_place_id: string | null
  label: string | null
  redirect_url: string
}

export interface ClaimResult {
  status: 'claimed'
  api_token: string
  store: ClaimedStore
}

export interface OfflineTerminal {
  terminal_id: string
  merchant_id: string
  label: string | null
  active: ActiveFlag
  last_seen: string | null
}

export interface OfflineResult {
  threshold_seconds: number
  cutoff: string
  terminals: OfflineTerminal[]
}

export interface HealthResult {
  status: string
}

export interface ScansQuery {
  terminal_id?: string
  since?: string
  until?: string
  limit?: number
}

export interface ApiClientConfig {
  baseUrl: string
  token: string
}

interface ApiErrorOptions {
  status: number
  path: string
  body: unknown
  cause?: unknown
}

/** Error thrown for non-2xx responses and network failures. */
export class ApiError extends Error {
  readonly status: number
  readonly path: string
  readonly body: unknown

  constructor(message: string, options: ApiErrorOptions) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined)
    this.name = 'ApiError'
    this.status = options.status
    this.path = options.path
    this.body = options.body
  }

  /** `true` when the server has no route yet for this path. */
  get isNotFound(): boolean {
    return this.status === 404
  }

  /** `true` when the token is missing, wrong, or not permitted. */
  get isUnauthorized(): boolean {
    return this.status === 401 || this.status === 403
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

/** `true` when an error means the endpoint is not implemented yet. */
export function isNotAvailable(error: unknown): boolean {
  return isApiError(error) && error.isNotFound
}

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = (baseUrl ?? '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `?${query}` : ''
}

function errorMessage(status: number, path: string, body: unknown): string {
  const detail =
    body && typeof body === 'object' && 'message' in body
      ? String((body as { message: unknown }).message)
      : typeof body === 'string' && body
        ? body
        : undefined
  if (status === 404) return `Not found: ${path}`
  if (status === 401 || status === 403) return 'Unauthorized — check the API token.'
  return detail ? `Request failed (${status}): ${detail}` : `Request failed (${status}) for ${path}`
}

export interface ApiClient {
  readonly baseUrl: string
  readonly token: string
  health: () => Promise<HealthResult>
  listMerchants: () => Promise<Merchant[]>
  listTerminals: (merchantId: string) => Promise<Terminal[]>
  getSummary: (merchantId: string) => Promise<MerchantSummary>
  listScans: (merchantId: string, query?: ScansQuery) => Promise<Scan[]>
  setGooglePlaceId: (merchantId: string, googlePlaceId: string) => Promise<{ merchant_id: string; google_place_id: string | null }>
  claimTerminal: (code: string, label?: string) => Promise<ClaimResult>
  listOfflineTerminals: () => Promise<OfflineResult>
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const token = (config.token ?? '').trim()

  async function request<T>(
    path: string,
    init: RequestInit = {},
    options: { auth?: boolean } = {},
  ): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body !== undefined) headers.set('Content-Type', 'application/json')

    const requiresAuth = options.auth ?? path.startsWith('/api/')
    if (requiresAuth && token) headers.set('X-Api-Token', token)

    let response: Response
    try {
      response = await fetch(`${baseUrl}${path}`, { ...init, headers })
    } catch (cause) {
      throw new ApiError(
        'Network request failed. Check the API base URL and that the server is reachable.',
        { status: 0, path, body: null, cause },
      )
    }

    const text = await response.text()
    let body: unknown = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }

    if (!response.ok) {
      throw new ApiError(errorMessage(response.status, path, body), {
        status: response.status,
        path,
        body,
      })
    }

    return body as T
  }

  const merchantPath = (merchantId: string, suffix = '') =>
    `/api/merchants/${encodeURIComponent(merchantId)}${suffix}`

  return {
    baseUrl,
    token,
    health: () => request<HealthResult>('/health', {}, { auth: false }),
    listMerchants: () => request<Merchant[]>('/api/merchants'),
    listTerminals: (merchantId) => request<Terminal[]>(merchantPath(merchantId, '/terminals')),
    getSummary: (merchantId) => request<MerchantSummary>(merchantPath(merchantId, '/summary')),
    listScans: (merchantId, query = {}) =>
      request<Scan[]>(
        merchantPath(merchantId, `/scans${buildQuery({ ...query })}`),
      ),
    setGooglePlaceId: (merchantId, googlePlaceId) =>
      request<{ merchant_id: string; google_place_id: string | null }>(
        merchantPath(merchantId, '/google-place-id'),
        { method: 'PUT', body: JSON.stringify({ google_place_id: googlePlaceId }) },
      ),
    claimTerminal: (code, label) =>
      request<ClaimResult>('/api/terminals/claim', {
        method: 'POST',
        body: JSON.stringify(label ? { code, label } : { code }),
      }),
    listOfflineTerminals: () => request<OfflineResult>('/api/terminals/offline'),
  }
}
