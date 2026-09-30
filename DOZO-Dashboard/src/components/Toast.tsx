interface ToastProps {
  message: string | null
  onDismiss: () => void
}

/**
 * In-page scan-activity toast. The polite live region is always mounted so
 * screen readers announce when a message arrives; no browser Notification API.
 */
export function Toast({ message, onDismiss }: ToastProps) {
  return (
    <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
      {message ? (
        <div className="toast">
          <span className="toast__text">{message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={onDismiss}
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  )
}
