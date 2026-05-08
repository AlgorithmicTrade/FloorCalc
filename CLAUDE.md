# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

**FloorCalc** — web-калькулятор раскроя рулонных напольных и настенных покрытий (линолеум, ковролин, обои, ПВХ). Текущий релиз — **v1.1.3** (см. `package.json:version`, `CHANGELOG.md`, `RELEASE_NOTES.md`).

- Git инициализирован, remote `origin` → `https://github.com/AlgorithmicTrade/FloorCalc.git`, основная ветка — `main`.
- Стек: Vite 7 + React 19 + TypeScript 5 + Konva 9 + Zustand 5 + Zod 3 + jsPDF 4. Test runner — **Vitest 4.x** (`tests/domain/`).
- Package manager — **npm** (lock-файл `package-lock.json`, `engines: node >=20.0.0, npm >=10.0.0`, `packageManager: npm@10.8.2`). НЕ использовать `pnpm` / `yarn` — они в проекте не настроены.
- Distribution: статический SPA, деплой на GitHub Pages под base path `/FloorCalc/` (см. `vite.config.ts:base`). Никаких portable-exe / desktop-сборок — Electron-стек удалён в ходе миграции на Web.
- CI/CD: `.github/workflows/deploy-pages.yml` — на `push` в `main` (или ручной `workflow_dispatch`) запускает `npm ci → typecheck → test → build → generate dist/version.json → cp dist/index.html dist/404.html → upload-pages-artifact → deploy-pages`. Никаких отдельных release-workflow и push-on-tag — каждый push в `main` = публикация.
- Beads (`bd`) инициализирован в `.beads/`, но БД/JSONL файлы в `.gitignore` (строка `.beads/`) — beads используется локально, без git-синхронизации (`sync-branch` не задан в `.beads/config.yaml`).
- Workspace artefacts в `.gitignore`: `node_modules/`, `out/`, `release/`, `dist/`, `*.tsbuildinfo`, `coverage/`, `.tmp/`, `release-notes-current.md`, `*.log`, `.env*` (кроме `.env.example`), `.beads/`, `reports/`, `claude-code-orchestrator-kit/` (vendored npm-пакет, физически присутствует, но не коммитится), `release-test/`, `release-new/`, `docs/plans/agile-prancing-pnueli.md`, `.claude/anytype-sync-queue.txt`, `.claude/hooks/__pycache__/`, `.claude/hooks/beads-sync-trigger.log`, `.claude/worktrees/`.

## Orchestrator Pattern (главное)

Claude в этом workspace работает как **оркестратор**, а не как одиночный исполнитель. Полный контракт описан в `claude-code-orchestrator-kit/CLAUDE.md`. Ключевые правила (применять без напоминания):

1. **Сначала контекст, потом действие** — читать связанные файлы, искать существующие паттерны, проверять commit history, прежде чем делегировать или писать код.
2. **Делегировать в субагенты** для всего нетривиального; прямое выполнение допустимо только для однострочных правок, единичной установки зависимости, тривиальной правки конфига.
3. **После делегирования — ВСЕГДА верификация:** прочитать изменённые файлы, прогнать `npm run typecheck` / `npm run build` / `npm run test`. Без этого задача не считается завершённой.
4. **Атомарность**: 1 задача = 1 вызов агента. Параллельные агенты — в одном tool-call message.
5. **Library-first**: перед написанием >20 строк нового кода ищи существующую библиотеку (WebSearch + проверка bundlephobia / weekly downloads / activity).

## Project Overview

Минимально, чтобы сделать осмысленное предложение:

- **Domain-слой** — `src/domain/calculator/`. Алгоритмы 2D-раскроя: `bank` (OffcutBank с гильотинным резом), `economy`/`optimal` (две стратегии выбора рулона с разным lex-tie-break), `mixed` (greedy с общим bank + rotation post-pass + перебор ориентаций room width↔length), `selectMixed`/`selectRoll` (выбор лучшего варианта), `seams` (число швов по группировке `placedAtX`), `strip` (низкоуровневая нарезка), `index` (фасад). Слой чисто-вычислительный, без браузерных API.
- **UI-слой** (React 19 + Vite) — `src/components/{design-system,catalog,rooms,result,update,layout}` + Zustand-stores в `src/store/`:
  - `catalogStore` — persist через `src/lib/storage/catalogStorage.ts` (localStorage adapter).
  - `roomsStore` — in-memory; защита от удаления последнего помещения; не персистится между перезагрузками.
  - `resultsCache` — singleton FIFO 64 entries по `hash(room+rolls+mode)`.
  - `updateStore` — 10-минутный polling `${BASE_URL}version.json`, статусы для `UpdateBanner`.
- **Storage layer** — `src/lib/storage/catalogStorage.ts`. Ключ `localStorage['floorcalc:catalog:v1']`, Zod-валидация при чтении, `defaultCatalog()` fallback на `PRESET_ROLLS` при отсутствии ключа или повреждении JSON, `console.error` без throw. `saveCatalog()` синхронно пишет `localStorage.setItem`; `QuotaExceededError` пробрасывается, in-memory state не откатывается.
- **Vite entry** — `index.html` (CSP через `<meta http-equiv="Content-Security-Policy" …>`; `<link rel="manifest" href="/manifest.json">`; `<meta name="theme-color" content="#1f2937">`; `<script type="module" src="/src/main.tsx">`) + `src/main.tsx` (импорт стилей в порядке tokens → typography → globals → print, монтирование `<StrictMode><App/></StrictMode>` в `#root`).
- **Shared schemas/constants** — `src/shared/catalogSchema.ts` (Zod-схема `CatalogSchema`/`StoredCatalog`) + `src/shared/constants.ts` (`APP_NAME`, `STORAGE_SCHEMA_VERSION`, `PRESET_ROLLS`, `DIMENSION_MIN_MM=100`, `DIMENSION_MAX_MM=100_000`). НЕ путать со старым «IPC contract» — IPC-слой удалён вместе с Electron.
- **Tests** — `tests/domain/{bank,seams,scheme-renderer,calculator.economy,calculator.optimal,calculator.mixed,calculator.mixed-orientation,calculator.mixed-rotation}.test.ts` + `fixtures.ts`. Покрыт domain-слой и `SchemeRenderer`; UI-компоненты Konva/React unit-тестами не покрыты.

Подробности по архитектуре — в `README.md` (раздел «Архитектура») и `DESIGN.md`. При изменениях в domain-слое — синхронно обновляй README/DESIGN, если меняется поведение алгоритмов.

## Common Commands

### npm scripts (`package.json`)

| Скрипт | Назначение |
|--------|-----------|
| `npm run dev` | `vite` — HMR dev-server на http://localhost:5173 (`server.strictPort: false` — при занятом порте Vite берёт следующий свободный). |
| `npm run typecheck` | `tsc -p tsconfig.web.json --noEmit && tsc -p tsconfig.node.json --noEmit`. **Имя без дефиса** — `typecheck`, не `type-check`. |
| `npm run test` | `vitest run` (CI-режим, single pass). |
| `npm run test:watch` | `vitest` (watch-режим). |
| `npm run build` | `npm run typecheck && vite build` — статический билд в `dist/`. |
| `npm run preview` | `vite preview` — локальный просмотр production-сборки. |

Скриптов `build:safe` / `build:publish` в проекте больше нет — они были специфичны для Electron + electron-builder и удалены в ходе миграции на Web.

### Slash-commands (`.claude/commands/`)

Запускать через UI Claude Code (`/имя`), не через Bash.

#### Development workflow

| Команда | Назначение |
|---------|-----------|
| `/commit [patch\|minor\|major]` | СТРОГО ДВУХШАГОВО: (1) сформировать commit message по проектному формату → (2) вызвать `/push` для релиза. Шаг 2 не запускать до полного вывода message в Шаге 1. |
| `/push [patch\|minor\|major] [-m "msg"]` | Релизный скрипт `.claude/scripts/release.sh`: bump версии в `package.json`, dual changelog (`CHANGELOG.md` + `RELEASE_NOTES.md`), git tag, push в `main`. Push в `main` запускает `.github/workflows/deploy-pages.yml` → деплой свежей сборки на GitHub Pages. Тег `v*` создаётся для трекинга версий, отдельного CI-trigger на тег нет. |
| `/worktree` | Управление git worktrees (create/remove/list/cleanup). |

#### Health workflows (inline orchestration)

Каждая команда — это «inline» скилл: главный Claude САМ оркестрирует, не спавнит отдельного orchestrator-агента. **Quality gate во всех health-командах** — `npm run typecheck && npm run build` (НЕ `pnpm type-check`, как написано в template-skill — там это дефолт оригинального шаблона; для FloorCalc нужно адаптировать на npm). `npm run build` теперь = `typecheck + vite build`, без electron-builder.

| Команда | Workers | Назначение |
|---------|---------|-----------|
| `/health-bugs` | bug-hunter, bug-fixer | Detect → fix by priority → verify (3 итерации). |
| `/health-security` | security-scanner, vulnerability-fixer | Уязвимости и их fix. |
| `/health-cleanup` | dead-code-hunter, dead-code-remover | Knip-driven dead code removal (Knip уже в `devDependencies`, конфиг — `knip.json`). |
| `/health-deps` | dependency-auditor, dependency-updater | Аудит и обновление пакетов. |
| `/health-reuse` | reuse-hunter, reuse-fixer | Дедупликация (Single Source of Truth). |
| `/health-metrics` | — | Сводный отчёт по всем health-скиллам. |
| `/record-metrics` | — | Сбор метрик в `.tmp/metrics/YYYY-MM.json`. |

#### SpecKit (планирование больших фич)

`/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`.
Для интеграции с Beads: `/speckit.tobeads` (импорт tasks как Beads issues), `/speckit.taskstoissues` (в GitHub Issues).

Plan-файлы складываются в `./docs/plans/` (см. `settings.json:plansDirectory`).

#### Beads (issue tracking)

Уже инициализирован (`.beads/config.yaml` присутствует). Стандартный flow:

```bash
bd ready                                  # найти готовую задачу
bd update <id> --status in_progress
bd close <id> --reason "Done"
bd sync                                   # локальная синхронизация (sync-branch не настроен — git-коммит beads не выполняется)
```

Поскольку `.beads/` в `.gitignore`, beads используется как локальный issue tracker. Для шаринга с командой нужно либо настроить `sync-branch` в `.beads/config.yaml` и убрать `.beads/` из `.gitignore`, либо переехать на GitHub Issues.

`/beads-init` — повторная инициализация (если БД повреждена или нужно сбросить).

#### Synchronization

- `/anytype [task-id...]` — синхронизация открытых Beads-задач в Anytype space FundingBot через агента `anytype-beads-sync`.
  - Без аргументов — инкрементальная синхронизация по watermark `(updated_at, closed_at, status)`.
  - С ID — force-update указанных задач без проверки watermark.
  - Mapping-файл: `G:\Project-X\FundingBot\.claude\anytype-beads-mapping.json` (внешний, не в этом workspace; FloorCalc использует общий mapping FundingBot).
  - В Anytype синхронизируются ТОЛЬКО `open` задачи; `closed` — удаляются.

#### Misc

| Команда | Назначение |
|---------|-----------|
| `/process-logs` | Обработка error-логов (заточена под admin-panel БД из других проектов). **Не применимо в FloorCalc Web** — нет файла `debug.log`, нет admin-panel БД, error-логи существуют только в DevTools-консоли браузера пользователя. |
| `/ultra-think` | Глубокий анализ через multi-dimensional thinking. |
| `/translate-doc` | Перевод документации EN → RU. |
| `/supabase-performance-optimizer` | Делегирование оптимизации Supabase профильным агентам — **в FloorCalc не применимо** (нет Supabase). |

## High-level Architecture

### Корневая структура

```
G:\Project-X\FloorCalc\
├── public/                          # статические ассеты Vite, копируются в dist/ как есть
│   ├── favicon.ico
│   ├── icon-192.png, icon-512.png
│   └── manifest.json
│
├── src/
│   ├── App.tsx, main.tsx, css-modules.d.ts
│   ├── global.d.ts                  # vite/client + declare const __APP_VERSION__
│   ├── shared/                      # pure-TS, переиспользуется domain + UI
│   │   ├── catalogSchema.ts         # Zod-схема StoredCatalog
│   │   └── constants.ts             # APP_NAME, STORAGE_SCHEMA_VERSION, PRESET_ROLLS, DIMENSION_MIN/MAX_MM
│   ├── domain/                      # pure-TypeScript
│   │   ├── types.ts, units.ts, validation.ts
│   │   └── calculator/              # strip, bank, seams, economy, optimal, mixed, selectMixed, selectRoll, index
│   ├── components/
│   │   ├── design-system/           # Button, Card, TextInput, NumberField, Checkbox, Eyebrow, IconButton, Tabs
│   │   ├── catalog/                 # AddRollForm, RollCatalog, RollRow
│   │   ├── rooms/                   # RoomTabs, RoomEditor, RoomResultPanel
│   │   ├── result/                  # ResultCard, ResultText, ResultActions, SchemeView (native Konva), SchemeRenderer
│   │   ├── update/                  # UpdateBanner
│   │   └── layout/                  # AppShell, EmptyState
│   ├── store/                       # Zustand v5: catalogStore, roomsStore, resultsCache (FIFO 64), updateStore
│   ├── lib/
│   │   ├── exportPng.ts, exportPdf.ts, copyImage.ts, printScheme.ts, hash.ts
│   │   └── storage/catalogStorage.ts   # localStorage 'floorcalc:catalog:v1' + Zod + defaultCatalog
│   └── styles/                      # tokens, typography, globals, print
│
├── tests/domain/                    # Vitest: bank, seams, scheme-renderer,
│                                    # calculator.{economy,optimal,mixed,mixed-orientation,mixed-rotation}, fixtures.ts
├── resources/                       # icon.ico, fonts/InterVariable.woff2 (legacy-ассеты, импортируются из src по необходимости)
├── docs/plans/                      # SpecKit-планы
│
├── index.html                       # SPA root: CSP-meta, manifest link, <div id="root"> + main.tsx script
├── vite.config.ts                   # base '/FloorCalc/', alias @ → src, @shared → src/shared,
│                                    # define __APP_VERSION__, build target es2022, sourcemap true,
│                                    # server port 5173 strictPort:false
├── vitest.config.ts
├── tsconfig.json                    # composite-references на web/node configs (files:[])
├── tsconfig.web.json                # src/**, jsx react-jsx, alias, noEmit, composite, outDir out/renderer
├── tsconfig.node.json               # vite.config.ts + vitest.config.ts (types ["node"], lib ["ES2022"])
├── knip.json                        # entry: src/main.tsx + vite.config.ts + vitest.config.ts (закоммичено)
├── package.json                     # v1.1.3
├── package-lock.json
├── README.md, DESIGN.md, CHANGELOG.md, RELEASE_NOTES.md, AGENTS.md
├── .github/workflows/deploy-pages.yml   # CI: typecheck → test → build → version.json → 404 fallback → deploy
└── .claude/                         # см. ниже
```

Полностью отсутствуют (наследие Electron-эпохи, удалены в ходе миграции): `electron/main/`, `electron/preload/`, `src/ipc/`, `src/shared/ipc-contract.ts`, `electron-builder.yml`, `electron.vite.config.ts`, `build/app-update.yml`, `tsconfig.electron.json`, директория `scripts/` (включая `build-safe.cjs` / `kill-processes.cjs`), `.github/workflows/release.yml`. Если в логах субагентов или в коммит-истории встречаются ссылки на эти артефакты — это исторические записи, текущему состоянию они не соответствуют.

### `.claude/` структура

```
.claude/
├── agents/                          # множество субагентов в категориях:
│                                    # business, database, development, documentation, frontend,
│                                    # health, infrastructure, integrations, meta, research, testing
│                                    # (frontend: nextjs-ui-designer и пр. — Next.js-ориентированы;
│                                    #  для FloorCalc Web SPA применимы условно)
├── skills/                          # переиспользуемые скиллы (SKILL.md в каждой папке)
├── commands/                        # slash-команды (см. выше)
├── hooks/
│   ├── beads-sync-trigger.py        # PostToolUse hook: ловит мутирующие `bd` Bash-вызовы, складывает FundingBot-* IDs
│   │                                  в .claude/anytype-sync-queue.txt и через hookSpecificOutput напоминает оркестратору
│   │                                  вызвать anytype-beads-sync только для этих ID. READ-ONLY относительно Beads.
│   ├── beads-sync-trigger.log       # лог hook (gitignored)
│   ├── __test_payloads/             # тестовые payloads для hook
│   └── __pycache__/                 # Python-cache (gitignored)
├── schemas/                         # JSON schemas для orchestrator plan-файлов
│   ├── base-plan.schema.json
│   ├── bug-plan.schema.json
│   ├── dead-code-plan.schema.json
│   ├── dependency-plan.schema.json
│   └── security-plan.schema.json
├── scripts/
│   ├── release.sh                   # release automation (используется /push)
│   └── gates/                       # check-bundle-size.sh, check-coverage.sh, check-security.sh
├── tasks/                           # архивные task-файлы (open-orders-adapters-migration, private-api-centralization —
│                                      наследие от FundingBot)
├── docs/                            # beads-quickstart.{md,en.md}
├── rules/                           # проектные правила (см. ниже)
├── settings.json                    # ENABLE_TOOL_SEARCH=auto:5, plansDirectory=./docs/plans,
│                                      plugins: voltagent-{dev-exp,qa-sec}@voltagent-subagents
├── settings.local.json              # локальные оверрайды (не комментировать содержимое — может быть user-specific)
├── statusline.ps1                   # PowerShell status line
└── worktrees/                       # для git worktree workflow (gitignored)
```

### Test runner selection

- **FloorCalc использует Vitest** (`vitest@^4.1.5` в `devDependencies`, `vitest.config.ts`, тесты в `tests/domain/`). Используй `test-writer` агента.
- `tester-bot` (Jest) — НЕ применять. В проекте Jest не настроен.
- E2E/browser → не настроены. При необходимости — `webapp-testing` (Playwright). Поскольку приложение теперь — обычный SPA, Playwright достаточно для интеграционных проверок UI.
- При запуске тестов используй `npm run test` (single pass) или `npm run test:watch`.

### `claude-code-orchestrator-kit/` (upstream)

Отдельный git-репозиторий, vendored через npm-пакет `claude-code-orchestrator-kit@0.19.3`. **В `.gitignore`** — физически присутствует, но не коммитится. Используется как:

- Источник эталонных агентов/скиллов/команд (прежде чем создавать новый — проверяй upstream).
- Полная документация: `docs/ARCHITECTURE.md`, `docs/COMMANDS-GUIDE.md`, `docs/TUTORIAL-CUSTOM-AGENTS.md`, `docs/USE-CASES.md`, `docs/Agents Ecosystem/AGENT-ORCHESTRATION.md`.
- `prompts/` — `setup-error-logging.md`, `setup-health-workflows.md`.
- `.specify/` — SpecKit memory + templates.
- `.mcp.json` — пример конфигурации (context7, sequential-thinking, supabase, playwright, shadcn, serena).

В корневом `.claude/settings.json` MCP-серверы НЕ настроены — только `ENABLE_TOOL_SEARCH=auto:5` (включает Tool Search при >5 включенных серверов) и плагины `voltagent-dev-exp` / `voltagent-qa-sec`.

## Project Rules (`.claude/rules/`)

Эти правила автоматически загружаются как project-level instructions. Соблюдай без явного напоминания:

### `commit_message.md` (КРИТИЧНО для `/commit`)

Формат коммита — conventional commit на русском с тремя ОБЯЗАТЕЛЬНЫМИ секциями:

```
<type>(<scope>): <русское summary, повелит. накл., ≤120 симв., без точки>

Решение:
- <bullet: что было изменено концептуально>

Изменения:
- <file_path>:
  - <методы / логика>

Эффект:
- <итоговое поведение, гарантии, влияние на стабильность/корректность/perf>
```

- `<type>` ∈ `feat | fix | refactor | perf | chore | docs | test`.
- `<scope>` — английский, краткое имя логического модуля. Для текущего web-стека FloorCalc типичные: `Web` (общий SPA-уровень, AppShell, общие правки renderer), `Calculator` (domain), `Bank` / `Mixed` / `Optimal` / `Economy` (внутри `domain/calculator/`), `Catalog` (UI catalog + `lib/storage/catalogStorage.ts`), `Rooms` (UI rooms + roomsStore), `Result` (Scheme + export + ResultCard), `Scheme` (SchemeView, SchemeRenderer), `Storage` (`src/lib/storage/`), `Update` (`updateStore` + `UpdateBanner` + `version.json`), `CI` (deploy-pages.yml), `Release` (release.sh, CHANGELOG/RELEASE_NOTES bump). Старые Electron-scopes (`Updater`, `IPC`, `WindowState`, `Preload`) больше не применимы.
- Если для секции нет содержания — поставь `—`, НЕ оставляй плейсхолдеры в `<>`.
- Маркеры списка только `-`. Никаких упоминаний AI/диалога/«этот чат».

### `quality.md` (data integrity — КРИТИЧНО)

- **Никаких mocks/stubs/fake data.** Только реальные реализации.
- Любое утверждение «бага/утечки/дубликата нет» должно ссылаться на конкретные файлы и строки прочитанного кода. Гипотезы без чтения — помечай `unverified`.
- При невозможности прочитать файл целиком — НЕ давай выводов, верни `Insufficient data: <чего не хватило>` и продолжи через grep + чтение нужных диапазонов.
- `git diff` НЕ заменяет чтение текущего состояния файла.
- Для тестов в FloorCalc делегируй `test-writer` агенту (Vitest, `tests/domain/`). Скилл `/test-step` заточен под `electron/engine/` других проектов и здесь не применим — в FloorCalc нет ни этой директории, ни Jest.

### `security.md`

Файл правила писался в Electron-эпоху (упоминает `electron.safeStorage`, `data.json`, `window-state.json`). Для текущего web-проекта интерпретируй так:

- Никаких hardcoded API-ключей, токенов, OAuth response в коде или логах — это абсолютное правило вне зависимости от среды.
- В FloorCalc клиентских секретов нет: вычисления локальные, внешних API не вызываем, расчёт не требует авторизации.
- `localStorage` НЕ предназначен для секретов. В FloorCalc там лежит только каталог типоразмеров рулонов (`floorcalc:catalog:v1`) — не конфиденциальная информация.
- CI-секреты (если когда-либо потребуются) — только через GitHub Actions secrets, не в коммитах. На текущий момент `deploy-pages.yml` использует только встроенный `GITHUB_TOKEN` через permissions.
- Старые упоминания `electron.safeStorage` / `data.json` / `window-state.json` / `GH_TOKEN` для `build:publish` к web-сборке не относятся — соответствующие сущности удалены.

### `workflow.md`

- Перед созданием нового файла — проверь, можно ли расширить существующий. Создавай новый, только если подходящего места нет.
- Если файл слишком большой для разового чтения — НЕ делай вывод «не могу прочитать». Используй Grep/Glob, читай нужные диапазоны фрагментами.
- При ошибке чтения через `@codebase` — формулируй как «чтение не удалось (ошибка/таймаут)», предложи альтернативу (поиск или чтение фрагментами), а не «слишком большой/нет доступа».
- Все ссылки на код — точные (`file:function`/`file:line`) на основании реально прочитанного.

### `logging.md`

- Не добавляй избыточных логов. Временные debug-логи удаляй перед финальным apply. В web-сборке логи идут только в DevTools-консоль браузера пользователя — нет file-логирования, нет `%APPDATA%/FloorCalc/debug.log` (всё это было частью удалённого Electron-стека).

### `preference.md`

- Всегда отвечай по-русски (orthography строгая: ё, ä, ü, é и т.д. — никаких ASCII-замен).

## File organization conventions

- Агенты: `.claude/agents/{domain}/workers/<name>.md`.
- Скиллы: `.claude/skills/<skill-name>/SKILL.md`.
- Команды: `.claude/commands/<name>.md`.
- Временные артефакты: `.tmp/current/` (gitignored).
- Метрики health-скиллов: `.tmp/metrics/YYYY-MM.json` (gitignored).
- Отчёты health-скиллов: `reports/` (gitignored — `reports/security-scan-report.md`, `reports/dead-code-report.md` и т.п.).
- Plan-файлы оркестратора: `./docs/plans/` (см. `settings.json:plansDirectory`).
- Test fixtures: `tests/domain/fixtures.ts` (общие типоразмеры рулонов и комнаты для domain-тестов).

## When delegating: agent selection cheat sheet

- **Bug в коде** → `/health-bugs` (или `bug-hunter` → `bug-fixer` напрямую).
- **Уязвимость** → `/health-security`.
- **Dead code** → `/health-cleanup` (Knip уже установлен — `knip@^6.12.1`, конфиг `knip.json` закоммичен).
- **TS-ошибки после правок** → re-delegate тому же агенту ИЛИ `typescript-types-specialist`.
- **Крупный рефакторинг** — НЕ напрямую, через `code-structure-refactorer`.
- **Архитектурные решения (>1 компонент)** — через скилл `senior-architect`.
- **Performance** — `performance-optimizer`.
- **Глубокая диагностика бага** — `problem-investigator` (root cause analysis с execution trace).
- **UI design** — `nextjs-ui-designer` ориентирован на Next.js, для FloorCalc Web SPA используй скилл `frontend-aesthetics` или прямые правки в `src/components/design-system/` (стиль уже задан tokens.css + module.css per-component). Многие React/Vite-паттерны переносимы из Next.js-агентов, но SSR/Server Components здесь не применимы.
- **Создать нового агента** — `meta-agent-v3` (НЕ редактируй существующие, см. описание агента).
- **Создать новый скилл** — `skill-builder-v2`.
- **Тесты для domain** — `test-writer` агент (Vitest). НЕ `tester-bot` (Jest не настроен).
- **Web build / Vite / GitHub Pages deploy** — нет специализированного агента; делегируй `bug-fixer` или `problem-investigator` для диагностики, патчи пиши напрямую. Изменения в `vite.config.ts`, `index.html`, `.github/workflows/deploy-pages.yml` критичны — обязательно прогоняй `npm run build` локально и проверяй результат deploy-pages workflow после push в `main` (`gh run list --workflow=deploy-pages.yml`).

## Session completion (push policy)

Default workflow по завершении сессии (см. `AGENTS.md` — «Landing the Plane»): file follow-up issues → run quality gates → update issue status → `git pull --rebase && bd sync` → push → cleanup → handoff.

В FloorCalc remote настроен (`origin` → GitHub), `bd sync` локальный (sync-branch не задан, beads в `.gitignore`). Но **auto-push НЕ безусловно разрешён**:

- Push в `main` теперь напрямую триггерит `deploy-pages.yml` → деплой свежей сборки на GitHub Pages. Это уже не «обычный коммит без последствий», а релевантное публикационное действие. Перед `git push` особенно для крупных изменений — спроси пользователя или подтверди намерение.
- Тег `v*` отдельного CI-trigger не имеет (старый `release.yml` удалён). Тег создаётся `/push` для трекинга версий, но публикация привязана к ветке `main`, а не к тегу.
- В сомнительных случаях — спроси пользователя перед `git push`.

## What's gitignored vs committed (быстрая шпаргалка)

**Закоммичено**: исходники (`src/`, `tests/`, `public/`), конфиги (`tsconfig.json`, `tsconfig.web.json`, `tsconfig.node.json`, `vite.config.ts`, `vitest.config.ts`, `knip.json`, `package.json`, `package-lock.json`), SPA-root (`index.html`), CI (`.github/workflows/deploy-pages.yml`), документация (`README.md`, `DESIGN.md`, `CHANGELOG.md`, `RELEASE_NOTES.md`, `CLAUDE.md`, `AGENTS.md`), ресурсы (`resources/`), плагины Claude (`.claude/` кроме исключений ниже).

**В `.gitignore`** (НЕ коммитится): `node_modules/`, `out/`, `release/`, `dist/`, `*.tsbuildinfo`, `coverage/`, `.tmp/`, `release-notes-current.md`, `*.log`, `.env*` (кроме `.env.example`), `.beads/`, `reports/`, `claude-code-orchestrator-kit/`, `release-test/`, `release-new/`, `.DS_Store`, `Thumbs.db`, `.claude/anytype-sync-queue.txt`, `.claude/hooks/__pycache__/`, `.claude/hooks/beads-sync-trigger.log`, `.claude/worktrees/`, `docs/plans/agile-prancing-pnueli.md`.
