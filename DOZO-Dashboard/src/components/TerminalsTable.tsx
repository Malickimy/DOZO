import type { Terminal } from '../lib/api'
import { formatDateTime, formatRelative, isActive } from '../lib/format'
import { Empty } from './StateMessage'

interface TerminalsTableProps {
  terminals: Terminal[]
  onManage?: (terminal: Terminal) => void
}

export function TerminalsTable({ terminals, onManage }: TerminalsTableProps) {
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
            <th>Review link</th>
            <th>Action</th>
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
              <td>
                {terminal.static_review_url ? (
                  <a href={terminal.static_review_url} target="_blank" rel="noreferrer">
                    Review
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                {onManage ? (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => onManage(terminal)}
                  >
                    Manage
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
