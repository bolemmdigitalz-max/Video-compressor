#!/usr/bin/env node
/**
 * Copies the single-threaded ffmpeg-core JS + WASM out of node_modules into
 * public/vendor/ffmpeg so they are served verbatim by both `vite dev` and
 * `vite preview`. Keeping them out of the bundler avoids hashing a 32 MB binary
 * on every build and keeps the wasm MIME type under our control.
 *
 * Runs on `postinstall`, `predev` and `prebuild`. Re-running it is a no-op when
 * the source files are unchanged.
 */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = join(root, 'public', 'vendor', 'ffmpeg')

const files = [
  { from: join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm', 'ffmpeg-core.js'), to: 'ffmpeg-core.js' },
  { from: join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'esm', 'ffmpeg-core.wasm'), to: 'ffmpeg-core.wasm' },
]

const digest = async (path) => createHash('sha256').update(await readFile(path)).digest('hex')

const exists = async (path) => {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

let copied = 0
await mkdir(targetDir, { recursive: true })

for (const { from, to } of files) {
  if (!(await exists(from))) {
    console.error(`[ffmpeg-assets] missing ${from} — run "npm install" first`)
    process.exit(1)
  }
  const dest = join(targetDir, to)
  if ((await exists(dest)) && (await digest(dest)) === (await digest(from))) {
    continue
  }
  await copyFile(from, dest)
  copied += 1
  console.log(`[ffmpeg-assets] wrote public/vendor/ffmpeg/${to}`)
}

if (copied === 0) console.log('[ffmpeg-assets] already up to date')
