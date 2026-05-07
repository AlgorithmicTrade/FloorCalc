# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Status

**FloorCalc — workspace на стадии bootstrap.** В корне ещё НЕТ исходного кода приложения и НЕТ git-репозитория (`G:\Project-X\FloorCalc\` не инициализирован). Содержимое сейчас:

- `.claude/` — рабочая конфигурация Claude Code для будущего проекта (агенты, скиллы, команды, hooks, schemas, scripts).
- `claude-code-orchestrator-kit/` — upstream npm-пакет (`claude-code-orchestrator-kit@0.19.3`), отдельный git-репозиторий внутри workspace. Используется как источник эталонных агентов / скиллов / команд и документации.

Перед любыми изменениями уточняй у пользователя, нужно ли инициализировать `git init` в корне или работать в подмодуле `claude-code-orchestrator-kit/`. Не запускай `git init` самостоятельно.

## Orchestrator Pattern (главное)

Claude в этом workspace работает как **оркестратор**, а не как одиночный исполнитель. Полный контракт описан в `claude-code-orchestrator-kit/CLAUDE.md`. Ключевые правила (применять без напоминания):

1. **Сначала контекст, потом действие** — читать связанные файлы, искать существующие паттерны, проверять commit history, прежде чем делегировать или писать код.
2. **Делегировать в субагенты** для всего нетривиального; прямое выполнение допустимо только для однострочных правок, единичной установки зависимости, тривиальной правки конфига.
3. **После делегирования — ВСЕГДА верификация:** прочитать изменённые файлы, прогнать type-check/build. Без этого задача не считается завершённой.
4. **Атомарность**: 1 задача = 1 вызов агента. Параллельные агенты — в одном tool-call message.
5. **Library-first**: перед написанием >20 строк нового кода ищи существующую библиотеку (WebSearch + проверка bundlephobia / weekly downloads / activity).

## Common Commands

Все команды — slash-commands из `.claude/commands/`. Запускать через UI Claude Code (`/имя`), не через Bash.

### Development workflow

| Команда | Назначение |
|---------|-----------|
| `/commit [patch\|minor\|major]` | СТРОГО ДВУХШАГОВО: (1) сформировать commit message по проектному формату → (2) вызвать `/push` для релиза. Шаг 2 не запускать до полного вывода message в Шаге 1. |
| `/push [patch\|minor\|major] [-m "msg"]` | Релизный скрипт `.claude/scripts/release.sh`: bump версии, dual changelog (`CHANGELOG.md` + `RELEASE_NOTES.md`), git tag, push. |
| `/worktree` | Управление git worktrees (create/remove/list/cleanup). |

### Health workflows (inline orchestration)

Каждая команда — это «inline» скилл: главный Claude САМ оркестрирует, не спавнит отдельного orchestrator-агента.

| Команда | Workers | Назначение |
|---------|---------|-----------|
| `/health-bugs` | bug-hunter, bug-fixer | Detect → fix by priority → verify (3 итерации). Quality gate: `pnpm type-check && pnpm build`. |
| `/health-security` | security-scanner, vulnerability-fixer | Уязвимости и их fix. |
| `/health-cleanup` | dead-code-hunter, dead-code-remover | Knip-driven dead code removal. |
| `/health-deps` | dependency-auditor, dependency-updater | Аудит и обновление пакетов. |
| `/health-reuse` | reuse-hunter, reuse-fixer | Дедупликация (Single Source of Truth). |
| `/health-metrics` | — | Сводный отчёт по всем health-скиллам. |
| `/record-metrics` | — | Сбор метрик в `.tmp/metrics/YYYY-MM.json`. |

### SpecKit (планирование больших фич)

`/speckit.specify` → `/speckit.clarify` → `/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`.
Для интеграции с Beads: `/speckit.tobeads` (импорт tasks как Beads issues), `/speckit.taskstoissues` (в GitHub Issues).

### Beads (issue tracking)

Beads ещё не инициализирован в корне (`.beads/` отсутствует). Запустить `/beads-init` перед использованием.

После init — стандартный flow:
```bash
bd ready                           # найти готовую задачу
bd update <id> --status in_progress
bd close <id> --reason "Done"
bd sync                            # синхронизировать с git
```

### Synchronization

- `/anytype [task-id...]` — синхронизация открытых Beads-задач в Anytype space FundingBot через агента `anytype-beads-sync`.
  - Без аргументов — инкрементальная синхронизация по watermark `(updated_at, closed_at, status)`.
  - С ID — force-update указанных задач без проверки watermark.
  - Mapping-файл: `G:\Project-X\FundingBot\.claude\anytype-beads-mapping.json` (внешний, не в этом workspace).
  - В Anytype синхронизируются ТОЛЬКО `open` задачи; `closed` — удаляются.

### Misc

| Команда | Назначение |
|---------|-----------|
| `/process-logs` | Обработка error-логов из admin panel БД: fetch → analyze → create tasks → fix → mark resolved. |
| `/ultra-think` | Глубокий анализ через multi-dimensional thinking. |
| `/translate-doc` | Перевод документации EN → RU. |
| `/supabase-performance-optimizer` | Делегирование оптимизации Supabase профильным агентам. |

## High-level Architecture

### `.claude/` структура

```
.claude/
├── agents/                # 39 субагентов по доменам
│   ├── business/workers/         # lead-research-assistant
│   ├── database/workers/         # api-builder, database-architect, supabase-* (auditor/fixer/realtime-/storage-)
│   ├── development/workers/      # code-reviewer, typescript-types-specialist, langgraph-, llm-service-, judge-, stage-pipeline-, cost-calculator-, skill-builder-v2, utility-builder, code-structure-refactorer
│   ├── documentation/workers/    # technical-writer
│   ├── frontend/workers/         # fullstack-nextjs-, nextjs-ui-designer, visual-effects-creator
│   ├── health/workers/           # bug-hunter/-fixer, dead-code-hunter/-remover, dependency-auditor/-updater, reuse-hunter/-fixer, security-scanner, vulnerability-fixer
│   ├── infrastructure/workers/   # bullmq-, deployment-engineer, qdrant-, rag-, quality-validator-, orchestration-logic-, server-hardening-, infrastructure-specialist
│   ├── integrations/workers/     # lms-integration-specialist
│   ├── meta/workers/             # meta-agent-v3 (создаёт новых агентов)
│   ├── research/workers/         # problem-investigator, research-specialist
│   └── testing/workers/          # accessibility-, integration-, mobile-(responsiveness/fixes)-, performance-optimizer, test-writer (Vitest), tester-bot (Jest)
├── skills/                # 40+ переиспользуемых скиллов (SKILL.md в каждой папке)
├── commands/              # 26+ slash-команд (выше)
├── hooks/
│   └── beads-sync-trigger.py    # PostToolUse hook: ловит мутирующие `bd` Bash-вызовы, складывает FundingBot-* IDs в .claude/anytype-sync-queue.txt и через hookSpecificOutput напоминает оркестратору вызвать anytype-beads-sync только для этих ID. READ-ONLY относительно Beads.
├── schemas/               # JSON schemas для orchestrator plan-файлов
│   ├── base-plan.schema.json
│   ├── bug-plan.schema.json
│   ├── dead-code-plan.schema.json
│   ├── dependency-plan.schema.json
│   └── security-plan.schema.json
├── scripts/
│   ├── release.sh                # release automation (используется /push)
│   └── gates/                    # check-bundle-size.sh, check-coverage.sh, check-security.sh
├── tasks/                 # архивные task-файлы (open-orders-adapters-migration, private-api-centralization)
├── docs/                  # beads-quickstart.{md,en.md}
├── rules/                 # проектные правила (см. ниже)
├── settings.json          # ENABLE_TOOL_SEARCH=auto:5, plansDirectory=./docs/plans, plugins: voltagent-{dev-exp,qa-sec}@voltagent-subagents
├── statusline.ps1         # PowerShell статус-бар для Claude Code
└── worktrees/             # для git worktree workflow
```

### Test runner selection

- **Vitest проект** → используй `test-writer` агента.
- **Jest проект** → используй `tester-bot` агента + скилл `/test-step` (запускается в конце development-step, собирает diff в `electron/engine/` и пишет тесты в `tests/execution/`).
- E2E/browser → `webapp-testing` (Playwright) или `playwright-runner`.
- Не миксуй — выбор по `devDependencies` в `package.json`.

### `claude-code-orchestrator-kit/` (upstream)

Отдельный git-репозиторий, используется как:
- Источник эталонных агентов/скиллов/команд (прежде чем создавать новый — проверяй upstream).
- Полная документация: `docs/ARCHITECTURE.md`, `docs/COMMANDS-GUIDE.md`, `docs/TUTORIAL-CUSTOM-AGENTS.md`, `docs/USE-CASES.md`, `docs/Agents Ecosystem/AGENT-ORCHESTRATION.md`.
- `prompts/` — `setup-error-logging.md`, `setup-health-workflows.md`.
- `.specify/` — SpecKit memory + templates.
- `.mcp.json` — пример конфигурации (context7, sequential-thinking, supabase, playwright, shadcn, serena).

Для самого workspace-уровня MCP не настроен в `G:\Project-X\FloorCalc\.claude\settings.json` — только `ENABLE_TOOL_SEARCH=auto:5` (включает Tool Search при >5 включенных серверов) и плагины `voltagent-dev-exp` / `voltagent-qa-sec`.

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

- `<type>` ∈ `feat | fix | refactor | perf | chore | docs | test`. `<scope>` — английский (Database, WS, Funding, Arbitrage, AdapterGate, Core).
- Если для секции нет содержания — поставь `—`, НЕ оставляй плейсхолдеры в `<>`.
- Маркеры списка только `-`. Никаких упоминаний AI/диалога/«этот чат».

### `quality.md` (data integrity — КРИТИЧНО)

- **Никаких mocks/stubs/fake data.** Только реальные реализации.
- Любое утверждение «бага/утечки/дубликата нет» должно ссылаться на конкретные файлы и строки прочитанного кода. Гипотезы без чтения — помечай `unverified`.
- При невозможности прочитать файл целиком — НЕ давай выводов, верни `Insufficient data: <чего не хватило>` и продолжи через grep + чтение нужных диапазонов.
- `git diff` НЕ заменяет чтение текущего состояния файла.
- Для тестов используй готовый скилл `/test-step`.

### `security.md`

- Все секреты (API keys, credentials, tokens) — ТОЛЬКО через `SecureStorageService` (`electron.safeStorage`). Запись на диск/в БД/в логи запрещена.
- Fallback в non-Electron средах (CI, headless tests, build scripts) — env vars без записи на диск.
- Запрещено: hardcoded keys, `console.log`/`safeLog.error` с `headers`/`body`, `git add .env`, секреты в SQLite, OAuth response в логах.

### `workflow.md`

- Перед созданием нового файла — проверь, можно ли расширить существующий. Создавай новый, только если подходящего места нет.
- Если файл слишком большой для разового чтения — НЕ делай вывод «не могу прочитать». Используй Grep/Glob, читай нужные диапазоны фрагментами.
- При ошибке чтения через `@codebase` — формулируй как «чтение не удалось (ошибка/таймаут)», предложи альтернативу (поиск или чтение фрагментами), а не «слишком большой/нет доступа».
- Все ссылки на код — точные (`file:function`/`file:line`) на основании реально прочитанного.

### `logging.md`

- Не добавляй избыточных логов. Временные debug-логи удаляй перед финальным apply.

### `preference.md`

- Всегда отвечай по-русски (orthography строгая: ё, ä, ü, é и т.д. — никаких ASCII-замен).

## File organization conventions

- Агенты: `.claude/agents/{domain}/workers/<name>.md`.
- Скиллы: `.claude/skills/<skill-name>/SKILL.md`.
- Команды: `.claude/commands/<name>.md`.
- Временные артефакты: `.tmp/current/` (gitignored).
- Отчёты: `docs/reports/{domain}/{YYYY-MM}/`.
- Plan-файлы оркестратора: `./docs/plans/` (см. `settings.json:plansDirectory`).

## When delegating: agent selection cheat sheet

- Bug в коде → `/health-bugs` (или `bug-hunter` → `bug-fixer` напрямую).
- Уязвимость → `/health-security`.
- Dead code → `/health-cleanup` (требует Knip — используй скилл `setup-knip`).
- TS-ошибки после правок → re-delegate тому же агенту ИЛИ `typescript-types-specialist`.
- Крупный рефакторинг — НЕ напрямую, через `code-structure-refactorer`.
- Архитектурные решения (>1 компонент) — через скилл `senior-architect`.
- Performance — `performance-optimizer`.
- Глубокая диагностика бага — `problem-investigator` (root cause analysis с execution trace).
- UI design — `nextjs-ui-designer` (для Next.js) или скилл `frontend-aesthetics`.
- Создать нового агента — `meta-agent-v3` (НЕ редактируй существующие, см. описание агента).
- Создать новый скилл — `skill-builder-v2`.

## Session completion (push policy)

Default workflow по завершении сессии: file follow-up issues → run quality gates → update issue status → `git pull --rebase && bd sync` → push (если разрешено) → cleanup → handoff.

**Push policy в этом workspace пока не задана** (нет `feedback_no_auto_commits`-маркера). По умолчанию upstream-инструкция трактует это как «auto-push разрешён», НО учитывая что в корне нет git-репозитория, автоматический push невозможен. Перед любым `git push` уточни у пользователя, в каком репозитории работаем.
