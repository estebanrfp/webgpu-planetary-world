#!/usr/bin/env bun
/**
 * Post-build script to fix import paths in Bun output
 * Bun's --splitting flag incorrectly strips "./" from relative imports
 * This script adds them back where needed
 */

import { readdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'

const DIST_DIR = './dist'

// Folders that exist in dist/lib - used to detect bare module names that need ./
const KNOWN_FOLDERS = ['views', 'wizards', 'components', 'tabs', 'blockchain', 'network', 'ui', 'systems', 'core', 'loaders', 'navigation', 'terrain']

// Known JS files that might be imported without path prefix
const KNOWN_FILES = [
  'utils.js', 
  'styles.js', 
  'index.js',
  // UI modules
  'AuthUI.js',
  'ProfileUI.js',
  'CockpitUI.js',
  'ControlPanelUI.js',
  'DebugUI.js',
  'InputManager.js',
  'ToastManager.js',
  'UIManager.js',
  // Blockchain modules
  'BlockchainManager.js',
  'MarketplaceCache.js',
  // Network modules
  'AuthManager.js',
  'NotificationManager.js',
  // Terrain modules
  'vehicle-renderer.js',
]

async function getAllJsFiles(dir) {
  const files = []
  const entries = await readdir(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await getAllJsFiles(fullPath))
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.map')) {
      files.push(fullPath)
    }
  }
  return files
}

function fixImports(content, filePath) {
  let fixed = content
  let changeCount = 0
  
  // ===== FIX DYNAMIC IMPORTS: import("...") =====
  
  // Fix pattern: import("folder/...) where folder is a known subfolder
  for (const folder of KNOWN_FOLDERS) {
    const pattern = new RegExp(`import\\("(${folder}/[^"]+)"\\)`, 'g')
    fixed = fixed.replace(pattern, (match, path) => {
      changeCount++
      return `import("./${path}")`
    })
  }
  
  // Fix pattern: import("file.js") for known files (without any path)
  for (const file of KNOWN_FILES) {
    const escapedFile = file.replace('.', '\\.')
    const pattern = new RegExp(`import\\("(${escapedFile})"\\)`, 'g')
    fixed = fixed.replace(pattern, (match, path) => {
      changeCount++
      return `import("./${path}")`
    })
  }
  
  // Fix pattern: import("lib/...) should be import("./lib/...)
  const libPattern = /import\("(lib\/[^"]+)"\)/g
  fixed = fixed.replace(libPattern, (match, path) => {
    changeCount++
    return `import("./${path}")`
  })
  
  // Generic catch-all for dynamic imports: any import("SomeFile.js") without path
  const genericDynamicPattern = /import\("([A-Za-z][A-Za-z0-9]*\.js)"\)/g
  fixed = fixed.replace(genericDynamicPattern, (match, path) => {
    changeCount++
    return `import("./${path}")`
  })
  
  // ===== FIX STATIC IMPORTS: from"..." or from "..." =====
  
  // Fix pattern: from"file.js" or from "file.js" for known files
  for (const file of KNOWN_FILES) {
    const escapedFile = file.replace('.', '\\.')
    // Match: from"file.js" or from "file.js" (with optional space)
    const pattern = new RegExp(`from\\s*"(${escapedFile})"`, 'g')
    fixed = fixed.replace(pattern, (match, path) => {
      changeCount++
      return `from"./${path}"`
    })
  }
  
  // Fix pattern: from"folder/..." for known folders
  for (const folder of KNOWN_FOLDERS) {
    const pattern = new RegExp(`from\\s*"(${folder}/[^"]+)"`, 'g')
    fixed = fixed.replace(pattern, (match, path) => {
      changeCount++
      return `from"./${path}"`
    })
  }
  
  // Fix pattern: from"lib/..." should be from"./lib/..."
  const libStaticPattern = /from\s*"(lib\/[^"]+)"/g
  fixed = fixed.replace(libStaticPattern, (match, path) => {
    changeCount++
    return `from"./${path}"`
  })
  
  // Generic catch-all for static imports: from"SomeFile.js" without path
  const genericStaticPattern = /from\s*"([A-Za-z][A-Za-z0-9]*\.js)"/g
  fixed = fixed.replace(genericStaticPattern, (match, path) => {
    changeCount++
    return `from"./${path}"`
  })
  
  if (changeCount > 0) {
    console.log(`  Fixed ${changeCount} imports in ${filePath}`)
  }
  
  return { content: fixed, changed: changeCount > 0 }
}

async function main() {
  console.log('Fixing imports in dist folder...\n')
  
  try {
    const files = await getAllJsFiles(DIST_DIR)
    let totalFixed = 0
    
    for (const file of files) {
      const content = await readFile(file, 'utf-8')
      const { content: fixed, changed } = fixImports(content, file)
      
      if (changed) {
        await writeFile(file, fixed, 'utf-8')
        totalFixed++
      }
    }
    
    console.log(`\nDone! Fixed ${totalFixed} files.`)
  } catch (error) {
    console.error('Error fixing imports:', error)
    process.exit(1)
  }
}

main()
