# FloorCalc

Web-калькулятор раскроя рулонных напольных и настенных покрытий (линолеум, ковролин, обои, ПВХ). Принимает каталог типоразмеров рулонов и набор прямоугольных помещений, выдаёт два независимых расчёта одновременно — экономный (минимум рулонов) и оптимальный (минимум резов) — с визуальной схемой раскроя и текстовым breakdown. Открывается в браузере, без установки. Текущая версия — **1.1.3**.

## Системные требования

- Современный десктоп- или мобильный браузер (Chrome / Edge / Firefox / Safari) с поддержкой ES2022 и `localStorage`.
- Включённый JavaScript и доступ к `localStorage` (приватные/incognito-режимы могут ограничивать сохранение каталога между сессиями).
- Для функции «Печать» — стандартный диалог печати браузера (любой драйвер печати, в том числе виртуальный «Сохранить как PDF»).
- Для разработки: Node.js >= 20, npm >= 10.

## Запуск пользователем

Production-сборка опубликована на GitHub Pages: `https://AlgorithmicTrade.github.io/FloorCalc/` (URL соответствует `vite.config.ts:base = '/FloorCalc/'`).

- Никаких установок, портативных exe и прав администратора не требуется.
- Каталог типоразмеров рулонов сохраняется в `localStorage` браузера под ключом `floorcalc:catalog:v1`. Чистка кеша / `localStorage` для домена сбрасывает каталог к предустановленному набору `PRESET_ROLLS` из `src/shared/constants.ts`.
- Помещения (вкладки) хранятся только в памяти текущей вкладки браузера и теряются при перезагрузке страницы.

## Возможности

- **Каталог типоразмеров рулонов** — persist в `localStorage` браузера (Zod-валидация при чтении, `defaultCatalog()` fallback на `PRESET_ROLLS` при отсутствии ключа или повреждении JSON). Чекбоксы для выбора активных в расчёте, цветные swatch для каждого типоразмера, ширина и длина — целые миллиметры (минимум 100 мм, максимум 100 м).
- **Несколько помещений** во вкладках, каждое со своим набором расчётов; компактная swap-кнопка между полями ширины и длины (один patch меняет оба значения местами).
- **Два режима одновременно** для каждого помещения:
  - **economy** — агрессивно реюзит обрезки через банк с гильотинным резом → меньше рулонов, больше резов.
  - **optimal** — предпочитает целые куски при `placedAtY = 0` → меньше резов, может использовать больше рулонов.
  - Tie-break лексикографический по cuts/waste; различия между режимами реальные, не косметические.
- **Mixed-type раскладка** — одна схема может комбинировать разные типоразмеры рулонов из активного каталога; rotation post-pass разворачивает однородный tail-row в один повёрнутый кусок из подходящего обрезка для уменьшения числа резов; перебор обеих ориентаций комнаты (width↔length swap).
- **Визуальная схема раскроя** на Konva — stats и схема в одном stage (всё попадает в экспорт PNG/PDF/print/copy); HTML hover-tooltip за курсором с площадью обрезка рулона целиком; на мобильных tap-tooltip активируется по нажатию. В `ResultCard` заголовок режима кликабелен (dotted-underline) и открывает inline-popup с подсказкой по режиму (закрывается по клику вне, по `Escape` или повторным нажатием).
- **Экспорт**: копирование в системный буфер обмена, сохранение PNG, экспорт PDF (A4 landscape) через jsPDF, системная печать через `window.print()`.
- **Адаптивный канвас**: на десктопе фиксированный aspect 9:16 для предсказуемых пропорций; на мобильных (`cw < 480px`) канвас вытягивается под `roomAspect`, чтобы помещаться вместе с метками кусков.
- **Auto-update** — при каждом push в `main` GitHub Actions деплоит свежий `dist/` на Pages вместе с `dist/version.json`. Renderer раз в 10 минут пуллит `${BASE_URL}version.json` и сравнивает строку `version` с build-time-литералом `__APP_VERSION__`. При расхождении показывается `UpdateBanner` («Доступна версия X. Установлена Y.») с кнопками «Обновить» (`location.reload()`) и «Позже».
- **PWA-манифест**: `public/manifest.json` + иконки 192/512, `<meta name="theme-color" content="#1f2937">` в `index.html`.

## Разработка

```bash
# Установка зависимостей
npm install

# Dev-сервер (Vite + HMR, http://localhost:5173)
npm run dev

# Type-check (две конфигурации: tsconfig.web.json + tsconfig.node.json)
npm run typecheck

# Unit-тесты (Vitest, single pass, domain-слой + scheme-renderer)
npm run test

# Watch-режим тестов
npm run test:watch

# Production build: typecheck → vite build (→ dist/)
npm run build

# Локальный preview production-сборки (vite preview)
npm run preview
```

`npm run dev` поднимается на порту 5173 (`vite.config.ts:server.port`), `strictPort: false` — при занятом порте Vite берёт следующий свободный.

### Релизы и деплой

CI/CD настроен через `.github/workflows/deploy-pages.yml`:

1. Trigger — `push` в `main` или ручной `workflow_dispatch`.
2. Job `build` (ubuntu-latest):
   - `actions/checkout@v4`.
   - `actions/setup-node@v4` (`node-version: 20`, `cache: npm`).
   - `npm ci` → `npm run typecheck` → `npm run test` → `npm run build`.
   - Генерация `dist/version.json` вида `{"version":"…","builtAt":"<UTC ISO 8601>"}` (источник истины для in-app updater).
   - SPA 404 fallback: `cp dist/index.html dist/404.html` (страховка для прямых переходов на под-URL Pages).
   - `actions/configure-pages@v5` → `actions/upload-pages-artifact@v3` (`path: dist`).
3. Job `deploy` (needs `build`) — `actions/deploy-pages@v4`, environment `github-pages`. После завершения в outputs появляется итоговый `page_url`.

Concurrency group `pages` с `cancel-in-progress: true` — параллельные деплои одного коммита взаимно отменяются.

Bump версии в `package.json` + dual-changelog (`CHANGELOG.md` + `RELEASE_NOTES.md`) выполняется через slash-команды `/commit` и `/push` (см. `CLAUDE.md`). Тег `v*` создаётся для трекинга версий, но триггер деплоя — push в `main`, не тег.

### Архитектура

```text
public/                                # статические ассеты, копируются в dist/ как есть
  favicon.ico, icon-192.png, icon-512.png, manifest.json

src/
  App.tsx, main.tsx                    # entry: createRoot → <StrictMode><App/></StrictMode>
  css-modules.d.ts, global.d.ts        # global.d.ts: vite/client + declare const __APP_VERSION__
  shared/                              # чистые types/Zod-схемы/константы
    catalogSchema.ts                   # Zod-валидация StoredCatalog
    constants.ts                       # APP_NAME, STORAGE_SCHEMA_VERSION, PRESET_ROLLS, DIMENSION_MIN/MAX_MM
  domain/                              # pure-TypeScript, без браузерных API
    types.ts, units.ts, validation.ts
    calculator/                        # strip, bank, seams, economy, optimal, mixed, selectMixed, selectRoll, index
  components/
    design-system/                     # Button, Card, TextInput, NumberField, Checkbox, Eyebrow, IconButton, Tabs
    catalog/                           # AddRollForm, RollCatalog, RollRow
    rooms/                             # RoomTabs, RoomEditor, RoomResultPanel
    result/                            # ResultCard, ResultText, ResultActions, SchemeView (native Konva), SchemeRenderer
    update/                            # UpdateBanner
    layout/                            # AppShell, EmptyState
  store/                               # Zustand v5
    catalogStore.ts                    # persist через src/lib/storage/catalogStorage.ts
    roomsStore.ts                      # in-memory; защита от удаления последнего помещения
    resultsCache.ts                    # singleton FIFO 64 entries, key = hash(room+rolls+mode)
    updateStore.ts                     # 10-min polling ${BASE_URL}version.json
  lib/
    exportPng.ts, exportPdf.ts, copyImage.ts, printScheme.ts, hash.ts
    storage/catalogStorage.ts          # localStorage adapter с Zod-валидацией и defaultCatalog fallback
  styles/                              # tokens, typography, globals, print (импорт в main.tsx именно в этом порядке)

tests/domain/                          # Vitest: bank, seams, scheme-renderer,
                                       # calculator.{economy,optimal,mixed,mixed-orientation,mixed-rotation}, fixtures.ts

resources/                             # icon.ico, fonts/InterVariable.woff2

index.html                             # SPA root (CSP meta-tag, manifest link, root div + main.tsx script)
vite.config.ts                         # base '/FloorCalc/', alias @ → src, @shared → src/shared,
                                       # define __APP_VERSION__, build target es2022, sourcemap true
vitest.config.ts                       # конфиг Vitest
tsconfig.json                          # composite-references на web/node configs
tsconfig.web.json                      # src/** (jsx react-jsx, alias @/*, @shared/*, noEmit, composite)
tsconfig.node.json                     # vite.config.ts, vitest.config.ts (types ["node"], lib ["ES2022"])
knip.json                              # entry: src/main.tsx + vite/vitest configs (закоммичено)
.github/workflows/deploy-pages.yml     # CI: typecheck → test → build → version.json → 404 fallback → deploy
```

Ключевые детали:

- **`index.html`** — `<html lang="ru">`, CSP через meta `default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'`, `<link rel="manifest" href="/manifest.json">`, `<meta name="theme-color" content="#1f2937">`.
- **`src/main.tsx`** — `createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>)`. Стили импортируются именно в порядке tokens → typography → globals → print, чтобы каскад не терял токены.
- **`src/App.tsx`** — на mount вызывает `useCatalogStore.load()` (загрузка из `localStorage`) и `useUpdateStore.initialize()` (старт polling, возвращает unsubscribe). Рендерит version-badge `v{__APP_VERSION__}` поверх `AppShell` (левая колонка — `RoomEditor` + `RollCatalog`, правая — `RoomTabs` + `RoomResultPanel`) и `UpdateBanner`.
- **`src/lib/storage/catalogStorage.ts`** — `loadCatalog()`: ключ `floorcalc:catalog:v1`, при отсутствии ключа или ошибке Zod-валидации возвращает `defaultCatalog()` (`PRESET_ROLLS`, все id выбраны), пишет ошибку в `console.error` без throw. `saveCatalog()`: синхронный `localStorage.setItem`; `QuotaExceededError` намеренно пробрасывается — UX-обработка останется на стороне `catalogStore`.
- **`src/store/updateStore.ts`** — `POLL_MS = 10 * 60 * 1000`, `VERSION_URL = ${import.meta.env.BASE_URL}version.json`, fetch с `cache: 'no-store'` и cache-buster `?t=${Date.now()}`. Сравнение строкой намеренно (а не semver) — семантика «сборка отличается от текущей» точнее.
- **`src/domain/calculator/`** — алгоритмы 2D-раскроя:
  - `bank.ts` — `OffcutBank` с гильотинным резом и tie-break по площади.
  - `economy.ts` / `optimal.ts` — два режима с разной стратегией выбора рулона.
  - `mixed.ts` — `calculateMixed` (greedy с общим `OffcutBank` и `rollIndexToType`), `calculateMixedBestOrientation` (перебор width↔length swap), `applyRotationPass` (детект однородного tail-row → замена одним rotated куском из обрезка).
  - `selectMixed.ts` — `countCuts` + `selectMixed` с lex-key (rollsUsed/pieces/cuts/waste для economy, pieces/cuts/rollsUsed/waste для optimal).
  - `seams.ts` — `computeSeamCount` (число дискретных швов по группировке pieces по `placedAtX`).
- **`src/components/result/SchemeView.tsx`** — native Konva (без react-konva), `Group` по `pieceId` с hover/tap-listener, HTML overlay-tooltip за курсором; `useImperativeHandle` временно делает cut-labels видимыми перед `toCanvas`/`toDataURL`/`toBlob`, чтобы они попадали в экспорт. Tooltip показывает агрегированную площадь остатка для всего рулона целиком (по `rollIndex` через `formatAreaTrim`). Адаптив: на десктопе фиксированный aspect 9:16; при `cw < 480px` канвас тянется под `roomAspect`.
- **`src/components/result/ResultCard.tsx`** — кликабельный заголовок режима с inline-popup-подсказкой (toggle, `Escape`, click-outside).

### Безопасность

- CSP-политика подаётся через `<meta http-equiv="Content-Security-Policy" …>` в `index.html` — внешние скрипты, шрифты и connect-цели заблокированы (`'self'` + `data:`/`blob:` для изображений и шрифтов).
- Web-runtime — никаких контейнеров для секретов уровня `electron.safeStorage` нет: `localStorage` для секретов не предназначен. В FloorCalc клиентских секретов нет (вычисления локальные, внешние API не вызываются), так что в браузере хранятся только пользовательские данные каталога рулонов — не конфиденциальная информация.
- CI-секреты (если когда-либо понадобятся) передаются через GitHub Actions secrets и не попадают в репозиторий. На текущий момент `deploy-pages.yml` использует только встроенный `GITHUB_TOKEN` через permissions `contents: read, pages: write, id-token: write`.
- Никаких hardcoded API-ключей, токенов, OAuth response в логах — см. `.claude/rules/security.md`.

## Лицензия

Internal use, AlgorithmicTrade.
