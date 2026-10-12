import { useEffect, useReducer, useRef, useState } from 'react'

export class ApiError extends Error {
  status = 0
}

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const r = await fetch('/api' + path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) {
    const e = new ApiError(data.error || (r.status >= 500 ? 'Server is not responding. Check your connection.' : `Request failed (${r.status})`))
    e.status = r.status
    throw e
  }
  return data
}

/** We only set essential cookies; this choice decides whether the chat is remembered on this device. */
export const consent = () => {
  try {
    return localStorage.getItem('cookie_consent')
  } catch {
    return null
  }
}

// ---- query cache: stale-while-revalidate, invalidated by live events ----
type Entry = { data?: any; error?: ApiError; at: number; p?: Promise<void>; subs: Set<() => void> }
const cache = new Map<string, Entry>()
const entry = (k: string) => {
  let e = cache.get(k)
  if (!e) cache.set(k, (e = { at: 0, subs: new Set() }))
  return e
}

function load(k: string) {
  const e = entry(k)
  e.p ??= api(k)
    .then((d) => {
      e.data = d
      e.error = undefined
    })
    .catch((err) => {
      e.error = err
    })
    .finally(() => {
      e.at = Date.now()
      e.p = undefined
      e.subs.forEach((f) => f())
    })
  return e.p
}

/** GET with cache. Data stays on screen while it refreshes, so live updates never flicker. */
export function useApi<T = any>(path: string | null, staleMs = 20_000) {
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  useEffect(() => {
    if (!path) return
    const e = entry(path)
    e.subs.add(rerender)
    if (Date.now() - e.at > staleMs) load(path)
    return () => void e.subs.delete(rerender)
  }, [path, staleMs])
  const e = path ? cache.get(path) : undefined
  return {
    data: e?.data as T | undefined,
    error: e?.error,
    loading: !!path && e?.data === undefined && !e?.error,
    reload: () => (path ? load(path) : Promise.resolve()),
  }
}

/** Refetch mounted queries whose path starts with any prefix; drop the rest. */
export function invalidate(...prefixes: string[]) {
  for (const [k, e] of cache)
    if (prefixes.some((p) => k.startsWith(p))) {
      if (e.subs.size) load(k)
      else cache.delete(k)
    }
}

/** Logout / "clear cache": forget every cached response (shared reception PCs). */
export async function clearAllCaches() {
  cache.clear()
  try {
    localStorage.removeItem('bot_sid')
    sessionStorage.clear()
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k)
  } catch {
    /* storage blocked: nothing cached there anyway */
  }
}

// ---- live sync (Server-Sent Events) ----
const INVALIDATE: Record<string, string[]> = {
  payment: ['/dashboard', '/bills', '/desk', '/patients'],
  bill: ['/bills', '/lab', '/desk', '/dashboard', '/queue', '/catalog/medicines', '/patients'],
  queue: ['/queue', '/desk', '/dashboard', '/patients'],
  booking: ['/queue', '/desk', '/dashboard', '/patients'],
  expense: ['/expenses', '/dashboard'],
  catalog: ['/catalog', '/settings', '/dashboard', '/queue'],
  patient: ['/patients'],
}
type Listener = (type: string, data: any) => void
const listeners = new Set<Listener>()
const statusSubs = new Set<(s: boolean) => void>()
let es: EventSource | null = null
let connected = false

export function startLive() {
  if (es) return
  es = new EventSource('/api/stream')
  const setStatus = (s: boolean) => {
    connected = s
    statusSubs.forEach((f) => f(s))
  }
  es.onopen = () => {
    setStatus(true)
    invalidate('/') // catch up on anything missed while disconnected
  }
  es.onerror = () => setStatus(false)
  for (const t of [...Object.keys(INVALIDATE), 'announce'])
    es.addEventListener(t, (ev) => {
      const data = JSON.parse((ev as MessageEvent).data)
      if (INVALIDATE[t]) invalidate(...INVALIDATE[t])
      listeners.forEach((l) => l(t, data))
    })
}
export function stopLive() {
  es?.close()
  es = null
  connected = false
}

export function useLiveEvent(fn: Listener) {
  useEffect(() => {
    listeners.add(fn)
    return () => void listeners.delete(fn)
  }, [fn])
}

export function useLiveStatus() {
  const [s, set] = useState(connected)
  useEffect(() => {
    statusSubs.add(set)
    return () => void statusSubs.delete(set)
  }, [])
  return s
}

/** Public, name-free queue snapshot for landing page, TV display and token tracking. */
export function usePublicQueue(onAnnounce?: (a: { token: number; doctor: string; room: string; doctorId: number }) => void) {
  const [queue, setQueue] = useState<PublicQueue[] | null>(null)
  const announce = useRef(onAnnounce)
  announce.current = onAnnounce
  useEffect(() => {
    let alive = true
    api<PublicQueue[]>('/public/queue').then((q) => alive && setQueue(q), () => alive && setQueue([]))
    const src = new EventSource('/api/public/stream')
    src.addEventListener('queue', (ev) => {
      const d = JSON.parse((ev as MessageEvent).data)
      if (d.snapshot) setQueue(d.snapshot)
    })
    src.addEventListener('announce', (ev) => announce.current?.(JSON.parse((ev as MessageEvent).data)))
    return () => {
      alive = false
      src.close()
    }
  }, [])
  return queue
}
export type PublicQueue = { doctorId: number; doctor: string; department: string; room: string; hours: string; current: number | null; next: number[]; waiting: number; booked: number; done: number }
