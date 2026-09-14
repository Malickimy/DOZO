import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createApiClient,
  isNotAvailable,
  normalizeBaseUrl,
} from '../lib/api'
import { jsonResponse } from './helpers'

function stubFetch(impl: (...args: unknown[]) => unknown) {
  const mock = vi.fn(impl)
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('normalizeBaseUrl', () => {
  it('trims and removes trailing slashes', () => {
    expect(normalizeBaseUrl('  http://localhost:3000/  ')).toBe('http://localhost:3000')
    expect(normalizeBaseUrl('http://localhost:3000///')).toBe('http://localhost:3000')
  })
})

describe('createApiClient', () => {
  const client = createApiClient({ baseUrl: 'http://example.test:3000/', token: 'secret' })

  it('calls /health without a token', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ status: 'ok' })))
    const result = await client.health()
    expect(result.status).toBe('ok')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://example.test:3000/health')
    expect((init.headers as Headers).get('X-Api-Token')).toBeNull()
  })

  it('sends the token header on /api requests and parses JSON', async () => {
    const merchants = [
      { merchant_id: 'm1', google_place_id: 'ChIJ1', created_at: '2026-01-01T00:00:00.000Z' },
    ]
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse(merchants)))
    const result = await client.listMerchants()
    expect(result).toEqual(merchants)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://example.test:3000/api/merchants')
    expect((init.headers as Headers).get('X-Api-Token')).toBe('secret')
  })

  it('encodes the merchant id and builds the scans query string', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse([])))
    await client.listScans('merchant one', { terminal_id: 'TERM1', limit: 50 })
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe(
      'http://example.test:3000/api/merchants/merchant%20one/scans?terminal_id=TERM1&limit=50',
    )
  })

  it('PUTs the Google Place ID as JSON', async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(jsonResponse({ merchant_id: 'm1', google_place_id: 'ChIJ2' })),
    )
    await client.setGooglePlaceId('m1', 'ChIJ2')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://example.test:3000/api/merchants/m1/google-place-id')
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(JSON.stringify({ google_place_id: 'ChIJ2' }))
    expect((init.headers as Headers).get('Content-Type')).toBe('application/json')
  })

  it('throws an ApiError flagged not-found on 404', async () => {
    stubFetch(() => Promise.resolve(jsonResponse({ message: 'Route not found' }, 404)))
    const error = await client.listMerchants().catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
    expect((error as ApiError).isNotFound).toBe(true)
    expect(isNotAvailable(error)).toBe(true)
  })

  it('throws an ApiError with status 0 on network failure', async () => {
    stubFetch(() => Promise.reject(new Error('boom')))
    const error = await client.health().catch((err: unknown) => err)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(0)
    expect(isNotAvailable(error)).toBe(false)
  })
})
