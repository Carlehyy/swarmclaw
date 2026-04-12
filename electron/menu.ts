import { app, BrowserWindow, Menu, MenuItemConstructorOptions, shell } from 'electron'
import { RuntimePaths } from './paths'

export function buildAppMenu(paths: RuntimePaths, getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin'

  const macAppMenu: MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'Open Data Folder',
        click: () => void shell.openPath(paths.swarmclawHome),
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  }

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      {
        label: 'Reload',
        accelerator: isMac ? 'Cmd+R' : 'Ctrl+R',
        click: () => getWindow()?.webContents.reload(),
      },
      {
        label: 'Force Reload',
        accelerator: isMac ? 'Shift+Cmd+R' : 'Ctrl+Shift+R',
        click: () => getWindow()?.webContents.reloadIgnoringCache(),
      },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { role: 'toggleDevTools' },
    ],
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    submenu: isMac
      ? [
          { role: 'minimize' },
          { role: 'zoom' },
          { type: 'separator' },
          { role: 'front' },
        ]
      : [{ role: 'minimize' }, { role: 'close' }],
  }

  const helpMenu: MenuItemConstructorOptions = {
    role: 'help',
    submenu: [
      {
        label: 'SwarmClaw Website',
        click: () => void shell.openExternal('https://swarmclaw.ai'),
      },
      {
        label: 'Documentation',
        click: () => void shell.openExternal('https://swarmclaw.ai/docs'),
      },
      {
        label: 'Report an Issue',
        click: () => void shell.openExternal('https://github.com/swarmclawai/swarmclaw/issues'),
      },
    ],
  }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [macAppMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    windowMenu,
    helpMenu,
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
