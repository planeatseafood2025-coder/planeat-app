/**
 * SWR-style cache — mirrors the original fetchWithCache / invalidateCache logic.
 * Dual-layer: in-memory Map + localStorage for persistence.
 */

const CACHE_PREFIX = 'planeat_v1_'
const CACHE_TTL = 600_000 // 10 minutes

interface CacheEntry<T> {
  data: T
  ts: number
}

const _dataCache = new Map<string, CacheEntry<unknown>>()

function saveToCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, ts: Date.now() }
  _dataCache.set(key, entry)
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry))
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'QuotaExceededError') localStorage.clear()
  }
}

function readFromCache<T>(key: string): CacheEntry<T> | null {
  // 1. Memory
  const mem = _dataCache.get(key)
  if (mem) return mem as CacheEntry<T>
  // 2. localStorage
  try {
    const stored = localStorage.getItem(CACHE_PREFIX + key)
    if (stored) {
      const parsed = JSON.parse(stored) as CacheEntry<T>
      _dataCache.set(key, parsed)
      return parsed
    }
  } catch {}
  return null
}

interface FetchWithCacheConfig<T> {
  onData: (data: T) => void
  onSkeleton?: () => void
  revalidate?: boolean
}

export async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  config: FetchWithCacheConfig<T>
): Promise<void> {
  const { onData, onSkeleton, revalidate = true } = config
  const now = Date.now()
  const cached = readFromCache<T>(cacheKey)
  const isFresh = cached && (now - cached.ts) < CACHE_TTL

  if (isFresh) {
    onData(cached!.data)
    if (revalidate) {
      fetcher()
        .then((fresh) => { saveToCache(cacheKey, fresh); onData(fresh) })
        .catch(() => {})
    }
    return
  }

  if (cached) {
    onData(cached.data)
  } else if (onSkeleton) {
    onSkeleton()
  }

  try {
    const fresh = await fetcher()
    saveToCache(cacheKey, fresh)
    onData(fresh)
  } catch (err) {
    if (!cached) throw err
    console.warn('[Cache] Background fetch failed:', err)
  }
}

export function invalidateCache(...keys: string[]): void {
  keys.forEach((k) => {
    if (k === '*') {
      _dataCache.clear()
      if (typeof window !== 'undefined') {
        Object.keys(localStorage)
          .filter((key) => key.startsWith(CACHE_PREFIX))
          .forEach((key) => localStorage.removeItem(key))
      }
      return
    }
    if (k.endsWith('*')) {
      const prefix = k.slice(0, -1)
      Array.from(_dataCache.keys())
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => _dataCache.delete(key))
      if (typeof window !== 'undefined') {
        Object.keys(localStorage)
          .filter((key) => key.startsWith(CACHE_PREFIX + prefix))
          .forEach((key) => localStorage.removeItem(key))
      }
    } else {
      _dataCache.delete(k)
      if (typeof window !== 'undefined') localStorage.removeItem(CACHE_PREFIX + k)
    }
  })
}

export function clearAllCacheMemory(): void {
  _dataCache.clear()
}
