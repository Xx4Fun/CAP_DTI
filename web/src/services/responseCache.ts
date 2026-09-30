// ponytail: tiny per-tab promise cache for a few read-mostly lists; move to a query library if
// cache rules grow beyond "TTL + clear on any write".
const entries = new Map<string, { at: number; value: Promise<unknown> }>()

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = entries.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>

  const value = load()
  entries.set(key, { at: Date.now(), value })
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key)
  })
  return value
}

export function clearResponseCache(): void {
  entries.clear()
}
