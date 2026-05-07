import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

export interface UpdateHelperOptions {
  pid: number; // PID текущего процесса
  newExePath: string; // куда electron-updater скачал новый .exe
  oldExePath: string; // process.execPath
}

export function writeUpdateHelperScript(opts: UpdateHelperOptions): string {
  const helperPath = join(tmpdir(), `floorcalc-update-${randomUUID()}.ps1`);
  const escapedNew = opts.newExePath.replace(/'/g, "''");
  const escapedOld = opts.oldExePath.replace(/'/g, "''");

  const script = `
$ErrorActionPreference = 'Stop'
try {
  Wait-Process -Id ${opts.pid} -Timeout 30 -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1
  Move-Item -Force -Path '${escapedNew}' -Destination '${escapedOld}'
  Start-Process -FilePath '${escapedOld}'
} finally {
  Remove-Item -Force -Path $PSCommandPath -ErrorAction SilentlyContinue
}
`.trim();

  writeFileSync(helperPath, script, { encoding: 'utf8' });
  return helperPath;
}
