import { app, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { spawn } from 'node:child_process';
import { UPDATE_CHECK_DELAY_MS } from '@shared/constants.js';
import { IPC_CHANNELS, type UpdateStatus } from '@shared/ipc-contract.js';
import { writeUpdateHelperScript } from './updaterHelper.js';

const { autoUpdater } = electronUpdater;

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

    try {
      const helperPath = writeUpdateHelperScript({
        pid: process.pid,
        newExePath: this.downloadedFilePath,
        oldExePath: process.execPath
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
