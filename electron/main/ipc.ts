import { app, type BrowserWindow, ipcMain } from 'electron';
import { z } from 'zod';
import { IPC_CHANNELS } from '@shared/ipc-contract.js';
import { STORAGE_SCHEMA_VERSION } from '@shared/constants.js';
import { loadCatalog, saveCatalog } from './storage.js';
import { printHtml, savePdf, savePng } from './files.js';
import type { UpdaterService } from './updater.js';

const RollSchema = z.object({
  id: z.string(),
  width: z.number().int().positive(),
  length: z.number().int().positive()
});

const CatalogSchema = z.object({
  schemaVersion: z.literal(STORAGE_SCHEMA_VERSION),
  rolls: z.array(RollSchema),
  selectedRollIds: z.array(z.string())
});

// CWE-20 / CWE-770 / CWE-1287: валидация входных данных на IPC-границе
const SaveBufferArgs = z.tuple([
  z
    .instanceof(ArrayBuffer)
    .refine((b) => b.byteLength <= 50 * 1024 * 1024, 'buffer too large (>50 MB)'),
  z
    .string()
    .min(1)
    .max(255)
    .regex(/^[^\\/:*?"<>|\x00-\x1f]+$/u, 'invalid filename')
]);

// Закрывает SEC-L10: ограничение размера HTML для печати (5 МБ)
const PrintHtmlArg = z.string().max(5_000_000);

export interface IpcDeps {
  mainWindow: BrowserWindow;
  updater: UpdaterService;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { mainWindow, updater } = deps;

  ipcMain.handle(IPC_CHANNELS.STORAGE_LOAD, async () => {
    return loadCatalog();
  });

  ipcMain.handle(IPC_CHANNELS.STORAGE_SAVE, async (_event, payload: unknown) => {
    const parsed = CatalogSchema.parse(payload);
    await saveCatalog(parsed);
  });

  ipcMain.handle(IPC_CHANNELS.FILES_SAVE_PNG, async (_event, ...args) => {
    // Закрывает SEC-H01, SEC-M03: валидация буфера и имени файла (запрет traversal-символов)
    const [buf, name] = SaveBufferArgs.parse(args);
    return savePng(buf, name);
  });

  ipcMain.handle(IPC_CHANNELS.FILES_SAVE_PDF, async (_event, ...args) => {
    // Закрывает SEC-H01, SEC-M03: валидация буфера и имени файла (запрет traversal-символов)
    const [buf, name] = SaveBufferArgs.parse(args);
    return savePdf(buf, name);
  });

  ipcMain.handle(IPC_CHANNELS.FILES_PRINT, async (_event, html) => {
    // Закрывает SEC-H01, SEC-L10: валидация типа и размера HTML
    const validated = PrintHtmlArg.parse(html);
    return printHtml(validated, mainWindow);
  });

  ipcMain.handle(IPC_CHANNELS.APP_VERSION, async () => {
    return app.getVersion();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATER_CHECK, async () => {
    await updater.checkForUpdates();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATER_DOWNLOAD, async () => {
    await updater.downloadUpdate();
  });

  ipcMain.handle(IPC_CHANNELS.UPDATER_INSTALL, async () => {
    await updater.installAndRestart();
  });
}
