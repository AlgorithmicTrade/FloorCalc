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
 * Чистый cmd-скрипт без PowerShell-блоков.
 *   Предыдущая попытка использовала inline `powershell.exe -Command "..."` с многострочным
 *   `^`-continuation внутри bat. Это ломалось двумя способами:
 *     1) `^` перед CRLF теряет escape-функцию, если строка заканчивается внутри двойных кавычек.
 *     2) Кодировка/line endings писались LF от Node.js — CMD ожидает CRLF и обрывался на середине.
 *   Результат: cmd считывал PowerShell-кусок как отдельную команду «^», падал с
 *   «Имя ^ не распознано» и helper не выполнялся.
 *
 * Сейчас — только нативные cmd-команды: `copy /Y` для замены exe, `tasklist /FI "PID eq …"`
 * для wait-loop, `start "" "<exe>"` для детачнутого запуска. Никаких внешних интерпретаторов
 * — нет проблем с экранированием.
 *
 * Файл пишется с CRLF line endings (`\r\n`) — обязательно для надёжного парсинга cmd.exe.
 */
export function writeUpdateHelperScript(opts: UpdateHelperOptions): string {
  const uuid = randomUUID();
  const helperPath = join(tmpdir(), `floorcalc-update-${uuid}.bat`);
  const logPath    = join(tmpdir(), `floorcalc-update-${uuid}.log`);

  // В bat значения внутри `set "VAR=..."` могут содержать всё кроме `"`.
  // Внутри `"..."` cmd `"` экранируется как `""`.
  const escNew = opts.newExePath.replace(/"/g, '""');
  const escOld = opts.oldExePath.replace(/"/g, '""');
  const escLog = logPath.replace(/"/g, '""');

  // Маркер, по которому tasklist определяет родительский процесс — имя exe Electron.
  // FloorCalc.exe для portable build (см. electron-builder.yml: productName: FloorCalc).
  const PARENT_IMAGE = 'FloorCalc.exe';

  const lines = [
    '@echo off',
    'setlocal',
    'chcp 65001 >nul 2>&1',
    '',
    `set "LOGFILE=${escLog}"`,
    `set "NEWEXE=${escNew}"`,
    `set "OLDEXE=${escOld}"`,
    `set "PID=${opts.pid}"`,
    '',
    'echo [%DATE% %TIME%] bat helper started, parent PID=%PID% >> "%LOGFILE%"',
    'echo [%DATE% %TIME%] new=%NEWEXE% >> "%LOGFILE%"',
    'echo [%DATE% %TIME%] old=%OLDEXE% >> "%LOGFILE%"',
    '',
    ':waitloop',
    `tasklist /FI "PID eq %PID%" 2>nul | findstr /I /C:"${PARENT_IMAGE}" >nul 2>&1`,
    'if %ERRORLEVEL% == 0 (',
    '  timeout /T 1 /NOBREAK >nul 2>&1',
    '  goto waitloop',
    ')',
    'echo [%DATE% %TIME%] parent process exited >> "%LOGFILE%"',
    '',
    'rem небольшая пауза, чтобы AV/indexer успел отпустить exe',
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
    'del /F /Q "%NEWEXE%" >nul 2>&1',
    'echo [%DATE% %TIME%] removed pending file >> "%LOGFILE%"',
    '',
    'echo [%DATE% %TIME%] launching new exe via start >> "%LOGFILE%"',
    'start "" "%OLDEXE%"',
    'echo [%DATE% %TIME%] start invoked, errorlevel=%ERRORLEVEL% >> "%LOGFILE%"',
    '',
    ':cleanup',
    'del /F /Q "%~f0" >nul 2>&1',
    'endlocal',
    ''
  ];

  // CRLF — обязательно для cmd.exe на Windows.
  const script = lines.join('\r\n');

  writeFileSync(helperPath, script, { encoding: 'utf8' });
  return helperPath;
}
