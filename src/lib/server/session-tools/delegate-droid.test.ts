import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

describe('droid delegate backend wiring', () => {
  it('coerces Factory Droid aliases to the droid backend', async () => {
    const mod = await import('./delegate')
    const anyMod = mod as unknown as Record<string, unknown>
    const coerceDelegateBackend = anyMod.coerceDelegateBackend as ((value: unknown) => string | null) | undefined
    if (typeof coerceDelegateBackend !== 'function') return

    for (const alias of ['droid', 'droid cli', 'droid-cli', 'droid_cli', 'factory', 'factory droid', 'factory-droid']) {
      assert.equal(coerceDelegateBackend(alias), 'droid', `alias ${alias} should coerce to droid`)
    }
  })

  it('includes droid in the delegation JSON-schema enum', async () => {
    const { default: fs } = await import('node:fs')
    const { default: path } = await import('node:path')
    const delegatePath = path.resolve(process.cwd(), 'src/lib/server/session-tools/delegate.ts')
    const source = fs.readFileSync(delegatePath, 'utf-8')
    assert.match(source, /enum: \[[^\]]*'droid'[^\]]*\]/, 'droid must appear in the delegate backend enum')
    assert.match(source, /DELEGATE_BACKEND_ORDER[\s\S]{0,200}'droid'/, 'droid must appear in DELEGATE_BACKEND_ORDER')
  })
})
