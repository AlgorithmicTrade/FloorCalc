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
 * Почему bat, а не ps1:
 *   spawn('powershell.exe', ..., { detached: true }) на Windows НЕ гарантирует
 *   полного отделения от родительского job-object — Electron может создавать
 *   child-job при старте процесса, и PowerShell (.NET-runtime) наследует его,
 *   из-за чего process group не отделяется и child убивается вместе с родителем.
 *   cmd.exe /c start "" /B bat-файл — единственный надёжный способ сделать
 *   полностью независимый (detached) процесс на Windows без GUI-промптов.
 *
 * Copy-Item логика остаётся в PowerShell (через -Command inline), чтобы
 * корректно обрабатывать пути с пробелами и retry на AV/indexer-локи.
 */
export function writeUpdateHelperScript(opts: UpdateHelperOptions): string {
  const uuid = randomUUID();
  const helperPath = join(tmpdir(), `floorcalc-update-${uuid}.bat`);
  const logPath    = join(tmpdir(), `floorcalc-update-${uuid}.log`);

  // Экранирование для bat: " → "" (внутри двойных кавычек cmd)
  // Экранирование для PS -Command строки внутри bat: ' → ''
  const batEscNew = opts.newExePath.replace(/"/g, '""');
  const batEscOld = opts.oldExePath.replace(/"/g, '""');
  const batEscLog = logPath.replace(/"/g, '""');

  const psEscNew  = opts.newExePath.replace(/'/g, "''");
  const psEscOld  = opts.oldExePath.replace(/'/g, "''");
  const psEscLog  = logPath.replace(/'/g, "''");

  // bat-файл: ждёт завершения родительского PID через tasklist,
  // затем вызывает powershell -Command для Copy-Item retry (10×1s) и запуска.
  // Лог пишется через >> прямо из bat (базовые шаги) и из PS (детальные шаги).
  const script = `@echo off
setlocal

set "LOGFILE=${batEscLog}"
set "NEWEXE=${batEscNew}"
set "OLDEXE=${batEscOld}"
set "PID=${opts.pid}"

echo [%DATE% %TIME%] bat helper started, parent PID=%PID% >> "%LOGFILE%"
echo [%DATE% %TIME%] new=%NEWEXE% >> "%LOGFILE%"
echo [%DATE% %TIME%] old=%OLDEXE% >> "%LOGFILE%"

:waitloop
tasklist /FI "PID eq %PID%" 2>nul | findstr /I /C:"FloorCalc" >nul 2>&1
if %ERRORLEVEL% == 0 (
  timeout /T 1 /NOBREAK >nul 2>&1
  goto waitloop
)
echo [%DATE% %TIME%] parent process exited >> "%LOGFILE%"

timeout /T 2 /NOBREAK >nul 2>&1

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command ^
  "$log='${psEscLog}'; ^
  function lg($m){$t=(Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff');Add-Content -Path $log -Value \"[$t] $m\" -EA SilentlyContinue}; ^
  try { ^
    lg 'ps-block entered'; ^
    $ok=$false; ^
    for($i=1;$i -le 10;$i++){ ^
      try { ^
        Copy-Item -Force -Path '${psEscNew}' -Destination '${psEscOld}' -EA Stop; ^
        lg \"copy attempt $i succeeded\"; ^
        $ok=$true; ^
        break ^
      } catch { ^
        lg \"copy attempt $i failed: $($_.Exception.Message)\"; ^
        Start-Sleep -Seconds 1 ^
      } ^
    }; ^
    if(-not $ok){lg 'ERROR: all copy attempts failed'; exit 1}; ^
    Remove-Item -Force -Path '${psEscNew}' -EA SilentlyContinue; ^
    lg 'removed pending file'; ^
    lg 'launching new exe'; ^
    Start-Process -FilePath '${psEscOld}'; ^
    lg 'Start-Process invoked' ^
  } catch { ^
    lg \"FATAL: $($_.Exception.Message)\"; ^
    exit 1 ^
  }"

echo [%DATE% %TIME%] ps-block exited with code %ERRORLEVEL% >> "%LOGFILE%"

del /F /Q "%~f0" >nul 2>&1
endlocal
`;

  writeFileSync(helperPath, script, { encoding: 'utf8' });
  return helperPath;
}
