import { BrowserWindow, dialog } from 'electron';
import { promises as fs } from 'node:fs';
import type { SaveResult } from '@shared/ipc-contract.js';

async function saveBufferWithDialog(
  buf: ArrayBuffer,
  suggestedName: string,
  filterName: string,
  extension: string
): Promise<SaveResult> {
  const result = await dialog.showSaveDialog({
    defaultPath: suggestedName,
    filters: [{ name: filterName, extensions: [extension] }]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  await fs.writeFile(result.filePath, Buffer.from(buf));
  return { canceled: false, path: result.filePath };
}

export async function savePng(buf: ArrayBuffer, suggestedName: string): Promise<SaveResult> {
  return saveBufferWithDialog(buf, suggestedName, 'PNG', 'png');
}

export async function savePdf(buf: ArrayBuffer, suggestedName: string): Promise<SaveResult> {
  return saveBufferWithDialog(buf, suggestedName, 'PDF', 'pdf');
}

export async function printHtml(
  html: string,
  mainWindow: BrowserWindow
): Promise<{ success: boolean }> {
  return new Promise((resolve) => {
    const printWindow = new BrowserWindow({
      parent: mainWindow,
      show: false,
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false
      }
    });

    let settled = false;
    const settle = (success: boolean): void => {
      if (settled) return;
      settled = true;
      try {
        if (!printWindow.isDestroyed()) {
          printWindow.close();
        }
      } catch {
        // ignore
      }
      resolve({ success });
    };

    printWindow.webContents.once('did-finish-load', () => {
      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (success) => {
          settle(success);
        }
      );
    });

    printWindow.webContents.once('did-fail-load', () => {
      settle(false);
    });

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    printWindow.loadURL(dataUrl).catch(() => settle(false));
  });
}
