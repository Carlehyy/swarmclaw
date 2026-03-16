import { NextResponse } from 'next/server'
import { safeParseBody } from '@/lib/server/safe-parse-body'
import { patchAgent } from '@/lib/server/storage'
import { logActivity } from '@/lib/server/storage'
import { notify } from '@/lib/server/ws-hub'

export async function PATCH(req: Request) {
  const { data: body, error } = await safeParseBody<Record<string, unknown>>(req)
  if (error) return error

  const patches = body.patches
  if (!Array.isArray(patches) || patches.length === 0) {
    return NextResponse.json({ error: 'patches must be a non-empty array' }, { status: 400 })
  }

  let updated = 0
  const errors: string[] = []

  for (const entry of patches) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push('Invalid patch entry (not an object)')
      continue
    }
    const { id, patch } = entry as { id?: unknown; patch?: unknown }
    if (typeof id !== 'string' || !id.trim()) {
      errors.push('Patch entry missing valid id')
      continue
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      errors.push(`Patch for ${id} is not a valid object`)
      continue
    }

    const result = patchAgent(id, (current) => {
      if (!current) return null
      return { ...current, ...(patch as Record<string, unknown>), updatedAt: Date.now() }
    })

    if (result) {
      updated++
      logActivity({
        entityType: 'agent',
        entityId: id,
        action: 'updated',
        actor: 'user',
        summary: `Bulk patch: updated agent "${result.name || id}"`,
      })
    } else {
      errors.push(`Agent ${id} not found`)
    }
  }

  if (updated > 0) notify('agents')
  return NextResponse.json({ updated, errors })
}
