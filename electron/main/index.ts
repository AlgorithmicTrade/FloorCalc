import { app, BrowserWindow, Menu, dialog, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { appendFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { APP_NAME } from '@shared/constants.js';
import { registerIpcHandlers } from './ipc.js';
import { UpdaterService } from './updater.js';
import {
  loadWindowStateSync,
  saveWindowStateSync,
  isWithinAnyDisplay,
} from './windowState.js';

const DEBUG_LOG_MAX_BYTES = 1_048_576;

export function diagLog(message: string): void {
  try {
    const dir = app.getPath('userData');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'debug.log');
    const ts = new Date().toISOString();
    try {
      const st = statSync(file);
      if (st.size > DEBUG_LOG_MAX_BYTES) {
        writeFileSync(file, `${ts} [diagLog] truncated (was ${st.size} bytes)\n`);
      }
    } catch {
      // файла ещё нет или stat невозможен — продолжаем как обычно
    }
    appendFileSync(file, `${ts} ${message}\n`);
  } catch {
    // Логирование не критично — игнорируем ошибки записи
  }
}

// Удаление устаревших updater-логов из tmpdir() — синхронно при старте,
// один раз и без блокирующего I/O в hot path. Никогда не бросает.
function cleanupStaleUpdaterLogs(): void {
  const TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const dir = tmpdir();
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name !== 'floorcalc-spawn.log' && !/^floorcalc-update-.+\.log$/.test(name)) {
      continue;
    }
    const full = join(dir, name);
    try {
      const st = statSync(full);
      if (!st.isFile()) continue;
      if (now - st.mtimeMs <= TTL_MS) continue;
      unlinkSync(full);
    } catch {
      // пропускаем файлы с недоступным stat / unlink — не критично
    }
  }
}

process.on('uncaughtException', (err) => {
  diagLog(`[main] uncaughtException: ${err.message}\n${err.stack ?? ''}`);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack ?? ''}` : String(reason);
  diagLog(`[main] unhandledRejection: ${msg}`);
});

const __dirname = dirname(fileURLToPath(import.meta.url));

app.setName(APP_NAME);

let mainWindow: BrowserWindow | null = null;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    cleanupStaleUpdaterLogs();

    // Убираем application menu полностью
    Menu.setApplicationMenu(null);

    // CSP через заголовок ответа (а не meta-тег): при загрузке через file://
    // Chromium трактует 'self' в meta как null-origin и блокирует ES-модули.
    // Задаём CSP здесь — он применяется к file:// ответам корректно.
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self' file:; " +
            "script-src 'self' file:; " +
            "style-src 'self' file: 'unsafe-inline'; " +
            "img-src 'self' file: data: blob:; " +
            "font-src 'self' file: data:; " +
            "connect-src 'self' file: https://github.com https://api.github.com https://objects.githubusercontent.com"
          ]
        }
      });
    });

    mainWindow = createWindow();

    const updater = new UpdaterService(mainWindow);
    updater.start();

    registerIpcHandlers({ mainWindow, updater });
  }).catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    diagLog(`[main] whenReady failed: ${msg}`);
    try {
      dialog.showErrorBox('FloorCalc — ошибка запуска', msg);
    } catch {
      // если даже dialog недоступен — просто выходим
    }
    app.quit();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// Default size при первом запуске — fallback на случай, если не удалось
// инициализировать maximized state. Реальные значения переопределяются через
// loadWindowStateSync; первый запуск (без сохранённого state) маскимизирует окно.
const DEFAULT_WINDOW_WIDTH = 1080;
const DEFAULT_WINDOW_HEIGHT = 616;

function createWindow(): BrowserWindow {
  const saved = loadWindowStateSync();

  let initialWidth = DEFAULT_WINDOW_WIDTH;
  let initialHeight = DEFAULT_WINDOW_HEIGHT;
  let initialX: number | undefined;
  let initialY: number | undefined;

  if (saved) {
    initialWidth = saved.width;
    initialHeight = saved.height;
    if (
      saved.x !== undefined &&
      saved.y !== undefined &&
      isWithinAnyDisplay({
        x: saved.x,
        y: saved.y,
        width: saved.width,
        height: saved.height,
      })
    ) {
      initialX = saved.x;
      initialY = saved.y;
    }
  }

  const win = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    ...(initialX !== undefined && initialY !== undefined ? { x: initialX, y: initialY } : {}),
    minWidth: 720,
    minHeight: 500,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
      preload: join(__dirname, '../preload/index.cjs')
    }
  });

  // Первый запуск (нет сохранённого состояния) → maximized.
  // Последующие запуски — восстанавливаем флаг isMaximized из state.
  if (!saved || saved.isMaximized) {
    win.maximize();
  }

  // Сохранение состояния — синхронно при close, чтобы запись успела до выхода
  // процесса. Если окно maximized — берём normal bounds (как когда оно станет
  // restored), а флаг isMaximized отдельно.
  win.on('close', () => {
    if (win.isDestroyed()) return;
    const isMaximized = win.isMaximized();
    const bounds = isMaximized ? win.getNormalBounds() : win.getBounds();
    saveWindowStateSync({
      schemaVersion: 1,
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      isMaximized,
    });
  });

  // Заголовок окна: APP_NAME + версия из package.json
  const appTitle = `${APP_NAME} v${app.getVersion()}`;
  win.setTitle(appTitle);

  // Запрещаем renderer'у перезаписывать заголовок через <title>
  win.on('page-title-updated', (e) => {
    e.preventDefault();
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  // --- Диагностика (убирается после подтверждения что приложение рендерится) ---
  const debugMarker = join(app.getPath('userData'), '.debug');
  const debugEnabled = process.env['FLOORCALC_DEBUG'] === '1' || existsSync(debugMarker);

  const loadedPath = (!app.isPackaged && process.env['ELECTRON_RENDERER_URL'])
    ? process.env['ELECTRON_RENDERER_URL']
    : join(__dirname, '../renderer/index.html');

  diagLog(`[startup] APP_NAME=${APP_NAME}`);
  diagLog(`[startup] version=${app.getVersion()}`);
  diagLog(`[startup] electron=${process.versions.electron}`);
  diagLog(`[startup] isPackaged=${app.isPackaged}`);
  diagLog(`[startup] __dirname=${__dirname}`);
  diagLog(`[startup] loadTarget=${loadedPath}`);
  diagLog(`[startup] debugEnabled=${debugEnabled}`);

  if (debugEnabled) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.webContents.on('did-finish-load', () => {
    diagLog('[renderer] did-finish-load');
  });

  win.webContents.on('dom-ready', () => {
    diagLog('[renderer] dom-ready');
    if (debugEnabled) {
      win.webContents.executeJavaScript(`
        (() => {
          try {
            const root = document.getElementById('root');
            console.log('[diag] dom-ready: root=' + (root ? 'found' : 'missing') + ', innerHTML.length=' + (root ? root.innerHTML.length : 'n/a'));
            console.log('[diag] body bg=' + getComputedStyle(document.body).backgroundColor);
            console.log('[diag] window.api keys=' + Object.keys(window.api || {}).join(','));
            console.log('[diag] window.electron keys=' + Object.keys(window.electron || {}).join(','));
          } catch (e) {
            console.error('[diag] error: ' + (e instanceof Error ? e.message : String(e)));
          }
        })();
      `).catch((err: Error) => diagLog('executeJavaScript failed: ' + err.message));
    }
  });

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    diagLog(`[renderer] did-fail-load: code=${code} desc=${desc} url=${url}`);
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    diagLog(`[renderer] render-process-gone: reason=${details.reason} exitCode=${details.exitCode}`);
  });

  win.webContents.on('preload-error', (_e, preloadPath, error) => {
    diagLog(`[renderer] preload-error: ${preloadPath} — ${error.message}\n${error.stack ?? ''}`);
  });

  win.webContents.on('console-message', (_e, level, message, line, source) => {
    // level: 0=verbose,1=info,2=warning,3=error — в production пишем только error
    if (level >= 3) {
      diagLog(`[renderer lvl${level}] ${source}:${line} — ${message}`);
    }
  });
  // --- /Диагностика ---

  // Подавляем right-click context menu в renderer
  win.webContents.on('context-menu', (e) => {
    e.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {
      // ignore
    });
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) {
    win.loadURL(devUrl).catch((err) =>
      diagLog('loadURL failed: ' + (err instanceof Error ? err.message : String(err)))
    );
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html')).catch((err) =>
      diagLog('loadFile failed: ' + (err instanceof Error ? err.message : String(err)))
    );
  }

  return win;
}
