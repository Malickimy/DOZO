import { randomInt } from 'node:crypto';

// Unambiguous uppercase alphabet: no I, O, 0, 1.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
export const MAX_CODE_ATTEMPTS = 12;

export function generateCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * The `store` payload handed to a terminal when it redeems a setup code.
 * `redirect_url` is the full QR target; `static_review_url` (R3) is the raw
 * Google review link for setups that cannot route through the connector.
 */
export function storeConfig(config, terminal) {
  return {
    terminal_id: terminal.terminal_id,
    merchant_id: terminal.merchant_id,
    google_place_id: terminal.google_place_id,
    label: terminal.label,
    redirect_url: `${config.redirectDomain}/r/${terminal.terminal_id}`,
  };
}
