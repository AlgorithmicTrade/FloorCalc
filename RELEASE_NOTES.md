# Release Notes

User-facing release notes for all versions.

## v1.0.0

_Released on 2026-05-07_

### ✨ New Features

- **domain**: Add 3 source file(s), update 22 source file(s), +2 more

  Changes in this commit:
  - add 3 source file(s)
  - update 22 source file(s)
  - add 3 test(s)
  - update 3 test(s)


---

_This release was automatically generated from 1 commits._

## v0.2.0

_Released on 2026-05-07_

### ✨ New Features

- **App**: реализовать bootstrap FloorCalc — портабл-калькулятор раскроя рулонов

  Решение:
  - Поднята с нуля архитектура Electron + React + TypeScript + Vite по плану docs/plans/agile-prancing-pnueli.md.
  - Реализован pure-TS алгоритм 2D-раскроя в двух режимах (economy = greedy + банк обрезков, optimal = свежий рулон на полосу) с unit-тестами на реальных Room/RollType (без mocks).
  - Подключена design-система HashiCorp dark из DESIGN.md через CSS-tokens + 8 базовых компонентов на CSS-Modules; accent = Waypoint Cyan #14c6cb.
  - Настроена portable-сборка через electron-builder + auto-update через electron-updater + GitHub Releases с PowerShell-helper для replace+restart портабла.
  - Storage каталога рулонов в %APPDATA%\FloorCalc\data.json через atomic write + zod-валидация.
  
  Изменения:
  - package.json, .gitignore:
    - bump версии 0.0.0 → 0.1.0, добавлены runtime/dev deps, scripts dev/build/typecheck/test, type=module; build artifacts (out/, release/, dist/, coverage/) исключены.
  - tsconfig.json + tsconfig.{electron,web,node}.json:
    - composite-проект с разделением Node-context (electron/) и DOM-context (src/), path-aliases @/* и @shared/*, noUncheckedIndexedAccess.
  - electron.vite.config.ts, electron-builder.yml, vitest.config.ts, index.html:
    - electron-vite с тремя entries; portable target + GitHub publish provider (AlgorithmicTrade/FloorCalc); CSP с разрешением connect к GitHub для updater.
  - .github/workflows/release.yml:
    - publish на push tag v*: typecheck + tests + build:publish с GH_TOKEN.
  - electron/main/{index,ipc,storage,files,menu,updater,updaterHelper}.ts:
    - createWindow с contextIsolation/sandbox/nodeIntegration=false; ipcMain.handle для всех каналов; atomic JSON-store через .tmp + rename; savePng/savePdf через dialog.showSaveDialog; printHtml в скрытом BrowserWindow; UpdaterService с 30-сек проверкой + PowerShell-helper для замены exe.
  - electron/preload/index.ts:
    - contextBridge.exposeInMainWorld('api', ...) с типизированным FloorCalcAPI и unsubscribe из onStatus.
  - src/shared/{ipc-contract,constants}.ts:
    - канонические типы (RollType, StoredCatalog, UpdateStatus, FloorCalcAPI, SaveResult), константы IPC_CHANNELS, GITHUB_OWNER/REPO.
  - src/domain/{types,units,validation}.ts, calculator/{strip,bank,seams,economy,optimal,selectRoll,index}.ts:
    - integer-mm типы; OffcutBank с гильотинным резом и tie-break по площади; computeSeamLength через группировку pieces по placedAtX; selectBestRoll лексикографически.
  - tests/domain/{fixtures,bank,seams,calculator.economy,calculator.optimal}.test.ts:
    - Vitest без mocks: фабрики реальных Room/RollType, 69 кейсов на границы алгоритмов и швов.
  - src/styles/{tokens,typography,globals,print}.css, resources/fonts/InterVariable.woff2:
    - DESIGN.md tokens в CSS-variables; Inter Variable bundled (344 KB); A4 landscape print-стили; dark scrollbar; focus-ring через accent.
  - src/components/design-system/{Button,Card,TextInput,NumberField,Checkbox,Eyebrow,IconButton,Tabs}.tsx + .module.css, src/css-modules.d.ts:
    - 4 варианта Button; NumberField с m↔mm-конверсией и blur-clamp; aria-selected на Tabs; ariaLabel обязателен на IconButton.
  - src/store/{catalogStore,roomsStore,resultsCache,updateStore}.ts, src/ipc/client.ts, src/lib/hash.ts:
    - Zustand v5 с persist каталога через IPC; in-memory rooms (стартует с одной защитой от удаления последней); FIFO-кеш расчётов с MAX_ENTRIES=64; api через ленивый Proxy.
  - src/components/{catalog,rooms,result,update,layout}/**, src/lib/{exportPng,exportPdf,copyImage,printScheme}.ts, src/App.tsx, src/main.tsx:
    - 2-колонный AppShell; RollCatalog + AddRollForm; RoomTabs + RoomEditor; RoomResultPanel с двумя ResultCard (economy + optimal одновременно); Konva SchemeView с forwardRef → toBlob/toDataURL/toCanvas; ResultActions (copy/PNG/PDF/print); UpdateBanner на 4 ветви UpdateStatus.
  - README.md, DESIGN.md:
    - инструкции install/dev/build/release; перевод DESIGN.md в трекинг.
  
  Эффект:
  - Один portable .exe (~73 МБ) запускается на любом Win10 x64 без установки и без runtime-зависимостей.
  - Каталог типоразмеров сохраняется в %APPDATA%\FloorCalc\ между запусками; устойчив к битому JSON (graceful degradation на default catalog).
  - Расчёт раскроя работает в двух режимах одновременно с фактической геометрией; результаты кешируются по hash(room+rolls+mode); 69/69 unit-тестов зелёные.
  - Схема рендерится через Konva, копируется в clipboard, сохраняется PNG, экспортируется PDF (landscape A4), печатается через системный диалог.
  - Auto-update проверяет GitHub Releases через 30 сек после старта; в портабл-режиме replace через PowerShell-helper с graceful fallback (toast «откройте папку с обновлением») при read-only расположении.
  - Безопасность IPC: contextIsolation+sandbox+nodeIntegration=false; zod-валидация всех границ; никаких секретов в логах.
  - Полный typecheck проходит без ошибок (electron + renderer); electron-vite renderer-bundle 1.6 MB JS + 13 KB CSS + 350 KB Inter font.


---

_This release was automatically generated from 3 commits._
