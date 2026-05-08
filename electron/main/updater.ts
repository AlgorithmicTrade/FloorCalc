import { app, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { spawn } from 'node:child_process';
import { existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { UPDATE_CHECK_DELAY_MS } from '@shared/constants.js';
import { IPC_CHANNELS, type UpdateStatus } from '@shared/ipc-contract.js';
import { diagLog } from './index.js';
import { writeUpdateHelperScript } from './updaterHelper.js';

const { autoUpdater } = electronUpdater;

/**
 * `app-update.yml` генерируется electron-builder только при `--publish always`.
 * Локальная portable-сборка без публикации запускается без этого файла —
 * autoUpdater.checkForUpdates() в этом случае бросает ENOENT. Игнорируем.
 */
function isUpdateConfigPresent(): boolean {
  return existsSync(join(process.resourcesPath, 'app-update.yml'));
}

export class UpdaterService {
  private readonly mainWindow: BrowserWindow;
  private downloadedFilePath: string | null = null;
  private started = false;
  private startTimer: NodeJS.Timeout | null = null;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    if (!app.isPackaged) {
      diagLog('[updater] disabled in dev mode');
      return;
    }

    if (!isUpdateConfigPresent()) {
      diagLog('[updater] disabled: app-update.yml not found (unpublished build)');
      return;
    }

    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    this.registerListeners();

    this.startTimer = setTimeout(() => {
      this.startTimer = null;
      autoUpdater.checkForUpdates().catch((err) => {
        this.emit({ kind: 'error', message: this.errorMessage(err) });
      });
    }, UPDATE_CHECK_DELAY_MS);
  }

  async checkForUpdates(): Promise<void> {
    if (!app.isPackaged) {
      diagLog('[updater] check ignored in dev mode');
      return;
    }
    if (!isUpdateConfigPresent()) return;
    try {
      this.emit({ kind: 'checking' });
      await autoUpdater.checkForUpdates();
    } catch (err) {
      this.emit({ kind: 'error', message: this.errorMessage(err) });
    }
  }

  async downloadUpdate(): Promise<void> {
    if (!app.isPackaged) {
      diagLog('[updater] download ignored in dev mode');
      return;
    }
    if (!isUpdateConfigPresent()) return;
    try {
      await autoUpdater.downloadUpdate();
    } catch (err) {
      this.emit({ kind: 'error', message: this.errorMessage(err) });
    }
  }

  async installAndRestart(): Promise<void> {
    if (!this.downloadedFilePath) {
      this.emit({ kind: 'error', message: 'обновление не скачано' });
      return;
    }

    // Для portable target electron-builder выставляет PORTABLE_EXECUTABLE_FILE
    // (путь к исходному portable.exe, который запустил пользователь).
    // process.execPath указывает на распакованный во временной папке Electron.exe,
    // которая удаляется при выходе процесса — заменять её бессмысленно.
    const portableSource = process.env.PORTABLE_EXECUTABLE_FILE;
    const targetExePath = portableSource && portableSource.length > 0
      ? portableSource
      : process.execPath;

    const spawnLog = join(tmpdir(), 'floorcalc-spawn.log');
    const spawnLogEntry = (msg: string) => {
      try {
        const stamp = new Date().toISOString();
        appendFileSync(spawnLog, `[${stamp}] ${msg}\n`, { encoding: 'utf8' });
      } catch {
        // не критично — основное обновление важнее лога
      }
    };

    try {
      const batPath = writeUpdateHelperScript({
        pid: process.pid,
        newExePath: this.downloadedFilePath,
        oldExePath: targetExePath
      });

      spawnLogEntry(`installAndRestart: batPath=${batPath}`);
      spawnLogEntry(`installAndRestart: targetExePath=${targetExePath}`);

      // Запускаем bat через `cmd.exe /c start "" /MIN /B <bat>`.
      //
      // Почему именно так:
      //  - Spawn child напрямую (PowerShell, wscript, cmd-with-bat) на Windows
      //    наследует job-object Electron. `app.quit()` через 0.5 сек убивает весь job
      //    вместе с child'ом — это и сломалось в v1.0.4 (powershell -File) и v1.0.7
      //    (powershell + Start-Process).
      //  - `cmd.exe /c start ""` использует встроенную команду start, которая делает
      //    CreateProcess с `CREATE_BREAKAWAY_FROM_JOB` для child. Helper-bat выходит
      //    из job-object Electron и переживает quit().
      //  - WSH (wscript+vbs из v1.0.6) — отключён на части Win 10/11 систем (Defender ASR /
      //    GroupPolicy / 24H2 deprecation), поэтому ненадёжен.
      //
      // Флаги start:
      //  - `""` — пустой title (start интерпретирует первый "..." как title окна;
      //    без этого с путём в кавычках получаем сюрпризы).
      //  - `/MIN` — окно cmd-helper'а минимизировано (не разворачивается).
      //  - `/B` — без нового консольного окна для start-команды.
      //
      // `windowsHide:true` для самого spawn'нутого cmd скрывает родительское окно.
      // Внутреннее cmd-helper для bat появится минимизированным короткой вспышкой —
      // это компромисс между «гарантированно работает» и «полностью без UI».
      const child = spawn(
        'cmd.exe',
        ['/c', 'start', '', '/MIN', '/B', batPath],
        {
          detached: true,
          stdio: 'ignore',
          windowsHide: true,
          shell: false
        }
      );

      child.on('error', (err) => {
        spawnLogEntry(`spawn error: ${err.message}`);
      });

      child.on('spawn', () => {
        spawnLogEntry(`spawn succeeded, child.pid=${child.pid ?? 'unknown'}`);
      });

      child.unref();

      // Пауза, чтобы cmd успел выполнить `start` до завершения родителя.
      // 500 мс с запасом (cmd start — ~50 мс).
      await new Promise<void>((resolve) => setTimeout(resolve, 500));

      spawnLogEntry('calling app.quit()');
      app.quit();
    } catch (err) {
      spawnLogEntry(`installAndRestart catch: ${String(err)}`);
      this.emit({ kind: 'error', message: this.errorMessage(err) });
    }
  }

  private registerListeners(): void {
    autoUpdater.on('checking-for-update', () => {
      this.emit({ kind: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
      this.emit({
        kind: 'available',
        current: app.getVersion(),
        next: info.version,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined
      });
    });

    autoUpdater.on('update-not-available', () => {
      this.emit({ kind: 'not-available', current: app.getVersion() });
    });

    autoUpdater.on('error', (err) => {
      this.emit({ kind: 'error', message: this.errorMessage(err) });
    });

    autoUpdater.on('download-progress', (progress) => {
      this.emit({
        kind: 'downloading',
        percent: progress.percent,
        bytesPerSec: progress.bytesPerSecond
      });
    });

    autoUpdater.on('update-downloaded', (event) => {
      this.downloadedFilePath = event.downloadedFile;
      this.emit({ kind: 'ready', next: event.version });
    });
  }

  private emit(status: UpdateStatus): void {
    if (this.mainWindow.isDestroyed()) return;
    this.mainWindow.webContents.send(IPC_CHANNELS.UPDATER_STATUS, status);
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'неизвестная ошибка обновления';
  }
}
