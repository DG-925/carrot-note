// Bundles src/ into the Android app's assets (app/src/main/assets/web), or with --desktop into
// the Tauri desktop app (desktop/dist).
import * as esbuild from 'esbuild'
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dev = process.argv.includes('--dev')
const desktop = process.argv.includes('--desktop')
const out = fileURLToPath(new URL(desktop ? '../desktop/dist/' : '../app/src/main/assets/web/', import.meta.url))
const version = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await esbuild.build({
  entryPoints: { app: desktop ? 'src/desktop.tsx' : 'src/main.tsx' },
  define: { __APP_VERSION__: JSON.stringify(version) },
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  format: 'iife',
  target: desktop ? ['chrome105', 'safari15'] : ['chrome90'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  outdir: out,
  loader: { '.ttf': 'file' },
  assetNames: 'fonts/[name]',
  legalComments: 'none',
  logLevel: 'info',
})
if (desktop) {
  // The desktop app's security policy is set by Tauri (tauri.conf.json), so the page's own is left out.
  const html = readFileSync('src/index.html', 'utf8').replace(/\s*<meta http-equiv="Content-Security-Policy"[^>]*>/, '')
  writeFileSync(join(out, 'index.html'), html)
} else cpSync('src/index.html', join(out, 'index.html'))
console.log('Built to', out)
