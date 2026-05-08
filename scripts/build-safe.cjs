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

/**
 * Генерирует `app-update.yml` для win-unpacked-сборки на основе publish-секции
 * `electron-builder.yml`. Минимальный валидный набор для electron-updater
 * (GitHub provider): provider/owner/repo плюс опциональные vPrefixedTagName /
 * releaseType / updaterCacheDirName.
 *
 * Парсер не использует js-yaml (его нет в прямых зависимостях проекта) —
 * простой regex по плоской YAML-секции `publish:`. Этого достаточно, потому
 * что секция в electron-builder.yml всегда плоская (provider/owner/repo
 * на одном уровне отступа).
 */
function generateAppUpdateYml(targetPath) {
  const builderYmlPath = path.resolve('electron-builder.yml');
  if (!fs.existsSync(builderYmlPath)) {
    logWarn(`electron-builder.yml не найден — не могу сгенерировать app-update.yml`);
    return false;
  }
  const yml = fs.readFileSync(builderYmlPath, 'utf-8');

  // Извлекаем publish-секцию: от строки "publish:" до следующего top-level ключа.
  const publishMatch = yml.match(/(^|\n)publish:\s*\n([\s\S]*?)(?=\n[A-Za-z][A-Za-z0-9_-]*:|\n*$)/);
  if (!publishMatch) {
    logWarn(`secция publish: не найдена в electron-builder.yml — пропускаю генерацию`);
    return false;
  }
  const publishBlock = publishMatch[2];

  // Простой helper для извлечения значения по ключу из плоской секции.
  // Учитываем YAML-список: первый ключ может идти после `- ` (`- provider: github`),
  // последующие — просто с отступом.
  const extract = (key) => {
    const re = new RegExp(`^\\s*-?\\s*${key}:\\s*(.+?)\\s*$`, 'm');
    const m = publishBlock.match(re);
    return m ? m[1].replace(/^['"]|['"]$/g, '') : null;
  };

  const provider = extract('provider');
  const owner = extract('owner');
  const repo = extract('repo');

  if (provider !== 'github' || !owner || !repo) {
    logWarn(
      `electron-builder.yml: provider=${provider}, owner=${owner}, repo=${repo}.\n` +
      `   Поддерживается только provider:github для авто-генерации.`,
    );
    return false;
  }

  // Собираем минимально-достаточный app-update.yml.
  // updaterCacheDirName: <productName-lowercase>-updater — формат, который
  // electron-builder использует по умолчанию.
  const lines = [
    'provider: github',
    `owner: ${owner}`,
    `repo: ${repo}`,
  ];
  const releaseType = extract('releaseType');
  if (releaseType) lines.push(`releaseType: ${releaseType}`);
  const vPref = extract('vPrefixedTagName');
  if (vPref) lines.push(`vPrefixedTagName: ${vPref}`);

  // productName из package.json для updaterCacheDirName
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const cacheName = `${(pkg.name || 'app').toLowerCase()}-updater`;
    lines.push(`updaterCacheDirName: ${cacheName}`);
  } catch (_) {
    // не критично — electron-updater сам подставит дефолт по productName
  }

  fs.writeFileSync(targetPath, lines.join('\n') + '\n', 'utf-8');
  return true;
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
  //
  //    `--publish never` ВАЖЕН: без флага electron-builder НЕ генерирует
  //    `app-update.yml` в resources/, а electron-updater на старте проверяет
  //    `existsSync(resourcesPath/app-update.yml)` (electron/main/updater.ts:41-44)
  //    и тихо отключается, если файла нет. С `--publish never` файл создаётся
  //    локально (по publish-секции из electron-builder.yml — provider:github),
  //    но НИКАКИЕ ассеты на GitHub не загружаются. То есть autoupdate в
  //    локальной сборке начинает работать (проверяет latest.yml в Release и
  //    предлагает обновление), а CI-публикация остаётся отдельным шагом
  //    через `npm run build:publish` (`--publish always`).
  logStep('6', 'electron-builder');
  const outputArg = outputDir === 'release' ? '' : ` --config.directories.output=${outputDir}`;
  const builderCmd = `npx electron-builder --config electron-builder.yml --publish never${outputArg}`;
  if (!runCommand(builderCmd, 'electron-builder')) {
    process.exitCode = 1;
    return;
  }

  // 7. Auto-update config для unpacked-версии (fallback).
  //
  //    Основной путь: electron-builder копирует `build/app-update.yml` в
  //    `<resources>/app-update.yml` через секцию `extraResources` в
  //    `electron-builder.yml`. Это покрывает оба artifact'а: portable.exe
  //    (файл попадает внутрь $PLUGINSDIR/app-64.7z) и win-unpacked/.
  //
  //    Шаг ниже остаётся как fallback на случай ручной правки конфига:
  //    если `extraResources` уже отработал — ветка `existsSync(...)`
  //    зафиксирует это и ничего не перезапишет; если по какой-то причине
  //    файла нет — сгенерируем его из publish-секции вручную.
  logStep('7', 'Конфиг autoupdate (app-update.yml)');
  const winUnpackedRes = path.join(outputDir, 'win-unpacked', 'resources');
  const appUpdateYmlPath = path.join(winUnpackedRes, 'app-update.yml');
  if (fs.existsSync(appUpdateYmlPath)) {
    logOk(`app-update.yml уже на месте: ${appUpdateYmlPath}`);
  } else if (!fs.existsSync(winUnpackedRes)) {
    logWarn(`win-unpacked/resources/ не найден — пропускаю генерацию app-update.yml`);
  } else {
    const generated = generateAppUpdateYml(appUpdateYmlPath);
    if (generated) {
      logOk(`app-update.yml сгенерирован для win-unpacked: ${appUpdateYmlPath}`);
    }
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

module.exports = { build, generateAppUpdateYml };
