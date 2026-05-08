# Миграция FloorCalc: Electron → Web (GitHub Pages)

## Context

FloorCalc сейчас распространяется как portable `.exe` для Windows с auto-update через `electron-updater` + GitHub Releases. Пользователь хочет:

1. Web-версия, доступная на всех платформах (десктоп + мобильные).
2. Хостинг на GitHub Pages.
3. Снятие необходимости в auto-update (обновление = F5 / новый bundle через cache-busting).

**Почему это дёшево:** разведка показала, что в `src/` нет ни одного импорта `electron` — все Electron-зависимости изолированы в папке `electron/` и в **семи** точках вызова `window.api.*` из renderer. Domain-слой (`src/domain/`) и тесты (`tests/domain/`) — pure TypeScript, не меняются. Konva, jsPDF, `navigator.clipboard` уже работают в браузере 1:1.

**Решения пользователя (зафиксированы):**
- Полная замена Electron на web (НЕ dual-build).
- `UpdateBanner` → индикатор текущей версии + опциональный banner «обновите страницу» через polling `/version.json` раз в 10 мин.
- Только `manifest.json` + favicon, без service worker и без offline-режима.

## Точки window.api в renderer (что подменить)

| File:line | Сейчас | Замена в web |
|---|---|---|
| `src/store/catalogStore.ts:42` | `api.storage.loadCatalog()` | `loadCatalog()` из `src/lib/storage/catalogStorage.ts` (localStorage + Zod) |
| `src/store/catalogStore.ts:92` | `api.storage.saveCatalog(...)` | `saveCatalog(...)` (localStorage) |
| `src/store/updateStore.ts:33,47,57,67` | `api.updater.*` (events + RPC) | polling `/version.json`, банер «обновите страницу» |
| `src/lib/exportPng.ts:26` | `api.files.savePng(buf, name)` | `<a download>` + Blob URL |
| `src/lib/exportPdf.ts:83` | `api.files.savePdf(buf, name)` | `jsPDF.save(name)` напрямую |
| `src/lib/printScheme.ts:37` | `api.files.print(html)` | скрытый `<iframe>` + `contentWindow.print()` |

`src/lib/copyImage.ts` уже использует `navigator.clipboard.write()` — не трогаем.

## Этапы миграции (fail-safe порядок)

### Этап 0 — Подготовка без удаления

Цель: подложить web-реализации, чтобы Electron-сборка ещё работала (откат через git revert после любого этапа).

1. **Перенести Zod-схему** `electron/main/schemas.ts` → `src/shared/catalogSchema.ts`. Экспортировать `CatalogSchema`, `RollSchema` и тип `StoredCatalog = z.infer<typeof CatalogSchema>` (последний потом заменит импорт из `ipc-contract.ts`).
2. **Временно** обновить импорт в `electron/main/storage.ts` на `@shared/catalogSchema.js` — Electron-сборка остаётся рабочей.
3. **Создать** `src/lib/storage/catalogStorage.ts`:
   - `loadCatalog(): Promise<StoredCatalog>` — `localStorage.getItem('floorcalc:catalog:v1')` → `JSON.parse` → `CatalogSchema.safeParse` → fallback на дефолт при ошибке.
   - `saveCatalog(catalog): Promise<void>` — `localStorage.setItem(...)`, пробрасывает `QuotaExceededError`.
   - Сигнатуры `async` оставлены идентичными старым `api.storage.*`, чтобы diff в `catalogStore.ts` свёлся к одному импорту.

### Этап 1 — Переключить renderer на web-реализации

Каждый пункт — независим, можно проверять между ними `npm run typecheck && npm run test`.

1. `src/store/catalogStore.ts:14,42,92` — заменить `import { api } from '@/ipc/client'` на `import { loadCatalog, saveCatalog } from '@/lib/storage/catalogStorage'`. В шапке-комментарии заменить `%APPDATA%\FloorCalc\data.json` на «localStorage key `floorcalc:catalog:v1`».
2. `src/lib/exportPng.ts:25-26` — `<a>` + `URL.createObjectURL(blob)` + `a.click()` + `URL.revokeObjectURL`. Возвращаем `{ canceled: false }`.
3. `src/lib/exportPdf.ts:80-83` — `doc.save(\`${name}.pdf\`)` (jsPDF сам делает `<a download>`). Удалить промежуточный `output('blob')` + `arrayBuffer()`.
4. `src/lib/printScheme.ts:36-37` — скрытый iframe (`position:fixed; right:0; bottom:0; width:0; height:0; border:0`), `contentWindow.document.write(html)`, дождаться `load`+`requestAnimationFrame`, `cw.focus(); cw.print()`, удалить через `setTimeout(..., 1000)` (синхронное удаление ломает Chrome). Iframe выбран вместо `window.open` — не триггерит popup-blocker.
5. `src/store/updateStore.ts` — переписать целиком:
   - `current = __APP_VERSION__` (vite define).
   - `next: string | null` — версия с сервера, если отличается от текущей.
   - `initialize()` — `setInterval` 10 минут, fetch `${import.meta.env.BASE_URL}version.json?t=${Date.now()}` с `cache: 'no-store'`. Сравнение строк (без semver-парсера).
   - `dismiss()` — скрыть banner.
6. `src/components/update/UpdateBanner.tsx` — упростить до одного UI-state: `next && !isDismissed` → banner «Доступна версия {next} — обновите страницу», кнопки «Обновить» (`location.reload()`) и «Позже» (`dismiss`).

### Этап 2 — Чистый Vite-конфиг и web-обвязка

1. **Создать** `vite.config.ts` (корень):
   ```ts
   import { defineConfig } from 'vite';
   import react from '@vitejs/plugin-react';
   import { resolve } from 'node:path';
   import { readFileSync } from 'node:fs';
   const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8'));
   export default defineConfig({
     base: '/FloorCalc/',
     plugins: [react()],
     resolve: { alias: { '@': resolve(__dirname, 'src'), '@shared': resolve(__dirname, 'src/shared') } },
     define: { __APP_VERSION__: JSON.stringify(pkg.version) },
     build: { outDir: 'dist', sourcemap: true, target: 'es2022' },
     server: { port: 5173 }
   });
   ```
2. **Обновить** `index.html`: убрать комментарии про Electron/CSP-file://, добавить `<link rel="icon" href="/FloorCalc/favicon.ico">`, `<link rel="manifest" href="/FloorCalc/manifest.json">`, web-CSP в meta:
   ```
   default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';
   script-src 'self'; font-src 'self' data:; connect-src 'self'
   ```
3. **Создать** `public/manifest.json` (`name`, `short_name`, `start_url: "/FloorCalc/"`, `scope: "/FloorCalc/"`, `display: standalone`, `lang: ru`, иконки 192/512).
4. **Сконвертировать** `resources/icon.ico` → `public/icon-192.png`, `public/icon-512.png`, `public/favicon.ico` (ImageMagick `magick icon.ico ...`, ответственность пользователя).
5. **Обновить** `package.json`:
   - `scripts`: `dev: vite`, `build: vite build`, `preview: vite preview`, `typecheck: tsc -p tsconfig.web.json --noEmit`, `test/test:watch` без изменений.
   - Удалить `electron-updater` из `dependencies`.
   - Удалить `electron`, `electron-builder`, `electron-vite` из `devDependencies`.
   - Удалить `main: "out/main/index.js"`.
6. **Обновить tsconfig**:
   - `tsconfig.json:references` — убрать `tsconfig.electron.json`.
   - `tsconfig.node.json:include` — убрать `electron.vite.config.ts`, добавить `vite.config.ts`.
   - Создать `src/global.d.ts` с `declare const __APP_VERSION__: string;` (включается через `tsconfig.web.json`).
7. **Обновить** `knip.json` — убрать `electron/` и `scripts/*.cjs` из entry, заменить `electron.vite.config.ts` на `vite.config.ts`.

После этого `npm run dev` запускает чистый Vite, приложение работает в браузере. Electron-сборка ломается — это ожидаемо.

### Этап 3 — Удаление Electron-кода

Только после зелёного `npm run typecheck && npm run test && npm run build` на Этапе 2:

- Удалить `electron/` (вся папка).
- Удалить `electron.vite.config.ts`, `electron-builder.yml`, `build/app-update.yml` (и пустую `build/`).
- Удалить `tsconfig.electron.json`.
- Удалить `scripts/build-safe.cjs`, `scripts/kill-processes.cjs` (и пустую `scripts/`).
- Удалить `src/shared/ipc-contract.ts`. Перед удалением — перенести оставшиеся используемые типы (`StoredCatalog` уже выводится из `CatalogSchema`; `RollType` уже импортируется напрямую из `@/domain/types`; `SaveResult` устарел — удалить).
- Удалить `src/ipc/client.ts` и пустую папку `src/ipc/`.
- Удалить `.github/workflows/release.yml`.
- Удалить артефакты `out/`, `release/` (gitignored, локально).
- Прогнать `npm prune` после правки `package.json`, чтобы `node_modules/` очистился от electron-транзитива.

### Этап 4 — GitHub Actions deploy

**Создать** `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: [main] }
  workflow_dispatch:
concurrency: { group: pages, cancel-in-progress: true }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm run test
      - run: npm run build
      - name: Generate version.json
        run: |
          VERSION=$(node -p "require('./package.json').version")
          echo "{\"version\":\"$VERSION\",\"builtAt\":\"$(date -u +%FT%TZ)\"}" > dist/version.json
      - name: SPA 404 fallback
        run: cp dist/index.html dist/404.html
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

**В Settings → Pages** в GitHub UI переключить source на «GitHub Actions» (одноразовая ручная операция).

URL после деплоя: `https://AlgorithmicTrade.github.io/FloorCalc/`.

## Critical files (paths)

- `G:\Project-X\FloorCalc\vite.config.ts` — **создать**
- `G:\Project-X\FloorCalc\src\shared\catalogSchema.ts` — **создать** (перенос из `electron/main/schemas.ts`)
- `G:\Project-X\FloorCalc\src\lib\storage\catalogStorage.ts` — **создать**
- `G:\Project-X\FloorCalc\src\global.d.ts` — **создать** (`__APP_VERSION__`)
- `G:\Project-X\FloorCalc\src\store\catalogStore.ts` — **изменить** (импорт + 2 вызова)
- `G:\Project-X\FloorCalc\src\store\updateStore.ts` — **переписать**
- `G:\Project-X\FloorCalc\src\components\update\UpdateBanner.tsx` — **переписать**
- `G:\Project-X\FloorCalc\src\lib\exportPng.ts` — **изменить** (строки 25-26)
- `G:\Project-X\FloorCalc\src\lib\exportPdf.ts` — **изменить** (строки 80-83)
- `G:\Project-X\FloorCalc\src\lib\printScheme.ts` — **изменить** (строки 36-37)
- `G:\Project-X\FloorCalc\index.html` — **изменить** (CSP-meta, manifest, favicon)
- `G:\Project-X\FloorCalc\package.json` — **изменить** (scripts, deps)
- `G:\Project-X\FloorCalc\tsconfig.json`, `tsconfig.node.json` — **изменить**
- `G:\Project-X\FloorCalc\knip.json` — **изменить**
- `G:\Project-X\FloorCalc\public\manifest.json` — **создать**
- `G:\Project-X\FloorCalc\public\icon-192.png`, `icon-512.png`, `favicon.ico` — **создать**
- `G:\Project-X\FloorCalc\.github\workflows\deploy-pages.yml` — **создать**
- `G:\Project-X\FloorCalc\.github\workflows\release.yml` — **удалить**
- `G:\Project-X\FloorCalc\electron\` — **удалить полностью**
- `G:\Project-X\FloorCalc\electron.vite.config.ts`, `electron-builder.yml`, `tsconfig.electron.json`, `build/app-update.yml`, `scripts/build-safe.cjs`, `scripts/kill-processes.cjs` — **удалить**
- `G:\Project-X\FloorCalc\src\shared\ipc-contract.ts`, `src\ipc\client.ts` — **удалить** (после переноса типов)

## Reuse (что использовать как есть)

- `src/domain/calculator/*` — pure TypeScript, без изменений.
- `tests/domain/*` — без изменений.
- `src/lib/copyImage.ts` — уже использует `navigator.clipboard`.
- `src/lib/exportPng.ts:14-19` — генерация blob через `stage.toBlob()` (Konva) — оставляем, меняем только save-вызов.
- `src/lib/exportPdf.ts:1-79` — вся обвязка с Roboto TTF и сборкой PDF — оставляем.
- `src/lib/printScheme.ts:1-35` — сборка HTML — оставляем, меняем только финальный print-вызов.
- `src/components/design-system/*`, `src/components/catalog/*`, `src/components/rooms/*`, `src/components/result/*` — без изменений.

## Verification

После каждого этапа:
```bash
npm run typecheck
npm run test
npm run build
npm run preview          # http://localhost:4173/FloorCalc/
```

После деплоя — ручной smoke на `https://AlgorithmicTrade.github.io/FloorCalc/`:

1. Страница грузится, иконка/manifest корректны (DevTools → Application).
2. Добавить рулон → F5 → рулон сохранён (localStorage).
3. Сломать схему: `localStorage.setItem('floorcalc:catalog:v1', '{"foo":1}')` → reload → каталог пустой, без crash, в console — log Zod-ошибки.
4. Расчёт раскроя в комнате — результат идентичен desktop-версии (domain не менялся).
5. Экспорт PNG: `<a download>` инициирует загрузку с правильным именем.
6. Экспорт PDF: `jsPDF.save` скачивает PDF с кириллицей и схемой.
7. Печать: системный диалог печати открывается, по cancel — iframe удалён через 1с.
8. Update banner: вручную поднять версию в `package.json` → push → подождать редеплой → через ≤10 мин (или после reload) появляется banner «Доступна версия N — обновите страницу».
9. Mobile Safari (iOS): экспорт PDF открывает PDF в новой вкладке (jsPDF docs — это норма), печать работает через системный share-sheet.

## Risks & edge-cases

1. **Popup-blocker для печати** — обходим через скрытый iframe (не `window.open`). Печать обязана вызываться синхронно из click-handler, иначе блокируется. Safari может отказаться печатать iframe с blob-image — fallback: `window.open` с user-confirm.
2. **localStorage 5-10 MB** — каталог рулонов десятки KB, запас огромный. `saveCatalog` пробрасывает `QuotaExceededError` для будущих расширений.
3. **CSP в meta вместо HTTP-header** — GitHub Pages не позволяет задавать заголовки. Meta-CSP не покрывает workers/`frame-ancestors`, нам не нужно. iframe для печати — same-origin `about:blank`, CSP не блокирует.
4. **base-path `/FloorCalc/`** — все статические URL идут через `import.meta.env.BASE_URL`. Регистр чувствителен: `FloorCalc`, не `floorcalc`.
5. **Миграция desktop-пользователей** — их `data.json` в `%APPDATA%\AlgorithmicTrade\FloorCalc\` остаётся нетронутым. **Out of scope для этого плана**, как post-MVP enhancement: drag-and-drop импорт `data.json` → парсинг через `CatalogSchema` → `saveCatalog`.
6. **Кэш браузера для index.html** — GitHub Pages отдаёт с `Cache-Control: max-age=600`. Polling `version.json` с `cache: 'no-store'` + cache-buster `?t=...` обходит кэш для проверки версии.
7. **`__APP_VERSION__` в Vitest** — `updateStore` импортируется только в renderer. Если когда-нибудь тест затронет `updateStore`, добавить `define` в `vitest.config.ts` или замокать константу.
8. **`electron-updater` в bundle** — после `npm uninstall && npm prune` проверить, что в `dist/` ничего не осталось из его транзитивных зависимостей (`grep -r electron dist/` должен быть пуст).
9. **Repo `FloorCalc` под organization** — `https://AlgorithmicTrade.github.io/FloorCalc/` (project pages, не user pages). `base: '/FloorCalc/'` корректно.

## Dev-deps delta

**Удалить:**
- `electron` (devDep)
- `electron-builder` (devDep)
- `electron-vite` (devDep)
- `electron-updater` (dep)

**Добавить:** ничего. Уже есть `vite`, `@vitejs/plugin-react`, `typescript`, `vitest`, `react`, `react-dom`, `zod`, `zustand`, `konva`, `jspdf`, `@types/*`.

## Rollback plan

- После Этапа 0 — `git revert` (Electron-сборка идентична).
- После Этапа 1 — `git revert` каждой подзадачи независимо. Electron-сборка всё ещё работает (storage/files/print/updater handlers в main не удалены).
- После Этапа 2 — `git revert` + `npm install` восстанавливает Electron-сборку.
- После Этапа 3 — откат через `git revert` коммита удаления (electron-папка восстанавливается из истории).
- После Этапа 4 — простой `git revert` workflow-файла.
