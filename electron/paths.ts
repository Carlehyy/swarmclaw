import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

export interface RuntimePaths {
  swarmclawHome: string
  dataDir: string
  workspaceDir: string
  browserProfilesDir: string
  standaloneEntry: string
  standaloneDir: string
  publicDir: string
  staticDir: string
}

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

function isDev(): boolean {
  return !app.isPackaged
}

export function resolveRuntimePaths(): RuntimePaths {
  const swarmclawHome = path.join(app.getPath('userData'), 'home')
  const dataDir = path.join(swarmclawHome, 'data')
  const workspaceDir = path.join(swarmclawHome, 'workspace')
  const browserProfilesDir = path.join(swarmclawHome, 'browser-profiles')

  ensureDir(swarmclawHome)
  ensureDir(dataDir)
  ensureDir(workspaceDir)
  ensureDir(browserProfilesDir)

  const appRoot = isDev()
    ? path.resolve(__dirname, '..')
    : process.resourcesPath

  const standaloneDir = path.join(appRoot, '.next', 'standalone')
  const standaloneEntry = path.join(standaloneDir, 'server.js')
  const publicDir = path.join(standaloneDir, 'public')
  const staticDir = path.join(standaloneDir, '.next', 'static')

  return {
    swarmclawHome,
    dataDir,
    workspaceDir,
    browserProfilesDir,
    standaloneEntry,
    standaloneDir,
    publicDir,
    staticDir,
  }
}
