import { useMemo, useState } from 'react'
import { Dashboard } from './Dashboard'
import { AuthLayout } from './components/AuthLayout'
import { AuthScreen } from './components/AuthScreen'
import { LoginSettings } from './components/LoginSettings'
import { createApiClient } from './lib/api'
import { loadSettings, saveSettings } from './lib/settings'
import type { Settings } from './lib/settings'
import './App.css'

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings())
  const [showSettings, setShowSettings] = useState(false)

  const configured = settings.token.trim().length > 0
  const client = useMemo(() => createApiClient(settings), [settings])

  function handleSave(next: Settings) {
    if (next.token && window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname)
    }
    saveSettings(next)
    setSettings(next)
    setShowSettings(false)
  }

  function handleLogout() {
    handleSave({ ...settings, token: '' })
    window.history.replaceState(null, '', '#logowanie')
  }

  if (!configured) {
    return (
      <AuthLayout>
        <AuthScreen initial={settings} onOperatorSave={handleSave} />
      </AuthLayout>
    )
  }

  if (showSettings) {
    return (
      <AuthLayout>
        <LoginSettings
          initial={settings}
          onSave={handleSave}
          onCancel={() => setShowSettings(false)}
        />
      </AuthLayout>
    )
  }

  return (
    <Dashboard
      client={client}
      settings={settings}
      onOpenSettings={() => setShowSettings(true)}
      onLogout={handleLogout}
    />
  )
}
