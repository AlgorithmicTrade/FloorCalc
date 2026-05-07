import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface UpdateHelperOptions {
  pid: number; // PID текущего процесса
  newExePath: string; // куда electron-updater скачал новый .exe
  oldExePath: string; // путь к исходному portable.exe (PORTABLE_EXECUTABLE_FILE)
}

export interface UpdateHelperResult {
  /** Путь к VBS-launcher'у, который надо передать в `wscript.exe` (через spawn). */
  vbsPath: string;
  /** Путь к bat-файлу обновления (полезен для логов и диагностики). */
  batPath: string;
}

/**
 * Записывает пару файлов: bat с логикой обновления + vbs-launcher для скрытого запуска.
 *
 * Зачем VBS:
 *   `wscript.exe` использует GUI subsystem (не console) → при запуске не показывает окно.
 *   Внутри vbs `WScript.Shell.Run "cmd /c bat", 0, False` запускает cmd в hidden mode (`0`).
 *   spawn cmd напрямую — даже с `windowsHide: true` — иногда оставляет промельк console-окна,
 *   потому что `cmd.exe /c start ...` физически создаёт console на короткий момент.
 *   wscript решает это полностью.
 *
 * Логика bat:
 *   1. Wait-loop: `tasklist /FI "PID eq %PID%" | findstr FloorCalc.exe` пока родитель жив.
 *   2. Copy retry-loop: `copy /Y "%NEWEXE%" "%OLDEXE%"` до 10 раз с паузой 1 sec — на случай AV/indexer-локов.
 *   3. Rename: если имя pending-exe (`FloorCalc-1.0.6-portable.exe`) отличается от текущего
 *      имени старого (`FloorCalc-0.2.0-portable.exe`), переименовываем — чтобы файл в release/
 *      отражал актуальную версию.
 *   4. Удаление pending-exe.
 *   5. `start "" "%FINALEXE%"` — детачнутый запуск новой версии.
 *   6. Удаление vbs.
 *   7. `(goto) 2>nul & del "%~f0"` — стандартный трюк self-deleting bat без сообщения
 *      "The batch file cannot be found": `(goto)` без метки прерывает парсинг блока,
 *      del выполняется как post-batch action; cmd не пытается прочитать строку после del.
 *
 * Файлы пишутся с CRLF — обязательное требование cmd.exe для надёжной работы.
 */
export function writeUpdateHelperScript(opts: UpdateHelperOptions): UpdateHelperResult {
  const uuid = randomUUID();
  const batPath = join(tmpdir(), `floorcalc-update-${uuid}.bat`);
  const vbsPath = join(tmpdir(), `floorcalc-update-${uuid}.vbs`);
  const logPath = join(tmpdir(), `floorcalc-update-${uuid}.log`);

  // Внутри `set "VAR=..."` cmd экранирует `"` как `""`.
  const escNewBat = opts.newExePath.replace(/"/g, '""');
  const escOldBat = opts.oldExePath.replace(/"/g, '""');
  const escLogBat = logPath.replace(/"/g, '""');
  const escVbsBat = vbsPath.replace(/"/g, '""');

  // VBS-string внутри двойных кавычек экранирует `"` как `""`.
  const escBatVbs = batPath.replace(/"/g, '""');

  const PARENT_IMAGE = 'FloorCalc.exe';

  const batLines = [
    '@echo off',
    'setlocal enabledelayedexpansion',
    'chcp 65001 >nul 2>&1',
    '',
    `set "LOGFILE=${escLogBat}"`,
    `set "NEWEXE=${escNewBat}"`,
    `set "OLDEXE=${escOldBat}"`,
    `set "VBSFILE=${escVbsBat}"`,
    `set "PID=${opts.pid}"`,
    '',
    'rem Извлекаем имена и директорию для последующего rename',
    'for %%I in ("%NEWEXE%") do set "NEWNAME=%%~nxI"',
    'for %%I in ("%OLDEXE%") do (',
    '  set "OLDNAME=%%~nxI"',
    '  set "OLDDIR=%%~dpI"',
    ')',
    'set "FINALEXE=!OLDDIR!!NEWNAME!"',
    '',
    'echo [%DATE% %TIME%] bat helper started, parent PID=%PID% >> "%LOGFILE%"',
    'echo [%DATE% %TIME%] new=%NEWEXE% (basename=!NEWNAME!) >> "%LOGFILE%"',
    'echo [%DATE% %TIME%] old=%OLDEXE% (basename=!OLDNAME!) >> "%LOGFILE%"',
    'echo [%DATE% %TIME%] final=!FINALEXE! >> "%LOGFILE%"',
    '',
    ':waitloop',
    `tasklist /FI "PID eq %PID%" 2>nul | findstr /I /C:"${PARENT_IMAGE}" >nul 2>&1`,
    'if %ERRORLEVEL% == 0 (',
    '  timeout /T 1 /NOBREAK >nul 2>&1',
    '  goto waitloop',
    ')',
    'echo [%DATE% %TIME%] parent process exited >> "%LOGFILE%"',
    '',
    'rem Пауза, чтобы AV/indexer успел освободить exe',
    'timeout /T 2 /NOBREAK >nul 2>&1',
    '',
    'set RETRIES=10',
    ':copyloop',
    'copy /Y "%NEWEXE%" "%OLDEXE%" >nul 2>>"%LOGFILE%"',
    'if %ERRORLEVEL% == 0 (',
    '  echo [%DATE% %TIME%] copy succeeded >> "%LOGFILE%"',
    '  goto copydone',
    ')',
    'echo [%DATE% %TIME%] copy failed, retries left=%RETRIES% >> "%LOGFILE%"',
    'set /A RETRIES=%RETRIES%-1',
    'if %RETRIES% GTR 0 (',
    '  timeout /T 1 /NOBREAK >nul 2>&1',
    '  goto copyloop',
    ')',
    'echo [%DATE% %TIME%] FATAL: all copy attempts failed >> "%LOGFILE%"',
    'goto cleanup',
    '',
    ':copydone',
    'rem Если имя pending-exe отличается от старого — переименуем, чтобы release/',
    'rem отражал актуальную версию (FloorCalc-1.0.6-portable.exe вместо 0.2.0).',
    'if /I not "!NEWNAME!" == "!OLDNAME!" (',
    '  ren "%OLDEXE%" "!NEWNAME!" >nul 2>>"%LOGFILE%"',
    '  if !ERRORLEVEL! == 0 (',
    '    echo [%DATE% %TIME%] renamed !OLDNAME! to !NEWNAME! >> "%LOGFILE%"',
    '  ) else (',
    '    echo [%DATE% %TIME%] WARN: rename failed, errorlevel=!ERRORLEVEL! >> "%LOGFILE%"',
    '    set "FINALEXE=%OLDEXE%"',
    '  )',
    ') else (',
    '  echo [%DATE% %TIME%] names equal, skipping rename >> "%LOGFILE%"',
    ')',
    '',
    'del /F /Q "%NEWEXE%" >nul 2>&1',
    'echo [%DATE% %TIME%] removed pending file >> "%LOGFILE%"',
    '',
    'echo [%DATE% %TIME%] launching new exe via start: !FINALEXE! >> "%LOGFILE%"',
    'start "" "!FINALEXE!"',
    'echo [%DATE% %TIME%] start invoked, errorlevel=!ERRORLEVEL! >> "%LOGFILE%"',
    '',
    ':cleanup',
    'del /F /Q "%VBSFILE%" >nul 2>&1',
    'echo [%DATE% %TIME%] vbs removed, exiting >> "%LOGFILE%"',
    'rem (goto) без метки прерывает парсинг блока — устраняет "The batch file cannot be found"',
    '(goto) 2>nul & del /F /Q "%~f0"',
    ''
  ];

  const batScript = batLines.join('\r\n');

  // VBS-launcher: запускает `cmd /c "<batPath>"` с windowStyle=0 (hidden), без ожидания.
  // VBS экранирует `"` внутри строк как `""`. Целевая строка-аргумент: `cmd /c "<batPath>"`,
  // в VBS это: `"cmd /c ""<batPath>"""` (open, `cmd /c `, escape, `"`, path, escape, `"`, close).
  const vbsLines = [
    'Set objShell = CreateObject("WScript.Shell")',
    `objShell.Run "cmd /c ""${escBatVbs}""", 0, False`,
    ''
  ];
  const vbsScript = vbsLines.join('\r\n');

  writeFileSync(batPath, batScript, { encoding: 'utf8' });
  writeFileSync(vbsPath, vbsScript, { encoding: 'utf8' });

  return { vbsPath, batPath };
}
