#!/usr/bin/env node

/**
 * Безопасная сборка FloorCalc (Windows-friendly).
 *
 * Решает проблему «remove …\release\win-unpacked\resources\app.asar:
 * The process cannot access the file because it is being used by another
 * process» — типичный случай, когда Windows Explorer / антивирус /
 * предыдущий запуск приложения держат handle на artifact'ы прошлой сборки.
 *
 * Pipeline:
 *  1. taskkill для FloorCalc.exe / electron.exe / app-builder.exe / 7z.exe.
 *  2. Очистка `out/` (vite output) и `release/` через каскад способов:
 *     cmd rmdir → fs.rmSync → rename + async cleanup.
 *  3. Если `release/` всё ещё заблокирован — переключаемся на `release-new/`
 *     или `release-<timestamp>/` (electron-builder получает override через
 *     `--config.directories.output=<dir>`).
 *  4. typecheck → electron-vite build → electron-builder.
 *
 * Стек (FloorCalc):
 *  - electron-vite (один шаг сборки main+preload+renderer → out/).
 *  - electron-builder с `electron-builder.yml`.
 *  - Никаких protobuf / schema файлов копировать не нужно.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { killProcesses } = require('./kill-processes.cjs');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const log = (msg, color = colors.reset) => console.log(`${color}${msg}${colors.reset}`);
const logStep = (step, msg) => log(`\n${colors.cyan}[${step}]${colors.reset} ${colors.bright}${msg}${colors.reset}`);
const logOk = (msg) => log(`${colors.green}✓ ${msg}${colors.reset}`);
const logErr = (msg) => log(`${colors.red}✗ ${msg}${colors.reset}`);
const logWarn = (msg) => log(`${colors.yellow}! ${msg}${colors.reset}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Каскадное удаление папки. Возвращает true только если папки гарантированно
 * нет на диске после выхода. На каждой неудачной попытке между итерациями —
 * повторный taskkill + sleep, чтобы дать ОС закрыть handle.
 */
async function safeRemoveDir(dirPath, maxAttempts = 5) {
  if (!fs.existsSync(dirPath)) return true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // 1. cmd /c rmdir /s /q — обходит часть блокировок, которые fs.rmSync не
    //    умеет (например, hidden / readonly атрибуты).
    try {
      execSync(`cmd /c "rmdir /s /q "${dirPath}""`, { stdio: 'ignore', timeout: 10000 });
      if (!fs.existsSync(dirPath)) {
        logOk(`Удалено (cmd rmdir): ${dirPath}`);
        return true;
      }
    } catch (_) {}

    // 2. Node fs.rmSync recursive.
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      if (!fs.existsSync(dirPath)) {
        logOk(`Удалено (fs.rmSync): ${dirPath}`);
        return true;
      }
    } catch (_) {}

    // 3. Переименование — освобождает целевой путь для electron-builder,
    //    даже если файлы внутри ещё держатся другим процессом. Backup
    //    удалим best-effort асинхронно.
    try {
      const backup = `${dirPath}-old-${Date.now()}`;
      fs.renameSync(dirPath, backup);
      logOk(`Переименовано в ${path.basename(backup)} (handle освобождён)`);
      try { fs.rmSync(backup, { recursive: true, force: true }); } catch (_) {}
      return true;
    } catch (_) {}

    logWarn(`Попытка ${attempt}/${maxAttempts}: ${dirPath} занят, повтор после kill+sleep`);
    if (attempt < maxAttempts) {
      await killProcesses();
      await sleep(1500);
    }
  }

  logErr(`Не удалось освободить ${dirPath} после ${maxAttempts} попыток`);
  return false;
}

function runCommand(cmd, description) {
  logStep('EXEC', `${description}`);
  log(`    ${colors.yellow}$${colors.reset} ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
    logOk(`${description} — OK`);
    return true;
  } catch (err) {
    logErr(`${description} — FAIL: ${err.message}`);
    return false;
  }
}

/**
 * Подбирает свободную папку для output electron-builder. Если основная
 * `release/` не очищается, пытаемся `release-new/`, затем `release-<ts>/`.
 * Возвращает имя папки относительно cwd.
 */
async function resolveOutputDir(primary) {
  if (!fs.existsSync(primary)) return primary;
  const cleaned = await safeRemoveDir(primary);
  if (cleaned) return primary;

  const candidates = ['release-new', `release-${Date.now()}`];
  for (const cand of candidates) {
    if (!fs.existsSync(cand)) return cand;
    const ok = await safeRemoveDir(cand);
    if (ok) return cand;
  }
  return `release-${Date.now()}`;
}

async function build() {
  log(`${colors.magenta}
╔══════════════════════════════════════════════════════════════╗
║                FloorCalc — Safe Build (Windows)             ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}`);

  const startedAt = Date.now();

  // 1. Завершаем процессы, которые могут держать handle на артефакты.
  logStep('1', 'Закрытие процессов FloorCalc / electron / app-builder');
  await killProcesses();

  // 2. Очистка vite output (out/) — обычно никогда не заблокировано.
  logStep('2', 'Очистка out/');
  await safeRemoveDir('out');

  // 3. Очистка release/ + выбор итоговой output-папки.
  logStep('3', 'Очистка release/ и выбор output-папки');
  const outputDir = await resolveOutputDir('release');
  if (outputDir !== 'release') {
    logWarn(`release/ не освободилась — используем альтернативную папку: ${outputDir}`);
  }

  // 4. typecheck (запускается отдельным шагом, чтобы ошибки видны до
  //    долгого этапа упаковки).
  logStep('4', 'TypeScript typecheck');
  if (!runCommand('npm run typecheck', 'typecheck')) {
    process.exitCode = 1;
    return;
  }

  // 5. electron-vite build (main + preload + renderer → out/).
  logStep('5', 'electron-vite build');
  if (!runCommand('npx electron-vite build', 'electron-vite build')) {
    process.exitCode = 1;
    return;
  }

  // 6. electron-builder. Override директории output только если переключились
  //    на альтернативу — иначе используем то, что задано в electron-builder.yml.
  logStep('6', 'electron-builder');
  const outputArg = outputDir === 'release' ? '' : ` --config.directories.output=${outputDir}`;
  const builderCmd = `npx electron-builder --config electron-builder.yml${outputArg}`;
  if (!runCommand(builderCmd, 'electron-builder')) {
    process.exitCode = 1;
    return;
  }

  const elapsed = Math.round((Date.now() - startedAt) / 1000);
  log(`${colors.green}
╔══════════════════════════════════════════════════════════════╗
║                    ✅ Сборка завершена                       ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}`);
  logOk(`Время сборки: ${elapsed}s`);

  // Подсказываем пути запуска.
  const portable = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir).find((f) => /portable.*\.exe$/i.test(f))
    : null;
  if (portable) log(`  ${colors.yellow}Portable:${colors.reset} ${outputDir}\\${portable}`);
  const unpacked = path.join(outputDir, 'win-unpacked', 'FloorCalc.exe');
  if (fs.existsSync(unpacked)) log(`  ${colors.yellow}Unpacked:${colors.reset} ${unpacked}`);
}

if (require.main === module) {
  build().catch((err) => {
    logErr(`Критическая ошибка: ${err.stack || err.message}`);
    process.exit(1);
  });
}

module.exports = { build };
