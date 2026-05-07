import { app, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { UPDATE_CHECK_DELAY_MS } from '@shared/constants.js';
import { IPC_CHANNELS, type UpdateStatus } from '@shared/ipc-contract.js';
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
      console.log('[updater] disabled in dev mode');
      return;
    }

    if (!isUpdateConfigPresent()) {
      console.log('[updater] disabled: app-update.yml not found (unpublished build)');
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
      console.log('[updater] check ignored in dev mode');
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
      console.log('[updater] download ignored in dev mode');
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

    try {
      const helperPath = writeUpdateHelperScript({
        pid: process.pid,
        newExePath: this.downloadedFilePath,
        oldExePath: targetExePath
      });

      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helperPath],
        { detached: true, stdio: 'ignore' }
      );
      child.unref();

      app.quit();
    } catch (err) {
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
