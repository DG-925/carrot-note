// HTTP for the desktop app. Inside Tauri requests go through the Rust side (no browser CORS
// limits, so the same server as the phone app works); in a plain browser window.fetch is used.

import { fetch as tauriFetch } from '@tauri-apps/plugin-http'

export const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const httpFetch: typeof fetch = (input, init) => (inTauri ? tauriFetch(input as any, init) : window.fetch(input, init))
