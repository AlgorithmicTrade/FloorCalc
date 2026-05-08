export type RollType = { id: string; width: number; length: number };

export type StoredCatalog = {
  schemaVersion: 1;
  rolls: RollType[];
  selectedRollIds: string[];
};

export type SaveResult = { canceled: boolean; path?: string };

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'not-available'; current: string }
  | { kind: 'available'; current: string; next: string; releaseNotes?: string }
  | { kind: 'downloading'; percent: number; bytesPerSec: number }
  | { kind: 'ready'; next: string }
  | { kind: 'error'; message: string };

export type FloorCalcAPI = {
  storage: {
    loadCatalog(): Promise<StoredCatalog>;
    saveCatalog(catalog: StoredCatalog): Promise<void>;
  };
  files: {
    savePng(buf: ArrayBuffer, name: string): Promise<SaveResult>;
    savePdf(buf: ArrayBuffer, name: string): Promise<SaveResult>;
    print(html: string): Promise<{ success: boolean }>;
  };
  app: {
    getVersion(): Promise<string>;
  };
  updater: {
    checkForUpdates(): Promise<void>;
    downloadUpdate(): Promise<void>;
    installAndRestart(): Promise<void>;
    onStatus(cb: (s: UpdateStatus) => void): () => void;
  };
};

// Канальные имена IPC (для строгости в main + preload)
export const IPC_CHANNELS = {
  STORAGE_LOAD: 'storage:load',
  STORAGE_SAVE: 'storage:save',
  FILES_SAVE_PNG: 'files:save-png',
  FILES_SAVE_PDF: 'files:save-pdf',
  FILES_PRINT: 'files:print',
  APP_VERSION: 'app:version',
  UPDATER_CHECK: 'updater:check',
  UPDATER_DOWNLOAD: 'updater:download',
  UPDATER_INSTALL: 'updater:install',
  UPDATER_STATUS: 'updater:status' // event channel main → renderer
} as const;

declare global {
  interface Window {
    api: FloorCalcAPI;
  }
}
