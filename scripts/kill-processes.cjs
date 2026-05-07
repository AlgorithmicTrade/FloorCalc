#!/usr/bin/env node

/**
 * Завершает процессы, способные удерживать handle на app.asar / win-unpacked /
 * выходные артефакты electron-builder. Используется build-safe.cjs перед
 * очисткой release/.
 *
 * Молча игнорирует «процесс не найден» (taskkill exit=128) — это нормальный
 * случай чистой системы.
 */

const { execSync } = require('child_process');

const TARGETS = [
  'FloorCalc.exe',
  'electron.exe',
  'app-builder.exe',
  '7z.exe',
  'electron-builder.exe',
];

function killProcess(name) {
  try {
    execSync(`taskkill /F /T /IM "${name}"`, { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch (_err) {
    return false;
  }
}

async function killProcesses() {
  const killed = [];
  for (const name of TARGETS) {
    if (killProcess(name)) killed.push(name);
  }
  if (killed.length > 0) {
    // eslint-disable-next-line no-console
    console.log(`  • Завершены процессы: ${killed.join(', ')}`);
  }
  return killed;
}

if (require.main === module) {
  killProcesses().then((killed) => {
    if (killed.length === 0) {
      // eslint-disable-next-line no-console
      console.log('  • Целевых процессов не найдено');
    }
  });
}

module.exports = { killProcesses };
