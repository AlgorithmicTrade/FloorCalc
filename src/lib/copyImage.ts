/**
 * Копирование PNG-схемы в системный буфер обмена.
 *
 * Renderer-side операция (без IPC): `navigator.clipboard.write([...])`
 * в Electron работает напрямую при context-isolated rendererе.
 * Возвращает `true` — успех, `false` — Blob был null (ошибка получения).
 */

export async function copyImage(blobPromise: Promise<Blob | null>): Promise<boolean> {
  const blob = await blobPromise;
  if (!blob) return false;
  const item = new ClipboardItem({ 'image/png': blob });
  await navigator.clipboard.write([item]);
  return true;
}
