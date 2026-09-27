import { scansLabel } from '../lib/format'
import { useT } from '../lib/i18n'

export interface ChartPoint {
  day: string
  count: number
}

function shortDay(day: string): string {
  const [, month, date] = day.split('-')
  return `${date}.${month}`
}

export function ScanChart({ points }: { points: ChartPoint[] }) {
  const t = useT()
  const max = Math.max(1, ...points.map((point) => point.count))
  const total = points.reduce((sum, point) => sum + point.count, 0)
  const labelEvery = points.length > 16 ? 3 : 1

  return (
    <div
      className="chart"
      role="img"
      aria-label={t(
        `Skany dziennie w ostatnich ${points.length} dniach, łącznie ${scansLabel(total)}.`,
        `Daily scans over the last ${points.length} days, ${scansLabel(total)} in total.`,
      )}
    >
      {points.map((point, index) => (
        <div className="chart__bar" key={point.day}>
          <b
            className={point.count === 0 ? 'is-zero' : undefined}
            style={{ height: `${(point.count / max) * 100}%`, animationDelay: `${index * 18}ms` }}
          />
          <em>
            {shortDay(point.day)}: {scansLabel(point.count)}
          </em>
          {index % labelEvery === 0 || index === points.length - 1 ? (
            <span>{point.day.slice(8)}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
