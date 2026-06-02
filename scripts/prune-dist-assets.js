#!/usr/bin/env bun
/**
 * Post-build: remove assets the web app never references from dist/, so the
 * deploy (Netlify) doesn't ship hundreds of MB of unused models/sounds/textures.
 *
 * Source `assets/` is left untouched — this only prunes the copied `dist/assets/`.
 * Verified unused (no code reference; sound paths are explicit in
 * lib/config/audioConfig.js, so dynamic loading can't reach these):
 */
import { rm, stat, readdir } from 'fs/promises'
import { join, relative } from 'path'

const DIST_ASSETS = './dist/assets'

// Folders/files under dist/assets/ that the web build does not use.
const UNUSED = [
  // 3D model dumps not wired into the app
  'vegetation_realistic',
  'decentraland',
  'stones',
  'trees',
  'metadata',
  'preview.png',
  // Sound categories not referenced by audioConfig.js
  'sounds/Water',
  'sounds/Waves',
  'sounds/Wind',
  'sounds/Birds + Rain',
]

// Dirs where only specific files are used — delete everything else inside.
// sources-textures ships full high-res PNG source sets (~426 MB); the app only
// loads 5 compressed .ktx2 normal maps (terrainConfig.js + RockSystem.js).
const KEEP_ONLY = {
  'textures/sources-textures': [
    'grass/Grass001_1K-PNG/normal.ktx2',
    'rock/Rock035_1K-PNG/normal.ktx2',
    'sand/sand_002/normal.ktx2',
    'snow/Snow010A_1K-PNG/normal.ktx2',
    'water/waternormals.ktx2',
  ],
}

const walk = async (dir) => {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...await walk(p))
    else out.push(p)
  }
  return out
}

const dirSize = async (p) => {
  try {
    const { execSync } = await import('child_process')
    return execSync(`du -sh "${p}" 2>/dev/null | cut -f1`).toString().trim()
  } catch { return '?' }
}

let removed = 0
for (const rel of UNUSED) {
  const p = join(DIST_ASSETS, rel)
  try {
    await stat(p)
    const sz = await dirSize(p)
    await rm(p, { recursive: true, force: true })
    console.log(`  pruned ${sz.padStart(6)}  assets/${rel}`)
    removed++
  } catch {
    // not present (already absent) — skip silently
  }
}
// Keep-only pass: inside each dir, delete every file not in the keep list.
for (const [rel, keep] of Object.entries(KEEP_ONLY)) {
  const base = join(DIST_ASSETS, rel)
  try {
    await stat(base)
  } catch { continue }
  const keepSet = new Set(keep.map((k) => join(base, k)))
  let prunedFiles = 0
  for (const f of await walk(base)) {
    if (!keepSet.has(f)) { await rm(f, { force: true }); prunedFiles++ }
  }
  // Remove now-empty directories (deepest first).
  const dirs = new Set()
  const collect = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) { const p = join(d, e.name); dirs.add(p); await collect(p) }
    }
  }
  await collect(base)
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    try { await rm(d, { recursive: false }) } catch { /* not empty */ }
  }
  console.log(`  kept ${keep.length} files in assets/${rel} (pruned ${prunedFiles})`)
}

console.log(`[prune] removed ${removed} unused asset paths from dist/`)
