/**
 * Persistence для размера/позиции главного окна.
 *
 * Хранилище: JSON-файл `window-state.json` в `app.getPath('userData')`,
 * рядом с `data.json` (см. storage.ts). Schema валидируется через zod —
 * любой битый/постаревший файл игнорируется и возвращается `null`,
 * что приводит к использованию дефолтных размеров.
 *
 * Запись на close — синхронная (writeFileSync), потому что обычный async-fs
 * не успевает завершиться до закрытия процесса.
 */

import { app, screen, type Rectangle } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const FILE_NAME = 'window-state.json';

const WindowStateSchema = z.object({
  schemaVersion: z.literal(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  isMaximized: z.boolean().optional()
});

export type WindowState = z.infer<typeof WindowStateSchema>;

function getStatePath(): string {
  return join(app.getPath('userData'), FILE_NAME);
}

/** Загрузить сохранённое состояние окна; null если файла нет или он невалиден. */
export function loadWindowStateSync(): WindowState | null {
  const filePath = getStatePath();
  if (!existsSync(filePath)) return null;

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = WindowStateSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data;
}

/** Синхронная запись — гарантированно успевает до закрытия процесса. */
export function saveWindowStateSync(state: WindowState): void {
  const filePath = getStatePath();
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(state, null, 2);
    writeFileSync(filePath, json, 'utf8');
  } catch {
    // запись не критична — игнорируем
  }
}

/**
 * Проверка, что (хотя бы частично) окно попадёт в один из доступных дисплеев.
 * Иначе восстановленные координаты использовать опасно — окно уедет за экран
 * (например, был внешний монитор, который теперь отключён).
 */
export function isWithinAnyDisplay(rect: Rectangle): boolean {
  const displays = screen.getAllDisplays();
  for (const d of displays) {
    const b = d.workArea;
    const intersectsX = rect.x < b.x + b.width && rect.x + rect.width > b.x;
    const intersectsY = rect.y < b.y + b.height && rect.y + rect.height > b.y;
    if (intersectsX && intersectsY) return true;
  }
  return false;
}
