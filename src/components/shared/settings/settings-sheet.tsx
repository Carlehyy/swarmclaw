'use client'

import { useEffect } from 'react'
import { useAppStore } from '@/stores/use-app-store'

/**
 * Legacy settings sheet — redirects to the full settings page.
 * Kept for backwards compat in case any code calls setSettingsOpen(true).
 */
export function SettingsSheet() {
  const open = useAppStore((s) => s.settingsOpen)
  const setOpen = useAppStore((s) => s.setSettingsOpen)
  const setActiveView = useAppStore((s) => s.setActiveView)

  useEffect(() => {
    if (open) {
      setActiveView('settings')
      setOpen(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return null
}
