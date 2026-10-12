// Talks to WebBridge.kt. In a normal browser (no CarrotNative) a local mock is used instead.

import { installMock } from './mock'

interface NativeApi {
  call(id: string, method: string, args: string): void
  ready(): void
}

interface Hooks {
  reply(id: string, ok: boolean, value: unknown): void
  emit(name: string, payload: unknown): void
  back(): boolean
}

declare global {
  interface Window {
    CarrotNative?: NativeApi
    __native: Hooks
  }
}

type Listener = (payload: any) => void

const waiting = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }>()
const listeners = new Map<string, Set<Listener>>()
let seq = 0
let backHandler: () => boolean = () => false

window.__native = {
  reply(id, ok, value) {
    const w = waiting.get(id)
    if (!w) return
    waiting.delete(id)
    if (ok) w.resolve(value)
    else w.reject(new Error(typeof value === 'string' ? value : 'Something went wrong'))
  },
  emit(name, payload) {
    listeners.get(name)?.forEach(l => l(payload))
  },
  back() {
    return backHandler()
  },
}

// Chosen on first use, so the desktop layer can install itself before anything calls it.
let resolved: NativeApi | null = null
const native = (): NativeApi => (resolved ??= window.CarrotNative ?? installMock())

/** Calls a native method; rejects with the server's or app's error message. */
export function call<T = unknown>(method: string, args: Record<string, unknown> = {}): Promise<T> {
  const id = String(++seq)
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve, reject })
    native().call(id, method, JSON.stringify(args))
  })
}

export function on(name: string, l: Listener) {
  if (!listeners.has(name)) listeners.set(name, new Set())
  listeners.get(name)!.add(l)
  return () => listeners.get(name)!.delete(l)
}

export const setBackHandler = (h: () => boolean) => { backHandler = h }

/** Tells the app the page is ready; it then sends the current state and data. */
export const ready = () => native().ready()

export const isMock = !window.CarrotNative
