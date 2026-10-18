#!/usr/bin/env node
/**
 * CSS Modularization Script
 * Extracts ALL sections from monolithic CSS into separate modules
 * Preserves exact content without modifications
 *
 * Source: styles-backup.css (original monolith)
 * Output: main.css + organized modules in themes/, base/, components/, views/
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cssPath = join(__dirname, 'styles-backup.css')
const css = readFileSync(cssPath, 'utf8')

// Find all section markers
const sectionRegex = /\/\* ={10} (.+?) ={10} \*\//g
const markers = []
let match

while ((match = sectionRegex.exec(css)) !== null) {
  markers.push({
    name: match[1].trim(),
    index: match.index,
    fullMatch: match[0]
  })
}

console.log(`Found ${markers.length} sections in styles-backup.css\n`)

// Define folder mappings based on section name patterns
const folderMap = {
  // Themes
  'Theme System': 'themes',
  'DARK THEME': 'themes',
  'LIGHT THEME': 'themes',
  'PURPLE THEME': 'themes',
  'MIDNIGHT THEME': 'themes',
  'FOREST THEME': 'themes',
  'SUNSET THEME': 'themes',

  // Base
  'Layout Variables': 'base',
  'Reset': 'base',
  'Layout Structure': 'base',
  'Responsive Design': 'base',
  'Scrollbar': 'base',
  'Utility Classes': 'base',

  // Components
  'Header': 'components',
  'Subheader': 'components',
  'Header Icons': 'components',
  'Icon Button': 'components',
  'Sidebar': 'components',
  'Main Content': 'components',
  'Card Grid': 'components',
  'List View': 'components',
  'Modal System': 'components',
  'Form Elements': 'components',
  'Duration Pills': 'components',
  'Pagination': 'components',
  'Toast Notifications': 'components',
  'Loading Spinner': 'components',
  'Rarity Badges': 'components',
  'On Sale Toggle': 'components',
  'Status Boxes': 'components',
  'Marketplace Paused': 'components',
  'Tabs': 'components',
  'Properties': 'components',
  'History': 'components',
  'Action Buttons': 'components',
  'Token Selector': 'components',
  'Activity Mode Toggle': 'components',
  'Transition Overlay': 'components',
  'Rarity Filter': 'components',
  'Status Filter': 'components',
  'Listing Type Filter': 'components',
  'Empty States': 'components',

  // Views
  'Analytics Modal': 'views',
  'Royalty Modal': 'views',
  'Detail Panel': 'views',
  'Inline Rename': 'views',
  'Asset Preview': 'views',
  'Summary Box': 'views',
  'Success State': 'views',
  'Inventory Grid': 'views',
  'Inventory Table': 'views',
  'Activity Feed': 'views',
  'Bundle Detail': 'views',
  'Bids List': 'views',
  'Sales History': 'views',
  'Bundle Selection': 'views',
  'Collections Grid': 'views',
  'View-Specific': 'views',
  'Stats Dashboard': 'views',
  'Trending Section': 'views',
  'Price Chart': 'views',
  'Recent Transactions': 'views',
  'Settings Modal': 'views',
  'Wizard Form': 'views',
  'OpenSea-Style': 'views',
  'Offers Table': 'views',
}

/**
 * Determine folder for a section based on its name
 */
function getFolder(sectionName) {
  for (const [pattern, folder] of Object.entries(folderMap)) {
    if (sectionName.includes(pattern)) return folder
  }
  return 'components' // Default
}

/**
 * Convert section name to filename
 */
function toFilename(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    + '.css'
}

// Clean existing module directories
const dirs = ['base', 'themes', 'components', 'views']
dirs.forEach(dir => {
  const path = join(__dirname, dir)
  if (existsSync(path)) rmSync(path, { recursive: true })
  mkdirSync(path, { recursive: true })
})

// Extract sections
const extracted = []
let totalLines = 0

for (let i = 0; i < markers.length; i++) {
  const current = markers[i]
  const next = markers[i + 1]

  // Extract content from current marker to next marker (or end of file)
  const startIndex = current.index
  const endIndex = next ? next.index : css.length
  const content = css.slice(startIndex, endIndex).trim()

  const folder = getFolder(current.name)
  const filename = toFilename(current.name)
  const filePath = join(__dirname, folder, filename)

  // Handle duplicate filenames by appending index
  let finalPath = filePath
  let counter = 1
  while (extracted.some(e => e.path === finalPath)) {
    finalPath = filePath.replace('.css', `-${counter}.css`)
    counter++
  }

  writeFileSync(finalPath, content)

  const lines = content.split('\n').length
  totalLines += lines

  extracted.push({
    name: current.name,
    folder,
    filename: finalPath.split('/').pop(),
    path: finalPath,
    lines
  })

  console.log(`✓ ${folder}/${finalPath.split('/').pop()} (${lines} lines)`)
}

console.log(`\n✓ Extracted ${extracted.length} sections (${totalLines} total lines)`)

// Generate main.css with imports in ORIGINAL SEQUENTIAL ORDER
// This preserves CSS cascade exactly as in the original monolith
let mainCss = `/* Marketplace - Modular CSS */
/* Auto-generated from styles-backup.css - ${new Date().toISOString().split('T')[0]} */
/* Total: ${extracted.length} modules, ${totalLines} lines */
/* IMPORTANT: Import order matches original monolith for correct cascade */

`

let currentFolder = ''
extracted.forEach(e => {
  if (e.folder !== currentFolder) {
    if (currentFolder) mainCss += '\n'
    mainCss += `/* ${e.folder.charAt(0).toUpperCase() + e.folder.slice(1)} */\n`
    currentFolder = e.folder
  }
  mainCss += `@import './${e.folder}/${e.filename}';\n`
})

writeFileSync(join(__dirname, 'main.css'), mainCss)
console.log('\n✓ Created main.css with all imports')

// Verify line count
const originalLines = css.split('\n').length
console.log(`\nVerification:`)
console.log(`  Original styles-backup.css: ${originalLines} lines`)
console.log(`  Extracted modules:   ${totalLines} lines`)
console.log(`  Difference:          ${originalLines - totalLines} lines (whitespace/overlap)`)

if (Math.abs(originalLines - totalLines) > 50) {
  console.log('\n⚠ Warning: Significant line count difference. Review extraction.')
} else {
  console.log('\n✓ Extraction verified successfully!')
}
