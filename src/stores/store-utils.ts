import { setIfChanged } from './set-if-changed'
import { hmrSingleton } from '@/lib/shared-utils'

/**
 * Create a standard store loader: try/catch + setIfChanged + console.warn.
 * Eliminates the repeated pattern across 15+ slice loaders.
 *
 * If `fallback` is provided, it is written to the store on error.
 * If omitted, the store is left unchanged on error.
 */
export function createLoader<S>(
  set: (partial: Partial<S>) => void,
  key: keyof S & string,
  fetcher: () => Promise<S[keyof S]>,
  fallback?: S[keyof S],
): () => Promise<void> {
  return async () => {
    try {
      const value = await fetcher()
      setIfChanged<S>(set, key, value)
    } catch (err: unknown) {
      console.warn('Store error:', err)
      if (fallback !== undefined) setIfChanged<S>(set, key, fallback)
    }
  }
}

/**
 * Deduplicate concurrent calls by ID. Uses hmrSingleton internally
 * so the inflight map survives HMR reloads.
 */
export function createInflightDeduplicator(singletonKey: string) {
  const inflight = hmrSingleton(singletonKey, () => new Map<string, Promise<void>>())
  return {
    dedup: async (id: string, fn: () => Promise<void>): Promise<void> => {
      const existing = inflight.get(id)
      if (existing) {
        await existing
        return
      }
      const promise = fn()
      inflight.set(id, promise)
      try {
        await promise
      } finally {
        if (inflight.get(id) === promise) inflight.delete(id)
      }
    },
  }
}
