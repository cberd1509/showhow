#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Settings come from the shell first, then the per-user config (`showhow key` writes it; it survives
// plugin updates), then a .env in the tool's own folder (a clone). Nothing overrides the shell.
const sources = [
  ['config', path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'showhow', '.env')],
  ['tool .env', path.resolve(import.meta.dirname, '..', '.env')],
];
const hadKey = process.env.ELEVENLABS_API_KEY !== undefined;
for (const [name, file] of sources) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || !m[2] || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    if (m[1] === 'ELEVENLABS_API_KEY') process.env.SHOWHOW_KEY_FROM = `${name}: ${file}`;
  }
}
if (hadKey) process.env.SHOWHOW_KEY_FROM = 'environment';

await import('../src/cli.ts');
