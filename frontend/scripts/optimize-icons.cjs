#!/usr/bin/env node
/**
 * MUI Icons Optimization Script
 * 
 * Converts barrel imports:
 *   import { Add, Edit } from '@mui/icons-material';
 * To direct imports:
 *   import AddIcon from '@mui/icons-material/Add';
 *   import EditIcon from '@mui/icons-material/Edit';
 * 
 * This reduces bundle size from ~6MB to ~50KB for typical usage.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// Regex to match MUI icons imports
const ICONS_IMPORT_REGEX = /import\s*\{([^}]+)\}\s*from\s*['"]@mui\/icons-material['"]\s*;?/g;

function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  
  // Check if file has MUI icons imports
  if (!content.includes('@mui/icons-material')) {
    return false;
  }
  
  let modified = content;
  let hasChanges = false;
  
  // Find all barrel imports
  const matches = [...content.matchAll(ICONS_IMPORT_REGEX)];
  
  for (const match of matches) {
    const fullImport = match[0];
    const iconsString = match[1];
    
    // Parse individual icon imports
    const icons = iconsString
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => {
        // Handle "IconName as Alias" syntax
        const parts = s.split(/\s+as\s+/);
        const iconName = parts[0].trim();
        const alias = parts[1]?.trim() || iconName;
        return { iconName, alias };
      });
    
    if (icons.length === 0) continue;
    
    // Generate direct imports
    const directImports = icons
      .map(({ iconName, alias }) => {
        // Remove "Icon" suffix from icon name for the path
        const baseName = iconName.replace(/Icon$/, '');
        return `import ${alias} from '@mui/icons-material/${baseName}';`;
      })
      .join('\n');
    
    modified = modified.replace(fullImport, directImports);
    hasChanges = true;
  }
  
  if (hasChanges) {
    fs.writeFileSync(filePath, modified, 'utf-8');
    return true;
  }
  
  return false;
}

function walkDir(dir, callback) {
  const files = fs.readdirSync(dir);
  
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (!file.startsWith('.') && file !== 'node_modules') {
        walkDir(filePath, callback);
      }
    } else if (file.endsWith('.jsx') || file.endsWith('.js') || file.endsWith('.tsx')) {
      callback(filePath);
    }
  }
}

console.log('🎨 Optimizing MUI Icons imports...\n');

let filesModified = 0;
let totalFiles = 0;

walkDir(SRC_DIR, (filePath) => {
  totalFiles++;
  const relativePath = path.relative(SRC_DIR, filePath);
  
  if (processFile(filePath)) {
    console.log(`  ✓ ${relativePath}`);
    filesModified++;
  }
});

console.log(`\n✅ Done! Modified ${filesModified} of ${totalFiles} files.`);
console.log('   Run "npm run build" to see the bundle size improvement.\n');

