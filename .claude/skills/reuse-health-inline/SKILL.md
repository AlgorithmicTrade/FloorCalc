---
name: reuse-health-inline
description: Inline orchestration workflow for code duplication detection and consolidation with Beads integration. Provides step-by-step phases for reuse-hunter detection, priority-based consolidation with reuse-fixer, and verification cycles. SKIP: для проектов <500 LOC (overhead дедупликации > выгода); для bootstrapping-фазы проекта; если jscpd / similar tool не установлен и нет возможности установить
---

## Outcome

**Goal**: все обнаруженные дубликаты с similarity > 80% либо вынесены в shared utilities, либо помечены как intentional с обоснованием

**Success criteria**:
- reuse-fixes-implemented.md содержит список консолидаций с before/after
- type-check + build проходят после рефакторинга
- Intentional Duplications Documented список заполнен с reason

**Stop rules**:
- Достигнут max iterations workflow
- Quality gate (type-check / build) не прошёл и rollback применён
- Пользователь явно остановил выполнение

**Project Stack Discovery (Phase 0)**: перед началом workflow прочитать `package.json` (deps + scripts + name), lock-файл (package-manager), `CLAUDE.md` (Active Technologies), `.mcp.json` (доступные MCP). Использовать выявленный package_manager (npm/pnpm/yarn/bun) для type-check/build, не хардкодить `pnpm`. Stack-specific MCP-вызовы (`mcp__supabase__*`, `mcp__context7__*` и т.п.) применять только при наличии в `.mcp.json`; иначе skip с пометкой в отчёте.

# Code Reuse Health Check (Inline Orchestration)

You ARE the orchestrator. Execute this workflow directly without spawning a separate orchestrator agent.

## Workflow Overview

```
Beads Init → Detection → Create Issues → Consolidate by Priority → Close Issues → Verify → Beads Complete
```

**Max iterations**: 3
**Priorities**: high → medium → low
**Beads integration**: Automatic issue tracking

---

## Phase 1: Pre-flight & Beads Init

1. **Setup directories**:
   ```bash
   mkdir -p .tmp/current/{plans,changes,backups} reports
   ```

2. **Validate environment**:
   ```bash
   node -e "const s=require('./package.json').scripts||{}; console.log(Object.keys(s).join(' '))"
   ```
   - If `type-check` missing → use `build:main` as TypeScript check fallback
   - If `build` missing → report and exit

3. **Create Beads wisp**:
   ```bash
   bd mol wisp exploration --var "question=Code duplication scan and consolidation"
   ```

   **IMPORTANT**: Save the wisp ID (e.g., `<bd-prefix>-xxx`) for later use.

4. **Initialize TodoWrite**:
   ```json
   [
     {"content": "Duplication detection", "status": "in_progress", "activeForm": "Detecting duplications"},
     {"content": "Create Beads issues", "status": "pending", "activeForm": "Creating issues"},
     {"content": "Consolidate high priority duplications", "status": "pending", "activeForm": "Consolidating high priority"},
     {"content": "Consolidate medium priority duplications", "status": "pending", "activeForm": "Consolidating medium priority"},
     {"content": "Consolidate low priority duplications", "status": "pending", "activeForm": "Consolidating low priority"},
     {"content": "Verification scan", "status": "pending", "activeForm": "Verifying consolidation"},
     {"content": "Complete Beads wisp", "status": "pending", "activeForm": "Completing wisp"}
   ]
   ```

---

## Phase 2: Detection (Batched, Sequential — Prevent Context Overflow)

**CRITICAL**: Do NOT invoke reuse-hunter on the entire codebase at once. Split into 4 sequential batches by directory scope. Each batch writes to its own report file. After all batches complete, merge into a single report.

### Batch Split Strategy

Run **4 sequential** reuse-hunter agents via Agent tool — invoke each batch one-by-one and **wait for it to complete** before invoking the next (do NOT use `run_in_background: true`, do NOT call multiple agents in a single message). Sequential execution preserves rate limits.

**Batch 1** — Adapters + Managers:
```
subagent_type: "reuse-hunter"
description: "Scan adapters+managers for dupes"
prompt: |
  Scan ONLY these directories for code duplications:
  - electron/engine/arbitrage/adapters/
  - electron/engine/arbitrage/managers/

  CONTEXT OVERFLOW PROTECTION:
  - Do NOT read entire files. Use Grep to find patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - Maximum 30 files per scan session.
  - If a file is >500 lines, search for keywords only.

  WHAT TO LOOK FOR:
  1. Duplicated TypeScript interfaces/types — Grep for "export interface", "export type", "export enum"
  2. Duplicated constants — Grep for "export const"
  3. Similar method implementations across adapters (same parsing, WS handling)
  4. Copy-pasted code blocks between exchange adapters (OKX, Bybit, Gate, MEXC, Bitget)

  METHOD: Glob → Grep patterns → read ONLY matching lines ±10 context → compare across files.

  Write findings to: reports/reuse-hunting-adapters-managers.md
  IMPORTANT: Write the report in Russian.
  Return: count of duplications found per priority (high/medium/low).
```

**Batch 2** — Execution:
```
subagent_type: "reuse-hunter"
description: "Scan execution layer for dupes"
prompt: |
  Scan ONLY this directory for code duplications:
  - electron/engine/arbitrage/execution/

  CONTEXT OVERFLOW PROTECTION:
  - Do NOT read entire files. Use Grep to find patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - Maximum 30 files per scan session.
  - If a file is >500 lines, search for keywords only.

  WHAT TO LOOK FOR:
  1. Duplicated TypeScript interfaces/types
  2. Duplicated constants
  3. Similar method implementations across execution managers
  4. Copy-pasted error handling, logging, or event patterns

  METHOD: Glob → Grep patterns → read ONLY matching lines ±10 context → compare across files.

  Write findings to: reports/reuse-hunting-execution.md
  IMPORTANT: Write the report in Russian.
  Return: count of duplications found per priority (high/medium/low).
```

**Batch 3** — Database + IPC + Types + Config:
```
subagent_type: "reuse-hunter"
description: "Scan database+ipc+types for dupes"
prompt: |
  Scan ONLY these directories for code duplications:
  - electron/database/
  - electron/ipc/
  - electron/types/
  - electron/config/

  CONTEXT OVERFLOW PROTECTION:
  - Do NOT read entire files. Use Grep to find patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - Maximum 30 files per scan session.
  - If a file is >500 lines, search for keywords only.

  WHAT TO LOOK FOR:
  1. Duplicated TypeScript interfaces/types
  2. Duplicated constants and configuration objects
  3. Similar utility functions, query patterns
  4. Duplicated IPC handler patterns

  METHOD: Glob → Grep patterns → read ONLY matching lines ±10 context → compare across files.

  Write findings to: reports/reuse-hunting-database-ipc.md
  IMPORTANT: Write the report in Russian.
  Return: count of duplications found per priority (high/medium/low).
```

**Batch 4** — UI Layer:
```
subagent_type: "reuse-hunter"
description: "Scan UI layer for dupes"
prompt: |
  Scan ONLY this directory for code duplications:
  - ui/

  CONTEXT OVERFLOW PROTECTION:
  - Do NOT read entire files. Use Grep to find patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - Maximum 30 files per scan session.
  - If a file is >500 lines, search for keywords only.

  WHAT TO LOOK FOR:
  1. Duplicated TypeScript interfaces/types
  2. Duplicated constants
  3. Similar React component patterns (hooks, components)
  4. Duplicated types between ui/ and electron/ (cross-layer)

  METHOD: Glob → Grep patterns → read ONLY matching lines ±10 context → compare across files.
  Also Grep electron/types/ for types that are re-declared in ui/types/.

  Write findings to: reports/reuse-hunting-ui.md
  IMPORTANT: Write the report in Russian.
  Return: count of duplications found per priority (high/medium/low).
```

### After ALL sequential batches return (each finished one-by-one):

1. Read all 4 partial reports:
   - `reports/reuse-hunting-adapters-managers.md`
   - `reports/reuse-hunting-execution.md`
   - `reports/reuse-hunting-database-ipc.md`
   - `reports/reuse-hunting-ui.md`
2. **Merge into single report**: `reports/reuse-hunting-report.md`
   - Combine all findings, deduplicate cross-batch items
   - Recalculate totals by priority
   - Add cross-layer duplications (items found in multiple batches)
3. Parse duplication counts by priority
4. If zero duplications → skip to Phase 7 (Final Summary)
5. Update TodoWrite: mark detection complete

---

## Phase 3: Create Beads Issues

**ДЕДУПЛИКАЦИЯ (ОБЯЗАТЕЛЬНО перед каждым `bd create`)**:
1. Перед созданием задачи искать существующие открытые задачи:
   ```bash
   bd search "{type_name or item_name}" --status open
   ```
2. Если найдена открытая задача с тем же дублированием → **НЕ создавать дубль**, использовать существующий ID в маппинге
3. Создавать новую задачу **только если дубль не найден**

**For each duplication found** (после проверки дедупликации), create a Beads issue:

```bash
# High - types/schemas duplicated across packages (P2)
bd create "REUSE: {type_name} duplicated in {locations}" -t chore -p 2 -d "{description}" \
  --deps discovered-from:{wisp_id}

# Medium - constants/configs duplicated (P3)
bd create "REUSE: {const_name} duplicated" -t chore -p 3 -d "{description}" \
  --deps discovered-from:{wisp_id}

# Low - utility functions, minor duplications (P4)
bd create "REUSE: {item_name} can be consolidated" -t chore -p 4 -d "{description}" \
  --deps discovered-from:{wisp_id}
```

**Track issue IDs** in a mapping for later closure (включая переиспользованные существующие ID).

Update TodoWrite: mark "Create Beads issues" complete.

---

## Phase 4: Quality Gate (Pre-consolidation)

Run inline validation:

```bash
pnpm type-check
pnpm build
```

- If both pass → proceed to consolidation
- If fail → report to user, exit

---

## Phase 5: Consolidation Loop

**For each priority** (high → medium → low):

1. **Check if duplications exist** for this priority
   - If zero → skip to next priority

2. **Update TodoWrite**: mark current priority in_progress

3. **Claim issues in Beads**:
   ```bash
   bd update {issue_id} --status in_progress
   ```

4. **Invoke reuse-fixer** via Task tool:
   ```
   subagent_type: "reuse-fixer"
   description: "Consolidate {priority} duplications"
   prompt: |
     Read reports/reuse-hunting-report.md and consolidate all {priority} priority duplications.

     For each duplication:
     1. Backup files before editing
     2. Determine canonical location (usually shared-types or shared package)
     3. Create/update canonical file with the type/schema/constant
     4. Replace duplicates with imports/re-exports
     5. Log change to .tmp/current/changes/reuse-changes.json

     Generate/update: reports/reuse-consolidation-implemented.md

     IMPORTANT: Write the entire report in Russian language.

     Return: count of consolidated items, count of failed consolidations, list of consolidated item IDs.
   ```

5. **Quality Gate** (inline):
   ```bash
   pnpm type-check
   pnpm build
   ```

   - If FAIL → report error, suggest rollback, exit
   - If PASS → continue

6. **Close consolidated issues in Beads**:
   ```bash
   bd close {issue_id_1} {issue_id_2} ... --reason "Consolidated to shared-types"
   ```

7. **Update TodoWrite**: mark priority complete

8. **Repeat** for next priority

---

## Phase 6: Verification

After all priorities consolidated:

1. **Update TodoWrite**: mark verification in_progress

2. **Invoke reuse-hunter in batches** (same 4 batches as Phase 2, but in verification mode, sequentially):

   Run **4 sequential** agents — invoke each batch one-by-one and **wait for it to complete** before invoking the next (do NOT use `run_in_background: true`, do NOT call multiple agents in a single message). Add to each prompt:
   ```
   VERIFICATION MODE: Re-scan after consolidation.
   Compare with previous report at reports/reuse-hunting-report.md.
   Focus on:
   - Whether previously found duplications were resolved
   - Any NEW duplications introduced by consolidation
   - Remaining unresolved duplications

   Write to: reports/reuse-verify-{batch-name}.md
   ```

3. **Merge verification results** into summary:
   - Duplications resolved (count)
   - Duplications remaining (count)
   - New duplications introduced (count)

4. **Decision**:
   - If duplications_remaining == 0 → Phase 7
   - If iteration < 3 AND duplications_remaining > 0 → Go to Phase 2
   - If iteration >= 3 → Phase 7 with remaining items

---

## Phase 7: Final Summary & Beads Complete

1. **Complete Beads wisp**:
   ```bash
   # If all consolidated
   bd mol squash {wisp_id}

   # If nothing found
   bd mol burn {wisp_id}
   ```

2. **Обработка нерешённых дублирований** (если есть):
   - Проверить маппинг из Phase 3 — если задача ещё открыта → **НЕ создавать "REMAINING" дубль**
   - Если задача была закрыта, но дублирование вернулось → переоткрыть:
     ```bash
     bd update {issue_id} --status open -d "Не консолидировано. Требует архитектурного решения. См. reuse-hunting-report.md"
     ```
   - Создавать новую задачу **ТОЛЬКО** если в маппинге нет ID для этого дублирования:
     ```bash
     bd create "REUSE REMAINING: {item_name}" -t chore -p {priority} \
       -d "Not consolidated. May require architectural decision. See reuse-hunting-report.md"
     ```

3. **Generate summary for user**:

```markdown
## Проверка здоровья: Повторное использование кода — Завершено

**Wisp ID**: {wisp_id}
**Итераций**: {count}/3
**Статус**: {УСПЕХ/ЧАСТИЧНЫЙ}

### Результаты
- Обнаружено: {total} дублирований
- Устранено: {consolidated} ({percentage}%)
- Осталось: {remaining}

### По приоритетам
- Высокие: {consolidated}/{total}
- Средние: {consolidated}/{total}
- Низкие: {consolidated}/{total}

### Задачи Beads
- Создано: {count}
- Закрыто: {count}
- Осталось: {count}

### Валидация
- Type Check: {status}
- Build: {status}

### Артефакты
- Обнаружение: `reports/reuse-hunting-report.md`
- Консолидация: `reports/reuse-consolidation-implemented.md`
```

4. **Update TodoWrite**: mark wisp complete

5. **Record metrics** (ОБЯЗАТЕЛЬНО — НЕ ПРОПУСКАТЬ):

   **Источники данных** (читать в указанном порядке):
   - `report_date` → из frontmatter `reports/reuse-hunting-report.md`, поле `generated` (дата текущего прогона)
   - `detection.*` → из frontmatter `reports/reuse-hunting-report.md` (`issues_found`, `high_count`, `medium_count`, `low_count`, `files_processed`)
   - `remediation.*` → из результатов Phase 5 (фактические данные текущего прогона: сколько консолидировано, сколько осталось, сколько файлов изменено)

   **ВАЖНО**: НЕ брать данные из `reports/reuse-consolidation-implemented.md` — этот файл может содержать данные предыдущих прогонов. Использовать только фактические результаты текущей сессии.

   Прочитать `.tmp/metrics/YYYY-MM.json` (текущий месяц). Если не существует — создать структуру из шаблона `/record-metrics`.
   Обновить (или добавить) секцию `categories.reuse` данными текущего прогона:
   ```json
   "reuse": {
     "report_date": "YYYY-MM-DD",
     "detection": { "total_found": N, "high": N, "medium": N, "low": N, "files_scanned": N },
     "remediation": { "consolidated": N, "skipped_intentional": N, "remaining": N, "failed": N, "files_modified": N, "files_created": N, "fix_rate_percent": N }
   }
   ```
   Пересчитать `summary`, `health_scores` (fix_rate >=90%→HEALTHY, >=70%→NEEDS_ATTENTION, <70%→CRITICAL), `severity_distribution`.
   Записать файл через Write tool. **Если этот шаг не выполнен — workflow считается НЕЗАВЕРШЁННЫМ.**

6. **SESSION CLOSE PROTOCOL**:
   ```bash
   git status
   git add .
   bd sync
   git commit -m "refactor: consolidate {consolidated} duplications ({wisp_id})"
   bd sync
   git push
   ```

---

## Error Handling

**If quality gate fails**:
```
Rollback available: .tmp/current/changes/reuse-changes.json

To rollback:
1. Read changes log
2. Restore files from .tmp/current/backups/
3. Re-run workflow
```

**If worker fails**:
- Report error to user
- Keep Beads wisp open for manual completion
- Suggest manual intervention
- Exit workflow

**If Beads command fails**:
- Log error but continue workflow
- Beads tracking is enhancement, not blocker

---

## Duplication Categories

**Types/Interfaces** (shared-types):
- Database types
- API types
- Zod schemas
- Common enums

**Constants** (shared-types):
- Configuration objects
- MIME types, file limits
- Feature flags

**Utilities** (shared package or re-export):
- Helper functions
- Validation utilities
- Formatters

**Single Source of Truth Pattern**:
1. Canonical location: `packages/shared-types/src/`
2. Other packages: `export * from '@package/shared-types/{module}'`
3. NEVER copy code between packages

---

## Quick Reference

| Phase | Beads Action |
|-------|--------------|
| 1. Pre-flight | `bd mol wisp exploration` |
| 3. After detection | `bd create` for each item |
| 5. Before consolidation | `bd update --status in_progress` |
| 5. After consolidation | `bd close --reason "Consolidated"` |
| 7. Complete | `bd mol squash/burn` |
| 7. Remaining | `bd create` for unconsolidated items |
