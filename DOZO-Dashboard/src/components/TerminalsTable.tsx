import type { Terminal } from '../lib/api'
import { formatDateTime, formatRelative, isActive } from '../lib/format'
import { Empty } from './StateMessage'

export function TerminalsTable({ terminals }: { terminals: Terminal[] }) {
  if (terminals.length === 0) {
    return <Empty>No terminals paired yet. Pair one from the “Pair terminal” tab.</Empty>
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Label</th>
            <th>Terminal ID</th>
            <th>Active</th>
            <th>Last seen</th>
            <th className="num">Scans</th>
            <th>Last scan</th>
          </tr>
        </thead>
        <tbody>
          {terminals.map((terminal) => (
            <tr key={terminal.terminal_id}>
              <td>{terminal.label || <span className="muted">—</span>}</td>
              <td>
                <code>{terminal.terminal_id}</code>
              </td>
              <td>
                <span
                  className={isActive(terminal.active) ? 'badge badge--ok' : 'badge badge--off'}
                >
                  {isActive(terminal.active) ? 'active' : 'inactive'}
                </span>
              </td>
              <td title={formatDateTime(terminal.last_seen)}>
                {formatRelative(terminal.last_seen)}
              </td>
              <td className="num">{terminal.scan_count}</td>
              <td title={formatDateTime(terminal.last_scan_at)}>
                {formatRelative(terminal.last_scan_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
