#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');

const marker = /^(<{7}|={7}|>{7})/m;
const textExtensions = new Set([
  '.css', '.ejs', '.env', '.example', '.html', '.js', '.json', '.md', '.svg', '.txt', '.yml', '.yaml'
]);

function isLikelyTextFile(file) {
  if (file.includes('/.git/') || file.startsWith('.git/')) return false;
  if (file.includes('/node_modules/') || file.startsWith('node_modules/')) return false;
  if (file === '.env.example') return true;
  const lastDot = file.lastIndexOf('.');
  return lastDot === -1 || textExtensions.has(file.slice(lastDot));
}

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter(isLikelyTextFile);

const bad = [];
for (const file of files) {
  const contents = readFileSync(file, 'utf8');
  if (marker.test(contents)) bad.push(file);
}

if (bad.length) {
  console.error(`Conflict markers found in ${bad.length} file(s):`);
  for (const file of bad) console.error(`- ${file}`);
  process.exit(1);
}

console.log(`No conflict markers found in ${files.length} tracked text file(s).`);
