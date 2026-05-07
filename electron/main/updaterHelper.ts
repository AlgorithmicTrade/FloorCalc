import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface UpdateHelperOptions {
  pid: number; // PID текущего процесса
  newExePath: string; // куда electron-updater скачал новый .exe
  oldExePath: string; // путь к исходному portable.exe (PORTABLE_EXECUTABLE_FILE)
}

/**
 * Записывает bat-файл обновления и возвращает его путь.
 *
 * Запуск bat'а в hidden mode выполняется на стороне `updater.ts`:
 * spawn powershell.exe -WindowStyle Hidden -Command "Start-Process cmd /c <bat> -WindowStyle Hidden".
 * Раньше использовался wscript+vbs, но Windows Script Host отключён по умолчанию на части
 * систем (Defender ASR / GroupPolicy / 24H2 deprecation), поэтому WSH ненадёжен.
 * PowerShell 5.1 встроен во все Windows 10/11 без установки → надёжный launcher.
 *
 * Логика bat:
 *   1. Wait-loop: `tasklist /FI "PID eq %PID%" | findstr FloorCalc.exe` пока родитель жив.
 *   2. Copy retry-loop: `copy /Y "%NEWEXE%" "%OLDEXE%"` до 10 раз с паузой 1 sec.
 *   3. Rename: если имя pending-exe (`FloorCalc-1.0.7-portable.exe`) отличается от старого
 *      (`FloorCalc-0.2.0-portable.exe`), переименовываем — чтобы файл в release/ отражал
 *      актуальную версию.
 *   4. Удаление pending-exe.
 *   5. `start "" "%FINALEXE%"` — детачнутый запуск новой версии.
 *   6. `(goto) 2>nul & del "%~f0"` — стандартный трюк self-deleting bat без сообщения
 *      "The batch file cannot be found".
 *
 * Файл пишется с CRLF — обязательное требование cmd.exe для надёжной работы.
 */
export function writeUpdateHelperScript(opts: UpdateHelperOptions): string {
  const uuid = randomUUID();
  const batPath = join(tmpdir(), `floorcalc-update-${uuid}.bat`);
  const logPath = join(tmpdir(), `floorcalc-update-${uuid}.log`);

  // Внутри `set "VAR=..."` cmd экранирует `"` как `""`.
  const escNewBat = opts.newExePath.replace(/"/g, '""');
  const escOldBat = opts.oldExePath.replace(/"/g, '""');
  const escLogBat = logPath.replace(/"/g, '""');

  const PARENT_IMAGE = 'FloorCalc.exe';

  const batLines = [
    '@echo off',
    'setlocal enabledelayedexpansion',
    'chcp 65001 >nul 2>&1',
    '',
    `set "LOGFILE=${escLogBat}"`,
    `set "NEWEXE=${escNewBat}"`,
    `set "OLDEXE=${escOldBat}"`,
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
    'rem отражал актуальную версию (FloorCalc-1.0.7-portable.exe вместо 0.2.0).',
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
    'echo [%DATE% %TIME%] exiting >> "%LOGFILE%"',
    'rem (goto) без метки прерывает парсинг блока — устраняет "The batch file cannot be found"',
    '(goto) 2>nul & del /F /Q "%~f0"',
    ''
  ];

  const batScript = batLines.join('\r\n');

  writeFileSync(batPath, batScript, { encoding: 'utf8' });
  return batPath;
}
