# FloorCalc

Desktop-калькулятор раскроя рулонных напольных и настенных покрытий (линолеум, ковролин, обои, ПВХ). Принимает каталог типоразмеров рулонов и набор прямоугольных помещений, выдаёт два независимых расчёта одновременно — экономный (минимум рулонов) и оптимальный (минимум резов) — с визуальной схемой раскроя и текстовым breakdown.

Один portable `.exe`, без установки. Текущая версия — **1.0.9**.

## Системные требования

- Windows 10 / 11 x64.
- Никаких runtime-зависимостей: всё bundled внутри portable-exe.
- Для функции «Печать» — стандартный Windows Print Dialog (Microsoft Print to PDF подходит).
- Для разработки: Node.js >= 20.

## Запуск

Скачайте свежий `FloorCalc-X.Y.Z-portable.exe` со страницы [GitHub Releases](https://github.com/AlgorithmicTrade/FloorCalc/releases) и просто запустите.

Файлы пользователя в `%APPDATA%\FloorCalc\`:

- `data.json` — каталог типоразмеров рулонов (atomic write + zod-валидация, graceful fallback на default catalog при битом JSON).
- `window-state.json` — сохранённый размер и позиция окна между запусками.
- `debug.log` — диагностический лог (рендер-процесс, IPC, updater).
- `.debug` — маркер для принудительного открытия DevTools (альтернатива `FLOORCALC_DEBUG=1`).

Лог helper-скрипта обновления — `%TEMP%\floorcalc-update-<uuid>.log`.

## Возможности

- **Каталог типоразмеров рулонов** с сохранением между запусками; чекбоксы для выбора активных в расчёте; цветные swatch для каждого типоразмера; ширина и длина — целые миллиметры (до 100 м).
- **Несколько помещений** во вкладках, каждое со своим набором расчётов; компактная swap-кнопка между полями ширины и длины (один patch меняет оба значения местами).
- **Два режима одновременно** для каждого помещения:
  - **economy** — агрессивно реюзит обрезки через банк с гильотинным резом → меньше рулонов, больше резов.
  - **optimal** — предпочитает целые куски при `placedAtY=0` → меньше резов, может использовать больше рулонов.
  - Tie-break лексикографический по cuts/waste; различия между режимами реальные, не косметические.
- **Mixed-type раскладка** — одна схема может комбинировать разные типоразмеры рулонов из активного каталога; rotation post-pass разворачивает однородный tail-row в один повёрнутый кусок из подходящего обрезка для уменьшения числа резов; перебор обеих ориентаций комнаты (width↔length swap).
- **Визуальная схема раскроя** на Konva — stats и схема в одном stage (всё попадает в экспорт PNG/PDF/print/copy); HTML hover-tooltip за курсором с площадью обрезка рулона целиком.
- **Экспорт**: копирование в буфер, сохранение PNG, экспорт PDF (A4 landscape), системная печать.
- **Auto-update** через GitHub Releases на базе `electron-updater` + cmd-helper для replace + restart портабла.
- **Persistence окна**: размер и позиция сохраняются в `%APPDATA%\FloorCalc\window-state.json` (zod-валидация).
- **Версия в заголовке окна**, application/context menu отключены, spellcheck выключен.

## Разработка

```bash
# Установка зависимостей
npm install

# Dev-режим (electron-vite + HMR)
npm run dev

# Type-check (две конфигурации: tsconfig.electron.json + tsconfig.web.json)
npm run typecheck

# Unit-тесты (Vitest, 171 кейс на domain-слое)
npm run test

# Production build: typecheck + electron-vite build + electron-builder portable, без публикации
npm run build

# Windows-friendly сборка (рекомендуется при заблокированном release/)
npm run build:safe

# Production build с публикацией в GitHub Release (требует GH_TOKEN)
npm run build:publish
```

`npm run build:safe` (`scripts/build-safe.cjs`) решает типичную проблему `EBUSY: app.asar` (handle от Defender / Explorer): kill процессов (`FloorCalc.exe`, `electron.exe`, `app-builder.exe`, `7z.exe`, `electron-builder.exe`) → каскадная очистка `out/` и `release/` (cmd `rmdir` → `fs.rmSync` → `rename` + async cleanup, до 5 попыток) → fallback на `release-new/` через `--config.directories.output` → typecheck → electron-vite build → electron-builder.

### Релизы

Auto-publish настроен через `.github/workflows/release.yml` — push тега `v*` запускает workflow:

1. `npm ci` → `typecheck` → `test`.
2. Извлечение секции для текущей версии из `RELEASE_NOTES.md` в `release-notes-current.md` (используется `electron-builder.yml: releaseInfo.releaseNotesFile`).
3. `npm run build:publish` — собирает portable.exe и заливает в GitHub Release.
4. Workflow дополнительно генерирует `latest.yml` (`version`, `sha512`, `size`, `releaseDate`) и заливает через `gh release upload`. Для `target: portable` electron-builder сам `latest.yml` не создаёт, поэтому без этого шага auto-update в `electron-updater` не работает (фикс v1.0.2).

Bump версии — через slash-команды `/commit` и `/push` (см. `CLAUDE.md`), либо вручную:

```bash
npm version patch        # 1.0.9 → 1.0.10
git push --follow-tags
```

### Архитектура

```text
electron/
  main/          # main process: окно, IPC, storage, updater, windowState, file-logging
  preload/       # contextBridge → window.api (sandbox: true, contextIsolation: true)

src/
  shared/        # IPC contract types, IPC_CHANNELS, GITHUB_OWNER/REPO
  domain/        # pure-TypeScript: types, units, validation
    calculator/  # strip, bank, seams, economy, optimal, mixed, selectRoll, selectMixed, index
  components/
    design-system/   # Button, Card, TextInput, NumberField, Checkbox, Eyebrow, IconButton, Tabs
    catalog/         # AddRollForm, RollCatalog, RollRow
    rooms/           # RoomTabs, RoomEditor, RoomResultPanel
    result/          # ResultCard, ResultText, ResultActions, SchemeView, SchemeRenderer
    update/          # UpdateBanner
    layout/          # AppShell, EmptyState
  store/         # Zustand v5: catalogStore (persist через IPC), roomsStore, resultsCache (FIFO 64), updateStore
  lib/           # exportPng, exportPdf, copyImage, printScheme, hash
  ipc/           # client (ленивый Proxy на window.api)

tests/domain/    # Vitest unit-тесты: bank, seams, economy, optimal, mixed, mixed-orientation, mixed-rotation
scripts/         # build-safe.cjs, kill-processes.cjs
resources/       # icon.ico, fonts/InterVariable.woff2
```

Ключевые детали:

- **`electron/main/index.ts`** — заголовок `FloorCalc v${app.getVersion()}`, `Menu.setApplicationMenu(null)`, отключённый context-menu, file-logging в `%APPDATA%/FloorCalc/debug.log`, CSP через `session.webRequest.onHeadersReceived` (CSP-meta удалена из `index.html` из-за конфликта с `file://` + ES-модулями), DevTools открываются только при `FLOORCALC_DEBUG=1` или маркере `<userData>/.debug`.
- **`electron/main/windowState.ts`** — сохранение размера/позиции окна с zod-валидацией.
- **`electron/main/updater.ts`** — `electron-updater` + защита от ENOENT `app-update.yml` (локальный portable-build не падает при отсутствии конфига).
- **`electron/main/updaterHelper.ts`** — replace-helper через `cmd /c start "" /MIN /B bat`. Встроенная команда `start.exe` использует `CREATE_BREAKAWAY_FROM_JOB`, что отрывает helper от Windows job-object Electron (без этого helper убивался при `app.quit()` — серия фиксов v1.0.4–v1.0.8). После замены portable-exe переименовывается под актуальную версию.
- **`src/domain/calculator/`** — алгоритмы 2D-раскроя:
  - `bank.ts` — `OffcutBank` с гильотинным резом и tie-break по площади.
  - `economy.ts` / `optimal.ts` — два режима с разной стратегией выбора рулона.
  - `mixed.ts` — `calculateMixed` (greedy с общим OffcutBank и `rollIndexToType`), `calculateMixedBestOrientation` (перебор width↔length swap), `applyRotationPass` (детект однородного tail-row → замена одним rotated куском из обрезка).
  - `selectMixed.ts` — `countCuts` + `selectMixed` с lex-key (rollsUsed/pieces/cuts/waste для economy, pieces/cuts/rollsUsed/waste для optimal).
  - `seams.ts` — `computeSeamCount` (число дискретных швов по группировке pieces по `placedAtX`).
- **`src/components/result/SchemeView.tsx`** — native Konva (без react-konva в этих местах), Group по `pieceId` с hover-listener, HTML overlay-tooltip за курсором; `useImperativeHandle` временно делает cut-labels видимыми перед `toCanvas`/`toDataURL`/`toBlob`, чтобы они попадали в экспорт. Tooltip показывает площадь остатка для всего рулона целиком (агрегация по `rollIndex` через `formatAreaTrim`).
- **`src/store/`** — Zustand v5 stores: `catalogStore` с persist через IPC; `roomsStore` (in-memory, защита от удаления последнего помещения); `resultsCache` — FIFO с `MAX_ENTRIES=64` по `hash(room+rolls+mode)`; `updateStore` для четырёх ветвей `UpdateStatus`.

### Безопасность

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` на BrowserWindow.
- zod-валидация на всех границах IPC и при чтении `data.json` / `window-state.json`.
- Никаких секретов в коде / логах (см. `.claude/rules/security.md`).
- CSP через HTTP-header (CSP-meta убран из-за `file://` + sandbox-несовместимости).

## Лицензия

Internal use, AlgorithmicTrade.
