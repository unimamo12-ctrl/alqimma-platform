/**
 * Strip UTF-8 BOMs.
 *
 * PowerShell 5.1's `Set-Content -Encoding UTF8` writes a BOM, and several files
 * were edited with it. A BOM is legal in TypeScript and invisible in an editor,
 * but it is *not* legal at the start of a JSON document: Prisma failed with
 * `Unexpected token "\ufeff"` and no file/line, which is a miserable thing to
 * debug from a stack trace in a dependency.
 *
 *   node scripts/strip-bom.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set(['node_modules', '.next', '.git', '.devin', '.claude', '.cursor', '.agents']);
const EXTS = new Set(['.json', '.ts', '.tsx', '.mjs', '.cjs', '.sql', '.css', '.prisma', '.md']);

const found = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    const dot = entry.lastIndexOf('.');
    if (dot === -1 || !EXTS.has(entry.slice(dot))) continue;

    const bytes = readFileSync(full);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      writeFileSync(full, bytes.subarray(3));
      found.push(full);
    }
  }
}

walk('.');

if (found.length === 0) {
  console.log('no BOMs found');
} else {
  console.log(`stripped ${found.length} BOM(s):`);
  for (const f of found) console.log(`  ${f}`);
}