import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type FloorCalcAPI,
  type UpdateStatus
} from '@shared/ipc-contract.js';

const api: FloorCalcAPI = {
  storage: {
    loadCatalog: () => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_LOAD),
    saveCatalog: (catalog) => ipcRenderer.invoke(IPC_CHANNELS.STORAGE_SAVE, catalog)
  },
  files: {
    savePng: (buf, name) => ipcRenderer.invoke(IPC_CHANNELS.FILES_SAVE_PNG, buf, name),
    savePdf: (buf, name) => ipcRenderer.invoke(IPC_CHANNELS.FILES_SAVE_PDF, buf, name),
    print: (html) => ipcRenderer.invoke(IPC_CHANNELS.FILES_PRINT, html)
  },
  app: {
    getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION)
  },
  updater: {
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_CHECK),
    downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_DOWNLOAD),
    installAndRestart: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATER_INSTALL),
    onStatus: (cb) => {
      const listener = (_: unknown, status: UpdateStatus): void => cb(status);
      ipcRenderer.on(IPC_CHANNELS.UPDATER_STATUS, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATER_STATUS, listener);
      };
    }
  }
};

contextBridge.exposeInMainWorld('api', api);
