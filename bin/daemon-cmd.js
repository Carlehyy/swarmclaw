#!/usr/bin/env node
'use strict'
/* eslint-disable @typescript-eslint/no-require-imports */

const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')

const {
  BROWSER_PROFILES_DIR,
  DATA_DIR,
  PKG_ROOT,
  SWARMCLAW_HOME,
  WORKSPACE_DIR,
  resolvePackageBuildRoot,
} = require('./server-cmd.js')

function printHelp() {
  const help = `
Usage: swarmclaw daemon run [options]

Run the detached SwarmClaw runtime daemon outside the public web process.

Options:
  -d, --detach      Start daemon in background
  --port <port>     Admin port to bind on localhost (default: random)
  --token <token>   Admin bearer token (default: random)
  -h, --help        Show this help message

Other daemon controls remain available through the API-backed CLI:
  swarmclaw daemon status
  swarmclaw daemon start
  swarmclaw daemon stop
  swarmclaw daemon health-check
`.trim()
  console.log(help)
}

function resolveRoot() {
  const buildRoot = process.env.SWARMCLAW_BUILD_ROOT || resolvePackageBuildRoot(PKG_ROOT)
  if (fs.existsSync(path.join(buildRoot, 'src', 'lib', 'server', 'daemon', 'daemon-runtime.ts'))) return buildRoot
  return PKG_ROOT
}

function resolveEntry(root) {
  const entry = path.join(root, 'src', 'lib', 'server', 'daemon', 'daemon-runtime.ts')
  if (!fs.existsSync(entry)) {
    throw new Error(`Daemon runtime entry not found at ${entry}`)
  }
  return entry
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to reserve daemon port.')))
        return
      }
      const port = address.port
      server.close((err) => {
        if (err) reject(err)
        else resolve(port)
      })
    })
  })
}

function buildEnv(root, port, token) {
  return {
    ...process.env,
    SWARMCLAW_HOME,
    DATA_DIR,
    WORKSPACE_DIR,
    BROWSER_PROFILES_DIR,
    SWARMCLAW_PACKAGE_ROOT: PKG_ROOT,
    SWARMCLAW_BUILD_ROOT: root,
    SWARMCLAW_RUNTIME_ROLE: 'daemon',
    SWARMCLAW_DAEMON_BACKGROUND_SERVICES: '1',
    SWARMCLAW_DAEMON_ADMIN_PORT: String(port),
    SWARMCLAW_DAEMON_ADMIN_TOKEN: token,
  }
}

async function runDaemon(options) {
  const root = resolveRoot()
  const entry = resolveEntry(root)
  const port = options.port || await reservePort()
  const token = options.token || crypto.randomBytes(24).toString('hex')
  const env = buildEnv(root, port, token)
  const args = ['--no-warnings', '--import', 'tsx', entry, '--port', String(port), '--token', token]

  if (options.detach) {
    const logPath = path.join(SWARMCLAW_HOME, 'daemon.log')
    fs.mkdirSync(path.dirname(logPath), { recursive: true })
    const logStream = fs.openSync(logPath, 'a')
    const child = spawn(process.execPath, args, {
      cwd: root,
      detached: true,
      env,
      stdio: ['ignore', logStream, logStream],
    })
    child.unref()
    console.log(`[swarmclaw] Daemon started in background (PID: ${child.pid})`)
    console.log(`[swarmclaw] Admin port: ${port}`)
    console.log(`[swarmclaw] Logs: ${logPath}`)
    return
  }

  console.log(`[swarmclaw] Starting daemon runtime on 127.0.0.1:${port}`)
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: 'inherit',
  })
  child.on('exit', (code) => {
    process.exit(code || 0)
  })
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal))
  }
}

async function main(args = process.argv.slice(3)) {
  let detach = false
  let port = null
  let token = ''
  let command = 'run'

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === 'run') {
      command = 'run'
    } else if (arg === '-d' || arg === '--detach') {
      detach = true
    } else if (arg === '--port' && index + 1 < args.length) {
      port = Number.parseInt(args[index + 1], 10)
      index += 1
    } else if (arg === '--token' && index + 1 < args.length) {
      token = args[index + 1] || ''
      index += 1
    } else if (arg === '-h' || arg === '--help' || arg === 'help') {
      printHelp()
      return
    } else {
      throw new Error(`Unknown daemon argument: ${arg}`)
    }
  }

  if (command !== 'run') {
    throw new Error(`Unsupported daemon command: ${command}`)
  }

  await runDaemon({ detach, port, token })
}

if (require.main === module) {
  void main().catch((err) => {
    console.error(`[swarmclaw] ${err?.message || String(err)}`)
    process.exit(1)
  })
}

module.exports = { main }
