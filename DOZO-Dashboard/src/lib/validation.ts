export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())
}

export function normalizeNip(value: string): string {
  return value.replace(/[\s-]/g, '').replace(/^PL/i, '')
}

const NIP_WEIGHTS = [6, 5, 7, 2, 3, 4, 5, 6, 7]

/** Polish tax ID: 10 digits, the last one a weighted mod-11 checksum. */
export function isValidNip(value: string): boolean {
  const digits = normalizeNip(value)
  if (!/^\d{10}$/.test(digits)) return false
  const sum = NIP_WEIGHTS.reduce((total, weight, index) => total + weight * Number(digits[index]), 0)
  const check = sum % 11
  return check !== 10 && check === Number(digits[9])
}

export const MIN_PASSWORD_LENGTH = 8
