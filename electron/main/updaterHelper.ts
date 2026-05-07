import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface UpdateHelperOptions {
  pid: number; // PID текущего процесса
  newExePath: string; // куда electron-updater скачал новый .exe
  oldExePath: string; // путь к исходному portable.exe (PORTABLE_EXECUTABLE_FILE)
}

export function writeUpdateHelperScript(opts: UpdateHelperOptions): string {
  const helperPath = join(tmpdir(), `floorcalc-update-${randomUUID()}.ps1`);
  const logPath = join(tmpdir(), `floorcalc-update-${randomUUID()}.log`);
  const escapedNew = opts.newExePath.replace(/'/g, "''");
  const escapedOld = opts.oldExePath.replace(/'/g, "''");
  const escapedLog = logPath.replace(/'/g, "''");

  // Copy + retry Move-Item: portable.exe может оставаться залоченным несколько секунд
  // после quit() из-за антивируса/индексатора. Для portable target Copy-Item надёжнее
  // Move-Item, поскольку source и destination могут быть на разных томах.
  const script = `
$ErrorActionPreference = 'Continue'
$logFile = '${escapedLog}'
function Log($msg) {
  $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss.fff')
  Add-Content -Path $logFile -Value "[$stamp] $msg" -ErrorAction SilentlyContinue
}
try {
  Log "helper started, pid=${opts.pid}"
  Log "new=${escapedNew}"
  Log "old=${escapedOld}"
  Wait-Process -Id ${opts.pid} -Timeout 30 -ErrorAction SilentlyContinue
  Log "process wait completed"
  Start-Sleep -Seconds 2

  $maxAttempts = 10
  $copied = $false
  for ($i = 1; $i -le $maxAttempts; $i++) {
    try {
      Copy-Item -Force -Path '${escapedNew}' -Destination '${escapedOld}' -ErrorAction Stop
      Log "copy attempt $i succeeded"
      $copied = $true
      break
    } catch {
      Log "copy attempt $i failed: $($_.Exception.Message)"
      Start-Sleep -Seconds 1
    }
  }

  if (-not $copied) {
    Log "ERROR: copy failed after $maxAttempts attempts"
    throw "copy failed"
  }

  Remove-Item -Force -Path '${escapedNew}' -ErrorAction SilentlyContinue
  Log "removed source pending file"

  Log "starting new exe..."
  Start-Process -FilePath '${escapedOld}'
  Log "Start-Process invoked"
} catch {
  Log "FATAL: $($_.Exception.Message)"
} finally {
  Remove-Item -Force -Path $PSCommandPath -ErrorAction SilentlyContinue
}
`.trim();

  writeFileSync(helperPath, script, { encoding: 'utf8' });
  return helperPath;
}
