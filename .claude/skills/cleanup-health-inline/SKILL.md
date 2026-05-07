---
name: cleanup-health-inline
description: Inline orchestration workflow for dead code detection and removal with Beads integration. Provides step-by-step phases for dead-code-hunter detection, priority-based cleanup with dead-code-remover, and verification cycles. SKIP: для не-JS/TS проектов (Knip — JS-tool); для проектов <500 LOC; если у проекта нет билд-системы (нечего проверять на dead code)
---

## Outcome

**Goal**: все обнаруженные dead-code элементы либо удалены, либо явно помечены как намеренные (intentional); type-check + build проходят после удаления

**Success criteria**:
- Knip найденные unused exports/files удалены или задокументированы
- dead-code-cleanup-summary.md перечисляет удалённое с rollback-инструкциями
- dead-code-verification-report.md показывает 0 регрессий

**Stop rules**:
- Достигнут max iterations workflow
- Quality gate (type-check / build) не прошёл и rollback применён
- Пользователь явно остановил выполнение

**Project Stack Discovery (Phase 0)**: перед началом workflow прочитать `package.json` (deps + scripts + name), lock-файл (package-manager), `CLAUDE.md` (Active Technologies), `.mcp.json` (доступные MCP). Использовать выявленный package_manager (npm/pnpm/yarn/bun) для type-check/build, не хардкодить `pnpm`. Stack-specific MCP-вызовы (`mcp__supabase__*`, `mcp__context7__*` и т.п.) применять только при наличии в `.mcp.json`; иначе skip с пометкой в отчёте.

# Cleanup Health Check (Inline Orchestration)

You ARE the orchestrator. Execute this workflow directly without spawning a separate orchestrator agent.

## Workflow Overview

```
Beads Init → Detection → Create Issues → Remove by Priority → Close Issues → Verify → Beads Complete
```

**Max iterations**: 3
**Priorities**: critical → high → medium → low
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
   bd mol wisp exploration --var "question=Dead code cleanup scan"
   ```

   **IMPORTANT**: Save the wisp ID (e.g., `<bd-prefix>-xxx`) for later use.

4. **Initialize TodoWrite**:
   ```json
   [
     {"content": "Dead code detection", "status": "in_progress", "activeForm": "Detecting dead code"},
     {"content": "Create Beads issues", "status": "pending", "activeForm": "Creating issues"},
     {"content": "Remove critical dead code", "status": "pending", "activeForm": "Removing critical dead code"},
     {"content": "Remove high priority dead code", "status": "pending", "activeForm": "Removing high dead code"},
     {"content": "Remove medium priority dead code", "status": "pending", "activeForm": "Removing medium dead code"},
     {"content": "Remove low priority dead code", "status": "pending", "activeForm": "Removing low dead code"},
     {"content": "Verification scan", "status": "pending", "activeForm": "Verifying cleanup"},
     {"content": "Complete Beads wisp", "status": "pending", "activeForm": "Completing wisp"}
   ]
   ```

---

## Phase 2: Detection (Batched, Sequential)

**IMPORTANT**: Do NOT invoke a single scanner on the entire codebase — it will overflow context.
Split into 4 sequential scanners by directory, each with strict context protection.

**Run 4 sequential dead-code-hunter agents** via Agent tool — invoke each batch one-by-one and **wait for it to complete** before invoking the next (do NOT use `run_in_background: true`, do NOT call multiple agents in a single message). Sequential execution preserves rate limits.

### Batch 1: Engine Adapters & Managers
```
subagent_type: "dead-code-hunter"
description: "Scan engine adapters+managers"
prompt: |
  Scan {project}/electron/engine/arbitrage/adapters/ and {project}/electron/engine/arbitrage/managers/ for dead code.

  CONTEXT OVERFLOW PROTECTION — MANDATORY:
  - Do NOT read entire files. Use Grep to find specific patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - If a file is >500 lines, search for keywords only.
  - Maximum 25 files per scan.
  - Write findings incrementally to the report file after each file.
  - If approaching limits, stop scanning and report what was found so far.

  SCAN METHOD — Pattern-based ONLY:
  1. Run `npx knip --include files,exports,dependencies --no-progress 2>&1 | head -200` to get Knip results for this area
  2. Grep for commented-out code blocks (lines starting with //)
  3. Grep for debug statements: console.log, console.debug, debugger
  4. Grep for unused imports: import statements, then check if imported names are used
  5. For each match, read ONLY ±5 lines context to confirm it's dead code

  Categorize by priority:
  - critical: unused exports that break tree-shaking, entire unused files
  - high: unused functions/methods, unused variables
  - medium: commented-out code blocks (>3 lines)
  - low: debug console.log statements, single-line comments

  Write results to: reports/dead-code-part1-engine-adapters.md
  IMPORTANT: Write the entire report in Russian language.
  Return: count of dead code items per priority (critical/high/medium/low).
```

### Batch 2: Engine Execution & Logics
```
subagent_type: "dead-code-hunter"
description: "Scan engine execution+logics"
prompt: |
  Scan {project}/electron/engine/arbitrage/execution/ and {project}/electron/engine/arbitrage/logics/ for dead code.

  CONTEXT OVERFLOW PROTECTION — MANDATORY:
  - Do NOT read entire files. Use Grep to find specific patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - If a file is >500 lines, search for keywords only.
  - Maximum 25 files per scan.
  - Write findings incrementally to the report file after each file.
  - If approaching limits, stop scanning and report what was found so far.

  SCAN METHOD — Pattern-based ONLY:
  1. Run `npx knip --include files,exports,dependencies --no-progress 2>&1 | head -200` to get Knip results for this area
  2. Grep for commented-out code blocks (lines starting with //)
  3. Grep for debug statements: console.log, console.debug, debugger
  4. Grep for unused imports: import statements, then check if imported names are used
  5. For each match, read ONLY ±5 lines context to confirm it's dead code

  Categorize by priority:
  - critical: unused exports that break tree-shaking, entire unused files
  - high: unused functions/methods, unused variables
  - medium: commented-out code blocks (>3 lines)
  - low: debug console.log statements, single-line comments

  Write results to: reports/dead-code-part2-engine-execution.md
  IMPORTANT: Write the entire report in Russian language.
  Return: count of dead code items per priority (critical/high/medium/low).
```

### Batch 3: Database, IPC & Root electron/
```
subagent_type: "dead-code-hunter"
description: "Scan database+IPC+electron root"
prompt: |
  Scan {project}/electron/database/, {project}/electron/ipc/, and other files directly in {project}/electron/ (not subdirectories already covered) for dead code.

  CONTEXT OVERFLOW PROTECTION — MANDATORY:
  - Do NOT read entire files. Use Grep to find specific patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - If a file is >500 lines, search for keywords only.
  - Maximum 25 files per scan.
  - Write findings incrementally to the report file after each file.
  - If approaching limits, stop scanning and report what was found so far.

  SCAN METHOD — Pattern-based ONLY:
  1. Run `npx knip --include files,exports,dependencies --no-progress 2>&1 | head -200` to get Knip results for this area
  2. Grep for commented-out code blocks (lines starting with //)
  3. Grep for debug statements: console.log, console.debug, debugger
  4. Grep for unused imports: import statements, then check if imported names are used
  5. For each match, read ONLY ±5 lines context to confirm it's dead code

  Categorize by priority:
  - critical: unused exports that break tree-shaking, entire unused files
  - high: unused functions/methods, unused variables
  - medium: commented-out code blocks (>3 lines)
  - low: debug console.log statements, single-line comments

  Write results to: reports/dead-code-part3-database-ipc.md
  IMPORTANT: Write the entire report in Russian language.
  Return: count of dead code items per priority (critical/high/medium/low).
```

### Batch 4: UI & Root Project Files
```
subagent_type: "dead-code-hunter"
description: "Scan UI+root configs"
prompt: |
  Scan {project}/ui/ and {project} root files (*.ts, *.js, *.json configs) for dead code.

  CONTEXT OVERFLOW PROTECTION — MANDATORY:
  - Do NOT read entire files. Use Grep to find specific patterns first.
  - Limit file reads to 200 lines max per file (use offset/limit).
  - If a file is >500 lines, search for keywords only.
  - Maximum 25 files per scan.
  - Write findings incrementally to the report file after each file.
  - If approaching limits, stop scanning and report what was found so far.

  SCAN METHOD — Pattern-based ONLY:
  1. Run `npx knip --include files,exports,dependencies --no-progress 2>&1 | head -200` to get Knip results for this area
  2. Grep for commented-out code blocks (lines starting with //)
  3. Grep for debug statements: console.log, console.debug, debugger
  4. Grep for unused React components: export function/const that aren't imported elsewhere
  5. Grep for unused dependencies in package.json
  6. For each match, read ONLY ±5 lines context to confirm it's dead code

  Categorize by priority:
  - critical: unused exports that break tree-shaking, entire unused files, unused dependencies
  - high: unused functions/methods, unused variables, unused React components
  - medium: commented-out code blocks (>3 lines)
  - low: debug console.log statements, single-line comments

  Write results to: reports/dead-code-part4-ui-root.md
  IMPORTANT: Write the entire report in Russian language.
  Return: count of dead code items per priority (critical/high/medium/low).
```

**After all 4 sequential scanners complete** (each finished one-by-one):
1. Read all 4 part reports
2. Deduplicate overlapping findings across reports
3. Create consolidated `reports/dead-code-report.md` with unified dead code list
4. Parse dead code counts by priority
5. If zero dead code → skip to Phase 7 (Final Summary)
6. Update TodoWrite: mark detection complete

---

## Phase 3: Create Beads Issues

**ДЕДУПЛИКАЦИЯ (ОБЯЗАТЕЛЬНО перед каждым `bd create`)**:
1. Перед созданием задачи искать существующие открытые задачи:
   ```bash
   bd search "{item_title_keywords}" --status open
   ```
2. Если найдена открытая задача с тем же элементом → **НЕ создавать дубль**, использовать существующий ID в маппинге
3. Создавать новую задачу **только если дубль не найден**

**For each dead code item found** (после проверки дедупликации), create a Beads issue:

```bash
# Critical (P1)
bd create "CLEANUP: {item_title}" -t chore -p 1 -d "{description}" \
  --deps discovered-from:{wisp_id}

# High (P2)
bd create "CLEANUP: {item_title}" -t chore -p 2 -d "{description}" \
  --deps discovered-from:{wisp_id}

# Medium (P3)
bd create "CLEANUP: {item_title}" -t chore -p 3 -d "{description}" \
  --deps discovered-from:{wisp_id}

# Low (P4)
bd create "CLEANUP: {item_title}" -t chore -p 4 -d "{description}" \
  --deps discovered-from:{wisp_id}
```

**Track issue IDs** in a mapping for later closure (включая переиспользованные существующие ID).

Update TodoWrite: mark "Create Beads issues" complete.

---

## Phase 4: Quality Gate (Pre-removal)

Run inline validation:

```bash
pnpm type-check
pnpm build
```

- If both pass → proceed to removal
- If fail → report to user, exit

---

## Phase 5: Removal Loop

**For each priority** (critical → high → medium → low):

1. **Check if dead code exists** for this priority
   - If zero → skip to next priority

2. **Update TodoWrite**: mark current priority in_progress

3. **Claim issues in Beads**:
   ```bash
   bd update {issue_id} --status in_progress
   ```

4. **Invoke dead-code-remover** via Task tool:
   ```
   subagent_type: "dead-code-remover"
   description: "Remove {priority} dead code"
   prompt: |
     Read reports/dead-code-report.md and remove all {priority} priority dead code.

     For each item:
     1. Backup file before editing
     2. Remove dead code
     3. Log change to .tmp/current/changes/cleanup-changes.json

     Generate/update: reports/dead-code-cleanup-summary.md

     IMPORTANT: Write the entire report in Russian language.

     Return: count of removed items, count of failed removals, list of removed item IDs.
   ```

5. **Quality Gate** (inline):
   ```bash
   pnpm type-check
   pnpm build
   ```

   - If FAIL → report error, suggest rollback, exit
   - If PASS → continue

6. **Close removed issues in Beads**:
   ```bash
   bd close {issue_id_1} {issue_id_2} ... --reason "Removed in cleanup"
   ```

7. **Update TodoWrite**: mark priority complete

8. **Repeat** for next priority

---

## Phase 6: Verification

After all priorities cleaned:

1. **Update TodoWrite**: mark verification in_progress

2. **Invoke dead-code-hunter** (verification mode) — **use same batched approach as Phase 2, sequentially**:

   Run 4 sequential dead-code-hunter agents with the same directory splits and CONTEXT OVERFLOW PROTECTION rules as Phase 2 — invoke each batch one-by-one and **wait for it to complete** before invoking the next (do NOT use `run_in_background: true`, do NOT call multiple agents in a single message). Add to each prompt:

   ```
   Additional context:
   - This is a VERIFICATION scan after cleanup.
   - Compare findings with previous reports/dead-code-report.md.
   - Write results to: reports/dead-code-verify-part{N}-{area}.md
   - Report: items removed (count), items remaining (count), new items introduced (count).
   ```

   After all 4 sequential agents complete, consolidate into verification summary.

3. **Decision**:
   - If dead_code_remaining == 0 → Phase 7
   - If iteration < 3 AND dead_code_remaining > 0 → Go to Phase 2
   - If iteration >= 3 → Phase 7 with remaining items

---

## Phase 7: Final Summary & Beads Complete

1. **Complete Beads wisp**:
   ```bash
   # If all cleaned
   bd mol squash {wisp_id}

   # If nothing found
   bd mol burn {wisp_id}
   ```

2. **Обработка нерешённых элементов** (если есть):
   - Проверить маппинг из Phase 3 — если задача ещё открыта → **НЕ создавать "REMAINING" дубль**
   - Если задача была закрыта, но проблема вернулась → переоткрыть:
     ```bash
     bd update {issue_id} --status open -d "Не удалено при очистке. См. dead-code-report.md"
     ```
   - Создавать новую задачу **ТОЛЬКО** если в маппинге нет ID для этого элемента:
     ```bash
     bd create "REMAINING: {item_title}" -t chore -p {priority} \
       -d "Not removed in cleanup. See dead-code-report.md"
     ```

3. **Generate summary for user**:

```markdown
## Проверка здоровья: Мёртвый код — Завершено

**Wisp ID**: {wisp_id}
**Итераций**: {count}/3
**Статус**: {УСПЕХ/ЧАСТИЧНЫЙ}

### Результаты
- Обнаружено: {total} элементов мёртвого кода
- Удалено: {removed} ({percentage}%)
- Осталось: {remaining}

### По приоритетам
- Критические: {removed}/{total}
- Высокие: {removed}/{total}
- Средние: {removed}/{total}
- Низкие: {removed}/{total}

### Задачи Beads
- Создано: {count}
- Закрыто: {count}
- Осталось: {count}

### Валидация
- Type Check: {status}
- Build: {status}

### Артефакты
- Обнаружение: `reports/dead-code-report.md`
- Очистка: `reports/dead-code-cleanup-summary.md`
```

4. **Update TodoWrite**: mark wisp complete

5. **Record metrics** (ОБЯЗАТЕЛЬНО — НЕ ПРОПУСКАТЬ):

   **Источники данных** (читать в указанном порядке):
   - `report_date` → из frontmatter `reports/dead-code-report.md`, поле `generated` (дата текущего прогона)
   - `detection.*` → из frontmatter `reports/dead-code-report.md` (`issues_found`, `critical_count`, `high_count`, `medium_count`, `low_count`)
   - `remediation.*` → из результатов Phase 5 (фактические данные текущего прогона: сколько обработано, удалено, изменено)

   **ВАЖНО**: НЕ брать данные из `reports/dead-code-cleanup-summary.md` — этот файл может содержать данные предыдущих прогонов. Использовать только фактические результаты текущей сессии.

   Прочитать `.tmp/metrics/YYYY-MM.json` (текущий месяц). Если не существует — создать структуру из шаблона `/record-metrics`.
   Обновить (или добавить) секцию `categories.dead_code` данными текущего прогона:
   ```json
   "dead_code": {
     "report_date": "YYYY-MM-DD",
     "detection": { "total_found": N, "critical": N, "high": N, "medium": N, "low": N },
     "remediation": { "elements_processed": N, "elements_fixed": N, "skipped": N, "files_deleted": N, "files_modified": N, "console_logs_removed": N, "types_removed": N, "dependencies_removed": N, "fix_rate_percent": N }
   }
   ```
   Пересчитать `summary`, `health_scores` (fix_rate >=90%→HEALTHY, >=70%→NEEDS_ATTENTION, <70%→CRITICAL), `severity_distribution`.
   Записать файл через Write tool. **Если этот шаг не выполнен — workflow считается НЕЗАВЕРШЁННЫМ.**

6. **SESSION CLOSE PROTOCOL**:
   ```bash
   git status
   git add .
   bd sync
   git commit -m "chore: cleanup - {removed} dead code items removed ({wisp_id})"
   bd sync
   git push
   ```

---

## Error Handling

**If quality gate fails**:
```
Rollback available: .tmp/current/changes/cleanup-changes.json

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

## Quick Reference

| Phase | Beads Action |
|-------|--------------|
| 1. Pre-flight | `bd mol wisp exploration` |
| 3. After detection | `bd create` for each item |
| 5. Before removal | `bd update --status in_progress` |
| 5. After removal | `bd close --reason "Removed"` |
| 7. Complete | `bd mol squash/burn` |
| 7. Remaining | `bd create` for unremoved items |
