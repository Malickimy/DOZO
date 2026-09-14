import { useMemo, useState } from 'react'
import { Dashboard } from './Dashboard'
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
    saveSettings(next)
    setSettings(next)
    setShowSettings(false)
  }

  if (!configured || showSettings) {
    return (
      <LoginSettings
        initial={settings}
        onSave={handleSave}
        onCancel={configured ? () => setShowSettings(false) : undefined}
      />
    )
  }

  return (
    <Dashboard
      client={client}
      settings={settings}
      onOpenSettings={() => setShowSettings(true)}
    />
  )
}
