import type { MerchantSummary } from '../lib/api'

export function SummaryCards({ summary }: { summary: MerchantSummary }) {
  const top = [...(summary.scans_by_terminal ?? [])].sort(
    (a, b) => b.scan_count - a.scan_count,
  )[0]

  return (
    <div className="cards">
      <div className="card card--stat">
        <span className="stat__label">Total scans</span>
        <span className="stat__value">{summary.total_scans}</span>
        <span className="stat__hint">Reviews can’t be attributed — scans are the metric.</span>
      </div>
      <div className="card card--stat">
        <span className="stat__label">Terminals</span>
        <span className="stat__value">{summary.terminal_count}</span>
        <span className="stat__hint">Paired terminals for this merchant.</span>
      </div>
      <div className="card card--stat">
        <span className="stat__label">Top terminal</span>
        <span className="stat__value stat__value--sm">{top ? top.label || top.terminal_id : '—'}</span>
        <span className="stat__hint">{top ? `${top.scan_count} scans` : 'No scans yet.'}</span>
      </div>
    </div>
  )
}
