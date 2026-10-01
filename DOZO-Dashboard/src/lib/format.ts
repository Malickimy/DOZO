/** Small formatting helpers shared by the dashboard components. */
import { getLang } from './i18n'

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

export function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const sameDay = date.toDateString() === new Date().toDateString()
  return sameDay
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function formatRelative(value: string | null | undefined): string {
  const en = getLang() === 'en'
  if (!value) return en ? 'never' : 'nigdy'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.round(diffMs / 60000)
  if (Math.abs(minutes) < 1) return en ? 'just now' : 'przed chwilą'
  if (Math.abs(minutes) < 60) return en ? `${minutes}m ago` : `${minutes} min temu`
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return en ? `${hours}h ago` : `${hours} godz. temu`
  const days = Math.round(hours / 24)
  if (en) return `${days}d ago`
  return days === 1 ? 'wczoraj' : `${days} dni temu`
}

/** Polish plural form: 1 skan, 2–4 skany, 5+ skanów (12–14 always use the "many" form). */
export function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one
  const lastTwo = count % 100
  const last = count % 10
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return few
  return many
}

export function scansLabel(count: number): string {
  if (getLang() === 'en') return `${count} ${count === 1 ? 'scan' : 'scans'}`
  return `${count} ${plural(count, 'skan', 'skany', 'skanów')}`
}

export function isActive(active: boolean | number | null | undefined): boolean {
  return active === true || active === 1
}

export function terminalName(label: string | null | undefined, terminalId: string): string {
  return label && label.trim() ? label : terminalId
}

// The server buckets scans by the Europe/Warsaw calendar day, so the chart does too.
const WARSAW_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function warsawDay(date: Date): string {
  const parts = WARSAW_DAY.formatToParts(date)
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('year')}-${value('month')}-${value('day')}`
}

/** The `count` Warsaw calendar days ending `offset` days before today, oldest first. */
export function recentDays(count: number, offset = 0, now = new Date()): string[] {
  const [year, month, day] = warsawDay(now).split('-').map(Number)
  const days: string[] = []
  for (let i = count - 1 + offset; i >= offset; i -= 1) {
    days.push(new Date(Date.UTC(year, month - 1, day - i)).toISOString().slice(0, 10))
  }
  return days
}
