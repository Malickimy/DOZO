/** Date-range selection shared by the summary and the scans analytics. */

export type RangePreset = '7d' | '30d' | '90d' | 'custom'

export interface RangeSelection {
  preset: RangePreset
  /** ISO bounds sent to the API. */
  since: string
  until: string
  /** Raw `YYYY-MM-DD` inputs, used only by the custom preset. */
  customSince: string
  customUntil: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function presetDays(preset: Exclude<RangePreset, 'custom'>): number {
  if (preset === '7d') return 7
  if (preset === '90d') return 90
  return 30
}

export function presetRange(
  preset: Exclude<RangePreset, 'custom'>,
  now: Date = new Date(),
): { since: string; until: string } {
  return {
    since: new Date(now.getTime() - presetDays(preset) * DAY_MS).toISOString(),
    until: now.toISOString(),
  }
}

export function customRange(
  customSince: string,
  customUntil: string,
): { since: string; until: string } {
  return {
    since: customSince ? `${customSince}T00:00:00.000Z` : '',
    until: customUntil ? `${customUntil}T23:59:59.999Z` : '',
  }
}

export function initialRange(now: Date = new Date()): RangeSelection {
  const { since, until } = presetRange('30d', now)
  return {
    preset: '30d',
    since,
    until,
    customSince: since.slice(0, 10),
    customUntil: until.slice(0, 10),
  }
}

export function selectPreset(
  current: RangeSelection,
  preset: RangePreset,
  now: Date = new Date(),
): RangeSelection {
  if (preset === 'custom') {
    return { ...current, preset, ...customRange(current.customSince, current.customUntil) }
  }
  return { ...current, preset, ...presetRange(preset, now) }
}

export function selectCustomDate(
  current: RangeSelection,
  field: 'customSince' | 'customUntil',
  value: string,
): RangeSelection {
  const next: RangeSelection = { ...current, preset: 'custom', [field]: value }
  return { ...next, ...customRange(next.customSince, next.customUntil) }
}
