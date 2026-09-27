import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useT } from '../lib/i18n'
import type { Settings } from '../lib/settings'
import { MIN_PASSWORD_LENGTH, isEmail, isValidNip } from '../lib/validation'
import { LoginSettings } from './LoginSettings'
import { AwaitingApi } from './StateMessage'

type Mode = 'login' | 'register' | 'reset' | 'operator'

const HASHES: Record<Mode, string> = {
  login: '#logowanie',
  register: '#rejestracja',
  reset: '#reset-hasla',
  operator: '#operator',
}

function modeFromHash(hash: string): Mode {
  const match = (Object.keys(HASHES) as Mode[]).find((mode) => HASHES[mode] === hash)
  return match ?? 'login'
}

interface AuthScreenProps {
  initial: Settings
  onOperatorSave: (settings: Settings) => void
}

export function AuthScreen({ initial, onOperatorSave }: AuthScreenProps) {
  const t = useT()
  const [mode, setMode] = useState<Mode>(() => modeFromHash(window.location.hash))

  const titles: Record<Mode, string> = {
    login: t('Logowanie', 'Sign in'),
    register: t('Rejestracja', 'Sign up'),
    reset: t('Reset hasła', 'Password reset'),
    operator: t('Wejście operatora', 'Operator sign-in'),
  }
  const title = titles[mode]

  useEffect(() => {
    document.title = `${title} — DooZo`
  }, [title])

  function go(next: Mode) {
    setMode(next)
    window.history.replaceState(null, '', HASHES[next])
  }

  if (mode === 'operator') {
    return (
      <>
        <button type="button" className="link-btn auth__back" onClick={() => go('login')}>
          ← {t('Wróć do logowania', 'Back to sign in')}
        </button>
        <LoginSettings initial={initial} onSave={onOperatorSave} />
      </>
    )
  }

  if (mode === 'reset') {
    return (
      <>
        <button type="button" className="link-btn auth__back" onClick={() => go('login')}>
          ← {t('Wróć do logowania', 'Back to sign in')}
        </button>
        <ResetForm onOperator={() => go('operator')} />
      </>
    )
  }

  return (
    <>
      <div className="seg auth__tabs" role="group" aria-label={t('Konto', 'Account')}>
        <button type="button" aria-pressed={mode === 'login'} onClick={() => go('login')}>
          {t('Logowanie', 'Log in')}
        </button>
        <button type="button" aria-pressed={mode === 'register'} onClick={() => go('register')}>
          {t('Rejestracja', 'Register')}
        </button>
      </div>

      {mode === 'login' ? (
        <LoginForm onForgot={() => go('reset')} onOperator={() => go('operator')} />
      ) : (
        <RegisterForm onLogin={() => go('login')} onOperator={() => go('operator')} />
      )}

      <div className="auth__divider">
        <span>{t('albo', 'or')}</span>
      </div>
      <button type="button" className="btn btn--ghost auth__operator" onClick={() => go('operator')}>
        {t('Wejdź tokenem operatora', 'Use an operator token')}
      </button>
    </>
  )
}

type Errors = Partial<Record<string, string>>

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string
  label: string
  error?: string
  children: ReactNode
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <span className="field__error" id={`${id}-error`}>
          {error}
        </span>
      ) : null}
    </div>
  )
}

function inputProps(id: string, errors: Errors) {
  return {
    id,
    className: 'input',
    'aria-invalid': errors[id] ? true : undefined,
    'aria-describedby': errors[id] ? `${id}-error` : undefined,
  }
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  errors,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  errors: Errors
}) {
  const t = useT()
  const [visible, setVisible] = useState(false)
  return (
    <div className="pw">
      <input
        {...inputProps(id, errors)}
        type={visible ? 'text' : 'password'}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="pw__toggle"
        aria-pressed={visible}
        aria-controls={id}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? t('Ukryj', 'Hide') : t('Pokaż', 'Show')}
      </button>
    </div>
  )
}

function OperatorHint({ children, onOperator }: { children: ReactNode; onOperator: () => void }) {
  const t = useT()
  return (
    <AwaitingApi>
      {children}{' '}
      <button type="button" className="link-btn" onClick={onOperator}>
        {t('Wejdź tokenem operatora', 'Use an operator token')}
      </button>
    </AwaitingApi>
  )
}

function LoginForm({ onForgot, onOperator }: { onForgot: () => void; onOperator: () => void }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next: Errors = {}
    if (!isEmail(email)) next['login-email'] = t('Wpisz poprawny adres e-mail.', 'Enter a valid email address.')
    if (!password) next['login-password'] = t('Wpisz hasło.', 'Enter your password.')
    setErrors(next)
    setSubmitted(Object.keys(next).length === 0)
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h1 className="auth__title">{t('Zaloguj się do panelu', 'Sign in to your panel')}</h1>
      <p className="auth__subtitle">
        {t(
          'Użyj e-maila podanego przy zamówieniu DooZo.',
          'Use the email you gave when ordering DooZo.',
        )}
      </p>
      <Field id="login-email" label={t('E-mail', 'Email')} error={errors['login-email']}>
        <input
          {...inputProps('login-email', errors)}
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field id="login-password" label={t('Hasło', 'Password')} error={errors['login-password']}>
        <PasswordInput
          id="login-password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          errors={errors}
        />
      </Field>
      <button type="button" className="link-btn auth__forgot" onClick={onForgot}>
        {t('Nie pamiętasz hasła?', 'Forgot your password?')}
      </button>
      <button type="submit" className="btn btn--primary auth__submit">
        {t('Zaloguj się', 'Sign in')}
      </button>
      {submitted ? (
        <OperatorHint onOperator={onOperator}>
          {t(
            'Logowanie kontem wymaga endpointu POST /api/auth/login, którego serwer jeszcze nie ma. Dane nie zostały nigdzie wysłane.',
            'Account sign-in needs a POST /api/auth/login endpoint the server doesn’t have yet. Nothing was sent anywhere.',
          )}
        </OperatorHint>
      ) : null}
    </form>
  )
}

function RegisterForm({ onLogin, onOperator }: { onLogin: () => void; onOperator: () => void }) {
  const t = useT()
  const [company, setCompany] = useState('')
  const [nip, setNip] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  const [terms, setTerms] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next: Errors = {}
    if (!company.trim()) next['reg-company'] = t('Wpisz nazwę firmy.', 'Enter the company name.')
    if (!isValidNip(nip)) next['reg-nip'] = t('Wpisz poprawny NIP (10 cyfr).', 'Enter a valid Polish tax ID (NIP, 10 digits).')
    if (!isEmail(email)) next['reg-email'] = t('Wpisz poprawny adres e-mail.', 'Enter a valid email address.')
    if (password.length < MIN_PASSWORD_LENGTH) {
      next['reg-password'] = t(
        `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków.`,
        `The password needs at least ${MIN_PASSWORD_LENGTH} characters.`,
      )
    }
    if (repeat !== password || !repeat) {
      next['reg-repeat'] = t('Hasła nie są takie same.', 'The passwords don’t match.')
    }
    if (!terms) next['reg-terms'] = t('Zaakceptuj regulamin, żeby założyć konto.', 'Accept the terms to create an account.')
    setErrors(next)
    setSubmitted(Object.keys(next).length === 0)
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h1 className="auth__title">{t('Załóż konto', 'Create an account')}</h1>
      <p className="auth__subtitle">
        {t(
          'Konto sprzedawcy daje dostęp do panelu: skanów, terminali i ustawień ekranu.',
          'A merchant account gives you the panel: scans, terminals and screen settings.',
        )}
      </p>
      <Field id="reg-company" label={t('Nazwa firmy', 'Company name')} error={errors['reg-company']}>
        <input
          {...inputProps('reg-company', errors)}
          type="text"
          value={company}
          autoComplete="organization"
          onChange={(event) => setCompany(event.target.value)}
        />
      </Field>
      <Field id="reg-nip" label="NIP" error={errors['reg-nip']}>
        <input
          {...inputProps('reg-nip', errors)}
          type="text"
          inputMode="numeric"
          value={nip}
          placeholder="123-456-32-18"
          onChange={(event) => setNip(event.target.value)}
        />
      </Field>
      <Field
        id="reg-email"
        label={t('E-mail do faktur i logowania', 'Email for invoices and sign-in')}
        error={errors['reg-email']}
      >
        <input
          {...inputProps('reg-email', errors)}
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <div className="auth-form__pair">
        <Field id="reg-password" label={t('Hasło', 'Password')} error={errors['reg-password']}>
          <PasswordInput
            id="reg-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            errors={errors}
          />
        </Field>
        <Field id="reg-repeat" label={t('Powtórz hasło', 'Repeat password')} error={errors['reg-repeat']}>
          <PasswordInput
            id="reg-repeat"
            value={repeat}
            onChange={setRepeat}
            autoComplete="new-password"
            errors={errors}
          />
        </Field>
      </div>
      <div className="field">
        <label className="check">
          <input
            type="checkbox"
            checked={terms}
            aria-invalid={errors['reg-terms'] ? true : undefined}
            aria-describedby={errors['reg-terms'] ? 'reg-terms-error' : undefined}
            onChange={(event) => setTerms(event.target.checked)}
          />
          <span>
            {t('Akceptuję', 'I accept the')}{' '}
            <a href="/#regulamin" target="_blank" rel="noreferrer">
              {t('Regulamin', 'Terms')}
            </a>{' '}
            {t('i', 'and')}{' '}
            <a href="/#/polityka" target="_blank" rel="noreferrer">
              {t('Politykę prywatności', 'Privacy Policy')}
            </a>
            .
          </span>
        </label>
        {errors['reg-terms'] ? (
          <span className="field__error" id="reg-terms-error">
            {errors['reg-terms']}
          </span>
        ) : null}
      </div>
      <button type="submit" className="btn btn--primary auth__submit">
        {t('Załóż konto', 'Create account')}
      </button>
      {submitted ? (
        <OperatorHint onOperator={onOperator}>
          {t(
            'Rejestracja wymaga endpointu POST /api/auth/register (konto i sprzedawca), którego serwer jeszcze nie ma. Dane nie zostały nigdzie wysłane.',
            'Sign-up needs a POST /api/auth/register endpoint (account and merchant) the server doesn’t have yet. Nothing was sent anywhere.',
          )}
        </OperatorHint>
      ) : null}
      <p className="auth__switch">
        {t('Masz już konto?', 'Already have an account?')}{' '}
        <button type="button" className="link-btn" onClick={onLogin}>
          {t('Zaloguj się', 'Sign in')}
        </button>
      </p>
    </form>
  )
}

function ResetForm({ onOperator }: { onOperator: () => void }) {
  const t = useT()
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const next: Errors = {}
    if (!isEmail(email)) next['reset-email'] = t('Wpisz poprawny adres e-mail.', 'Enter a valid email address.')
    setErrors(next)
    setSubmitted(Object.keys(next).length === 0)
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h1 className="auth__title">{t('Nie pamiętasz hasła?', 'Forgot your password?')}</h1>
      <p className="auth__subtitle">
        {t(
          'Podaj e-mail konta. Wyślemy link do ustawienia nowego hasła.',
          'Enter your account email. We’ll send a link to set a new password.',
        )}
      </p>
      <Field id="reset-email" label={t('E-mail', 'Email')} error={errors['reset-email']}>
        <input
          {...inputProps('reset-email', errors)}
          type="email"
          value={email}
          autoComplete="email"
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <button type="submit" className="btn btn--primary auth__submit">
        {t('Wyślij link', 'Send link')}
      </button>
      {submitted ? (
        <OperatorHint onOperator={onOperator}>
          {t(
            'Reset hasła wymaga endpointu POST /api/auth/password-reset, którego serwer jeszcze nie ma.',
            'Password reset needs a POST /api/auth/password-reset endpoint the server doesn’t have yet.',
          )}
        </OperatorHint>
      ) : null}
    </form>
  )
}
