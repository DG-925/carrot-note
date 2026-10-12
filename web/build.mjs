// Bundles src/ into the Android app's assets (app/src/main/assets/web).
import * as esbuild from 'esbuild'
import { cpSync, mkdirSync, rmSync } from 'node:fs'

const dev = process.argv.includes('--dev')
const out = new URL('../app/src/main/assets/web/', import.meta.url).pathname

rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

await esbuild.build({
  entryPoints: { app: 'src/main.tsx' },
  bundle: true,
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  format: 'iife',
  target: ['chrome90'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  outdir: out,
  loader: { '.ttf': 'file' },
  assetNames: 'fonts/[name]',
  legalComments: 'none',
  logLevel: 'info',
})
cpSync('src/index.html', out + 'index.html')
console.log('Built to', out)
