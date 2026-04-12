import { app, BrowserWindow, dialog, shell } from 'electron'
import { resolveRuntimePaths, RuntimePaths } from './paths'
import { ServerHandle, startEmbeddedServer } from './server-lifecycle'
import { buildAppMenu } from './menu'

const DEV_URL_DEFAULT = 'http://127.0.0.1:3456'

let mainWindow: BrowserWindow | null = null
let serverHandle: ServerHandle | null = null
let isQuitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.on('ready', () => void onReady())

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('activate', () => {
    if (mainWindow !== null) return
    if (serverHandle) {
      createMainWindow(serverHandle.url)
    } else if (!app.isPackaged) {
      createMainWindow(process.env.SWARMCLAW_DEV_URL || DEV_URL_DEFAULT)
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  app.on('will-quit', async (event) => {
    if (!serverHandle) return
    event.preventDefault()
    try {
      await serverHandle.stop()
    } finally {
      serverHandle = null
      app.exit(0)
    }
  })
}

async function onReady(): Promise<void> {
  const paths = resolveRuntimePaths()
  buildAppMenu(paths, () => mainWindow)

  if (!app.isPackaged) {
    const devUrl = process.env.SWARMCLAW_DEV_URL || DEV_URL_DEFAULT
    console.log(`[swarmclaw] dev mode, loading ${devUrl}`)
    createMainWindow(devUrl)
    return
  }

  try {
    serverHandle = await startEmbeddedServer({
      paths,
      onStdout: (c) => process.stdout.write(`[swarmclaw] ${c}`),
      onStderr: (c) => process.stderr.write(`[swarmclaw] ${c}`),
      onExit: (code, signal) => {
        if (!isQuitting) {
          console.error(`[swarmclaw] server exited unexpectedly (code=${code}, signal=${signal ?? 'none'})`)
          void showServerCrashDialog(code, signal)
        }
      },
    })
  } catch (err) {
    await showStartupFailureDialog(err, paths)
    app.exit(1)
    return
  }

  createMainWindow(serverHandle.url)
  void import('./updater').then((m) => m.initAutoUpdater())
}

function createMainWindow(startUrl: string): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0b0b0f',
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  const wc = mainWindow.webContents
  if (!app.isPackaged) wc.openDevTools({ mode: 'detach' })

  wc.on('did-start-loading', () => console.log('[swarmclaw] did-start-loading'))
  wc.on('did-finish-load', () => console.log('[swarmclaw] did-finish-load'))
  wc.on('did-fail-load', (_e, code, desc, url) =>
    console.error(`[swarmclaw] did-fail-load code=${code} desc=${desc} url=${url}`),
  )
  wc.on('render-process-gone', (_e, details) =>
    console.error(`[swarmclaw] render-process-gone reason=${details.reason}`),
  )
  wc.on('unresponsive', () => console.error('[swarmclaw] webContents unresponsive'))

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(startUrl)) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  void mainWindow.loadURL(startUrl).catch((err) => {
    console.error('[swarmclaw] loadURL rejected:', err)
  })
}

async function showServerCrashDialog(code: number | null, signal: NodeJS.Signals | null): Promise<void> {
  const res = await dialog.showMessageBox({
    type: 'error',
    buttons: ['Quit', 'Copy logs path'],
    defaultId: 0,
    cancelId: 0,
    title: 'SwarmClaw stopped',
    message: 'The SwarmClaw server exited unexpectedly.',
    detail: `code=${code ?? 'null'} signal=${signal ?? 'none'}`,
  })
  if (res.response === 1 && serverHandle) {
    // best-effort: don't await
  }
  app.exit(1)
}

async function showStartupFailureDialog(err: unknown, paths: RuntimePaths): Promise<void> {
  const message = err instanceof Error ? err.message : String(err)
  await dialog.showMessageBox({
    type: 'error',
    buttons: ['Quit'],
    defaultId: 0,
    title: 'SwarmClaw failed to start',
    message: 'The embedded server did not start.',
    detail: `${message}\n\nStandalone entry: ${paths.standaloneEntry}\nData dir: ${paths.dataDir}`,
  })
}
