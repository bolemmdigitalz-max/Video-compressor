#!/usr/bin/env node
/**
 * Privacy audit for spec 08. Scans the source for anything that could move media
 * off the device, and fails the build if it finds one.
 *
 *   npm run audit:privacy
 */
import { readFile, readdir, stat } from 'node:fs/promises'
import { extname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(import.meta.url), '../..')
const sourceDir = join(root, 'src')

const RULES = [
  {
    id: 'no-network-upload',
    pattern: /\b(fetch|XMLHttpRequest|navigator\.sendBeacon|WebSocket|EventSource)\s*\(/,
    message: 'a network primitive — media must never leave the device',
    // The app must not fetch at all; even same-origin fetches are listed for review.
    allowed: [],
  },
  {
    id: 'no-persistent-media',
    pattern: /\b(localStorage|sessionStorage|indexedDB|openDatabase)\s*\.\s*(setItem|set|add|put)/,
    // Two keys are legitimate and must carry an inline `privacy:ok` marker:
    // the theme choice and the calculator window position. No media, ever.
    message: 'a persistent write — only the theme and the calculator position may be stored, and only with a privacy:ok marker',
    allowed: [],
  },
  {
    id: 'no-analytics',
    // Call-shaped only, so prose such as "No analytics" in the footer is not a hit.
    pattern: /\b(gtag|dataLayer|fbq|_paq|mixpanel|amplitude)\s*[.([]|\bwindow\.ga\s*[=(]|\banalytics\s*[.:(]/i,
    message: 'analytics — none are allowed',
    allowed: [],
  },
  {
    id: 'no-remote-origin',
    pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+\.[a-z]{2,}/gi,
    message: 'an absolute external URL — every asset must be same-origin',
    allowed: [],
  },
]

const SKIP = new Set(['setup.ts'])

async function* walk(dir) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry)
    if ((await stat(full)).isDirectory()) yield* walk(full)
    else if (['.ts', '.tsx'].includes(extname(full)) && !full.endsWith('.test.ts') && !full.endsWith('.test.tsx')) {
      yield full
    }
  }
}

const findings = []
let scanned = 0

for await (const file of walk(sourceDir)) {
  if (SKIP.has(file.split('/').pop())) continue
  scanned += 1
  const lines = (await readFile(file, 'utf8')).split('\n')

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    // Comments explain what is *not* done; they are not violations.
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
    // An explicit, reviewed exception. Search the codebase for `privacy:ok`.
    if (line.includes('privacy:ok')) return

    for (const rule of RULES) {
      rule.pattern.lastIndex = 0
      if (!rule.pattern.test(line)) continue
      if (rule.allowed.some((token) => line.includes(token))) continue
      findings.push({
        rule: rule.id,
        file: relative(root, file),
        line: index + 1,
        message: rule.message,
        text: trimmed.slice(0, 110),
      })
    }
  })
}

console.log(`[privacy] scanned ${scanned} source files`)

if (findings.length === 0) {
  console.log('[privacy] no uploads, no analytics, no media in storage, no external origins')
  process.exit(0)
}

console.error(`[privacy] ${findings.length} finding(s):`)
for (const finding of findings) {
  console.error(`  ${finding.rule}  ${finding.file}:${finding.line}`)
  console.error(`    ${finding.text}`)
  console.error(`    → ${finding.message}`)
}
process.exit(1)
