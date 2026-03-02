#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

const result = spawnSync('npm', ['rebuild', 'better-sqlite3', '--silent'], {
  stdio: 'ignore',
})

if (result.error) {
  // Ignore optional native rebuild failures for install resilience.
}

if (!process.env.CI) {
  process.stdout.write('\n')
  process.stdout.write('Thanks for installing SwarmClaw.\n')
  process.stdout.write('If it helps you, please star the repo: https://github.com/swarmclawai/swarmclaw\n')
  process.stdout.write('\n')
}
