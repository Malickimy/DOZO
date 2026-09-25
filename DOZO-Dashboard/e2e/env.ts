/**
 * Shared E2E endpoints and local placeholder credentials.
 *
 * Imported by both `playwright.config.ts` (to boot the servers) and the specs
 * (to talk to them) so the connector secret cannot drift between the two.
 * These are local, non-secret placeholders — never real tokens.
 */
export const API_PORT = 3100
export const WEB_PORT = 5273
export const API_BASE_URL = `http://127.0.0.1:${API_PORT}`
export const WEB_BASE_URL = `http://127.0.0.1:${WEB_PORT}`

export const API_TOKEN = 'dev-placeholder-token'
export const CONNECTOR_SECRET = 'dev-connector-secret'
export const MERCHANT_ID = 'demo-merchant'
