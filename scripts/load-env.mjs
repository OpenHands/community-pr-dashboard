import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function parseValue(rawValue) {
  const value = rawValue.trim();

  if (!value) {
    return '';
  }

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    const inner = value.slice(1, -1);

    if (quote === '"') {
      return inner
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }

    return inner;
  }

  return value;
}

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const entries = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith('#')) {
      continue;
    }

    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    entries.push([key, parseValue(rawValue)]);
  }

  return entries;
}

export function loadEnvFiles(options = {}) {
  const cwd = options.cwd || process.cwd();
  const filenames = options.filenames || ['.env', '.env.local'];
  const lockedKeys = new Set(Object.keys(process.env));
  const loadedFiles = [];

  for (const filename of filenames) {
    const filePath = path.join(cwd, filename);
    if (!existsSync(filePath)) {
      continue;
    }

    for (const [key, value] of parseEnvFile(filePath)) {
      if (lockedKeys.has(key)) {
        continue;
      }

      process.env[key] = value;
    }

    loadedFiles.push(filename);
  }

  return loadedFiles;
}
