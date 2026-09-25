import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { API_BASE_URL, API_TOKEN, CONNECTOR_SECRET, MERCHANT_ID } from './env'

/**
 * End-to-end coverage for the connector scan ingest (`POST /scans`) and its
 * read model (Release Board R2/R5, dashboard contract §3).
 *
 * Every row is seeded through `POST /scans` with a fresh UUID `event_id`; no
 * `SEED_DEMO_SCANS`, no direct SQLite writes. The demo terminal `DEMOTERM01`
 * is seeded by the server (`SEED_DEMO=true`), so ingest accepts the rows.
 */
const SCANS_URL = `${API_BASE_URL}/scans`
const KNOWN_TERMINAL_ID = 'DEMOTERM01'

function scanBody(eventId: string, userAgent: string) {
  return {
    event_id: eventId,
    terminal_id: KNOWN_TERMINAL_ID,
    merchant_id: MERCHANT_ID,
    scanned_at: new Date().toISOString(),
    user_agent: userAgent,
  }
}

function postScan(request: APIRequestContext, body: unknown, secret: string = CONNECTOR_SECRET) {
  return request.post(SCANS_URL, {
    headers: secret ? { 'X-Connector-Secret': secret } : {},
    data: body,
  })
}

async function seriesTotal(
  request: APIRequestContext,
  since: string,
  until: string,
): Promise<number> {
  const response = await request.get(
    `${API_BASE_URL}/api/merchants/${MERCHANT_ID}/scans/series` +
      `?since=${encodeURIComponent(since)}&until=${encodeURIComponent(until)}&bucket=day`,
    { headers: { 'X-Api-Token': API_TOKEN } },
  )
  expect(response.status()).toBe(200)
  const points = (await response.json()) as { count: number }[]
  return points.reduce((sum, point) => sum + point.count, 0)
}

test('connector ingest: a new event is accepted and a repeat is a duplicate', async ({
  request,
}) => {
  const eventId = randomUUID()
  const userAgent = `dozo-e2e/${randomUUID()}`

  const first = await postScan(request, scanBody(eventId, userAgent))
  expect(first.status()).toBe(202)
  expect(await first.json()).toEqual({ status: 'accepted' })

  // Same `event_id` again: idempotent, no new row.
  const repeat = await postScan(request, scanBody(eventId, userAgent))
  expect(repeat.status()).toBe(202)
  expect(await repeat.json()).toEqual({ status: 'duplicate' })
})

test('connector ingest: accepted scans are visible through the read API', async ({
  request,
}) => {
  const eventA = randomUUID()
  const eventB = randomUUID()
  const userAgentA = `dozo-e2e-a/${randomUUID()}`
  const userAgentB = `dozo-e2e-b/${randomUUID()}`

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const until = new Date(Date.now() + 60 * 60 * 1000).toISOString()
  const before = await seriesTotal(request, since, until)

  // Two distinct events plus one duplicate that must not add a row.
  for (const [eventId, userAgent] of [
    [eventA, userAgentA],
    [eventA, userAgentA],
    [eventB, userAgentB],
  ] as const) {
    const response = await postScan(request, scanBody(eventId, userAgent))
    expect(response.status()).toBe(202)
  }

  const list = await request.get(
    `${API_BASE_URL}/api/merchants/${MERCHANT_ID}/scans` +
      `?terminal_id=${KNOWN_TERMINAL_ID}&limit=1000`,
    { headers: { 'X-Api-Token': API_TOKEN } },
  )
  expect(list.status()).toBe(200)
  const scans = (await list.json()) as { user_agent: string | null }[]
  const agents = scans.map((scan) => scan.user_agent)
  expect(agents).toContain(userAgentA)
  expect(agents).toContain(userAgentB)

  // The series window gained exactly the two accepted rows.
  const after = await seriesTotal(request, since, until)
  expect(after).toBe(before + 2)
})

test('connector ingest: missing or wrong secret is 401 unauthorized', async ({ request }) => {
  const body = scanBody(randomUUID(), `dozo-e2e-unauthorized/${randomUUID()}`)

  const missing = await postScan(request, body, '')
  expect(missing.status()).toBe(401)
  expect(await missing.json()).toEqual({ error: 'unauthorized' })

  const wrong = await postScan(request, body, 'not-the-secret')
  expect(wrong.status()).toBe(401)
  expect(await wrong.json()).toEqual({ error: 'unauthorized' })
})
