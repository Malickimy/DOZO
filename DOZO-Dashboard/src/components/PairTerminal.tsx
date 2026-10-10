import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ApiClient, SetupCode } from '../lib/api'
import { useT } from '../lib/i18n'
import { describeIssueError } from '../lib/setupCodeErrors'

interface PairTerminalProps {
  client: ApiClient
  merchantId: string
  suggestedName: string
  onPaired: () => void
}

type Phase =
  | { kind: 'idle' }
  | {
      kind: 'wait'
      code: SetupCode
      label: string
      previousTerminalId: string | null
      expiresAt: number
      totalSeconds: number
    }
  | { kind: 'done'; label: string; terminalId: string }
  | { kind: 'expired'; label: string; totalSeconds: number }

const POLL_MS = 3000

function formatCountdown(seconds: number): string {
  const safe = Math.max(0, seconds)
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`
}

export function PairTerminal({ client, merchantId, suggestedName, onPaired }: PairTerminalProps) {
  const t = useT()
  const [name, setName] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [copied, setCopied] = useState(false)

  const value = name ?? suggestedName

  useEffect(() => {
    if (phase.kind !== 'wait') return
    const tick = window.setInterval(() => {
      const current = Date.now()
      setNow(current)
      if (current >= phase.expiresAt) {
        setPhase({ kind: 'expired', label: phase.label, totalSeconds: phase.totalSeconds })
      }
    }, 1000)
    return () => window.clearInterval(tick)
  }, [phase])

  useEffect(() => {
    if (phase.kind !== 'wait') return
    let cancelled = false
    const poll = window.setInterval(() => {
      client
        .listRegisters(merchantId)
        .then((registers) => {
          if (cancelled) return
          const register = registers.find((item) => item.label === phase.label)
          if (register?.terminal_id && register.terminal_id !== phase.previousTerminalId) {
            setPhase({ kind: 'done', label: phase.label, terminalId: register.terminal_id })
            setName(null)
            onPaired()
          }
        })
        .catch(() => {
          // A transient polling failure is retried on the next tick.
        })
    }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(poll)
    }
  }, [client, merchantId, phase, onPaired])

  async function issue(label: string, previousTerminalId: string | null) {
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const code = await client.issueSetupCode(merchantId, label)
      const issuedAt = Date.now()
      setNow(issuedAt)
      setPhase({
        kind: 'wait',
        code,
        label: code.label,
        previousTerminalId,
        expiresAt: issuedAt + code.expires_in_seconds * 1000,
        totalSeconds: code.expires_in_seconds,
      })
    } catch (err) {
      setError(describeIssueError(err, merchantId, t).message)
    } finally {
      setBusy(false)
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const label = value.trim()
    if (!label) {
      setError(t('Podaj nazwę terminala.', 'Enter a terminal name.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const registers = await client.listRegisters(merchantId)
      const existing = registers.find((item) => item.label.toLowerCase() === label.toLowerCase())
      if (existing?.terminal_id) {
        setError(
          t(
            'Ta nazwa należy już do połączonego terminala. Wybierz inną albo wymień urządzenie w tabeli stanowisk.',
            'That name already belongs to a paired terminal. Pick another or swap the device in the registers table.',
          ),
        )
        setBusy(false)
        return
      }
      await issue(existing?.label ?? label, null)
    } catch (err) {
      setError(describeIssueError(err, merchantId, t).message)
      setBusy(false)
    }
  }

  async function copyCode() {
    if (phase.kind !== 'wait' || !navigator.clipboard) return
    try {
      await navigator.clipboard.writeText(phase.code.code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const remaining = phase.kind === 'wait' ? Math.ceil((phase.expiresAt - now) / 1000) : 0

  return (
    <div className="card">
      <div className="pair-grid">
        <div>
          <h2 className="card__title">{t('Połącz terminal', 'Pair a terminal')}</h2>
          <p className="muted pair-sub">
            {t(
              'Zaloguj terminal bez wpisywania hasła. Wygeneruj jednorazowy kod i wpisz go na terminalu.',
              'Sign the terminal in without a password. Generate a one-time code and type it on the terminal.',
            )}
          </p>
          <ol className="psteps">
            <li>
              <b>1</b>
              <span>
                {t(
                  'Na terminalu otwórz DooZo i wejdź w Ustawienia.',
                  'On the terminal, open DooZo and go to Settings.',
                )}
              </span>
            </li>
            <li>
              <b>2</b>
              <span>
                {t('Wybierz „Wprowadź kod konfiguracyjny”.', 'Choose “Enter setup code”.')}
              </span>
            </li>
            <li>
              <b>3</b>
              <span>
                {t(
                  'Wpisz kod z panelu. Terminal połączy się i pobierze konfigurację.',
                  'Type the code from this panel. The terminal connects and downloads its configuration.',
                )}
              </span>
            </li>
          </ol>
          <form className="form form--row pair-form" onSubmit={handleSubmit}>
            <label className="field field--grow">
              <span className="field__label">{t('Nazwa terminala', 'Terminal name')}</span>
              <input
                className="input"
                type="text"
                value={value}
                maxLength={24}
                disabled={busy || phase.kind === 'wait'}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button
              type="submit"
              className="btn btn--primary"
              disabled={busy || phase.kind === 'wait'}
            >
              {busy ? t('Generuję…', 'Generating…') : t('Wygeneruj kod', 'Generate code')}
            </button>
          </form>
          {error ? (
            <p className="state state--error pair-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="pair-code" data-state={phase.kind} aria-live="polite">
          {phase.kind === 'idle' ? (
            <>
              <div className="ghost-code" aria-hidden="true">
                {Array.from({ length: 8 }, (_, index) => (
                  <i key={index} />
                ))}
              </div>
              <p className="muted pair-note">
                {t(
                  'Tu pojawi się kod do wpisania na terminalu.',
                  'The code to type on the terminal appears here.',
                )}
              </p>
            </>
          ) : null}

          {phase.kind === 'wait' ? (
            <>
              <p className="setup-code" aria-label={phase.code.code.split('').join(' ')}>
                <span aria-hidden="true">{phase.code.code.slice(0, 4)}</span>
                <span aria-hidden="true">{phase.code.code.slice(4)}</span>
              </p>
              <div className="ptimer">
                <div className="ptimer__track">
                  <b style={{ transform: `scaleX(${Math.max(0, remaining) / phase.totalSeconds})` }} />
                </div>
                <span>
                  {t('Kod ważny jeszcze', 'Code valid for')}{' '}
                  <strong>{formatCountdown(remaining)}</strong>
                </span>
              </div>
              <p className="pair-note">
                <span className="wait-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                {t('Czekamy, aż terminal wpisze kod', 'Waiting for the terminal to enter the code')}
              </p>
              <div className="form__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={busy}
                  onClick={() => void issue(phase.label, phase.previousTerminalId)}
                >
                  {t('Nowy kod', 'New code')}
                </button>
                {navigator.clipboard ? (
                  <button type="button" className="btn btn--ghost" onClick={copyCode}>
                    {copied ? t('Skopiowano', 'Copied') : t('Kopiuj', 'Copy')}
                  </button>
                ) : null}
              </div>
              <p className="muted pair-fine">
                {t('Kod jest jednorazowy. Nie wysyłaj go nikomu.', 'The code is single-use. Don’t share it.')}
              </p>
            </>
          ) : null}

          {phase.kind === 'done' ? (
            <>
              <div className="big-ok" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              </div>
              <h3>{t('Terminal połączony', 'Terminal paired')}</h3>
              <p className="muted pair-note">
                {t(
                  `„${phase.label}” jest gotowy do pracy (${phase.terminalId}).`,
                  `“${phase.label}” is ready to go (${phase.terminalId}).`,
                )}
              </p>
              <button type="button" className="btn btn--ghost" onClick={() => setPhase({ kind: 'idle' })}>
                {t('Połącz kolejny', 'Pair another')}
              </button>
            </>
          ) : null}

          {phase.kind === 'expired' ? (
            <>
              <h3>{t('Kod wygasł', 'Code expired')}</h3>
              <p className="muted pair-note">
                {t(
                  `Ze względów bezpieczeństwa kod działa ${Math.round(phase.totalSeconds / 60)} min.`,
                  `For security the code only works for ${Math.round(phase.totalSeconds / 60)} min.`,
                )}
              </p>
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void issue(phase.label, null)}
              >
                {t('Wygeneruj nowy kod', 'Generate a new code')}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
