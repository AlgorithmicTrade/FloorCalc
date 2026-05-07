---
name: health-bugs
description: Inline orchestration workflow for automated bug detection and fixing with Beads integration. Provides step-by-step phases for bug-hunter detection, history enrichment for priority bugs, priority-based fixing with bug-fixer, and verification cycles. SKIP: для проектов без `package.json` или type-check скрипта; для одиночного бага (используйте bug-fixer напрямую); если `.beads/` не инициализирован
---

## Outcome

**Goal**: проект имеет 0 непокрытых критических/высоких багов после max 3 итераций hunter→fixer→verify; общий fix-rate ≥ 90% по обнаруженным багам

**Success criteria**:
- type-check и build проходят после применения исправлений
- bug-fixes-implemented.md содержит список исправлений с rollback-инструкциями
- bug-verification-report.md показывает 0 регрессий
- Beads-issues созданы и закрыты по мере работы

**Stop rules**:
- Достигнут max iterations workflow
- Quality gate (type-check / build) не прошёл и rollback применён
- Пользователь явно остановил выполнение

**Project Stack Discovery (Phase 0)**: перед началом workflow прочитать `package.json` (deps + scripts + name), lock-файл (package-manager), `CLAUDE.md` (Active Technologies), `.mcp.json` (доступные MCP). Использовать выявленный package_manager (npm/pnpm/yarn/bun) для type-check/build, не хардкодить `pnpm`. Stack-specific MCP-вызовы (`mcp__supabase__*`, `mcp__context7__*` и т.п.) применять только при наличии в `.mcp.json`; иначе skip с пометкой в отчёте.

# Bug Health Check (Inline Orchestration)

You ARE the orchestrator. Execute this workflow directly without spawning a separate orchestrator agent.

> **CRITICAL — Agent Names**: Use EXACTLY `"bug-hunter"` and `"bug-fixer"` as `subagent_type`.
> Do NOT add any prefix (e.g. `voltagent-qa-sec:bug-hunter` is WRONG).
> The correct names are simply `bug-hunter` and `bug-fixer`.

## Workflow Overview

```
Beads Init → Detection → History Check (HIGH+) → Create Issues → Fix by Priority → Close Issues → Verify → Beads Complete
```

**Max iterations**: 3
**Priorities**: critical → high → medium → low
**Beads integration**: Automatic issue tracking
**History enrichment**: For CRITICAL and HIGH bugs only

---

## Phase 1: Pre-flight & Beads Init

1. **Setup directories**:

   ```bash
   mkdir -p .tmp/current/{plans,changes,backups} reports
   ```

2. **Validate environment**:
   - Check `package.json` exists
   - Check `type-check` and `build` scripts exist

3. **Create Beads wisp**:

   ```bash
   bd mol wisp healthcheck
   ```

   **IMPORTANT**: Save the wisp ID (e.g., `<bd-prefix>-xxx`) for later use.

4. **Initialize TodoWrite**:
   ```json
   [
     { "content": "Bug detection", "status": "in_progress", "activeForm": "Detecting bugs" },
     { "content": "Create Beads issues", "status": "pending", "activeForm": "Creating issues" },
     { "content": "Fix critical bugs", "status": "pending", "activeForm": "Fixing critical bugs" },
     { "content": "Fix high priority bugs", "status": "pending", "activeForm": "Fixing high bugs" },
     {
       "content": "Fix medium priority bugs",
       "status": "pending",
       "activeForm": "Fixing medium bugs"
     },
     { "content": "Fix low priority bugs", "status": "pending", "activeForm": "Fixing low bugs" },
     { "content": "Verification scan", "status": "pending", "activeForm": "Verifying fixes" },
     { "content": "Complete Beads wisp", "status": "pending", "activeForm": "Completing wisp" }
   ]
   ```

---

## Phase 2: Detection

**Invoke bug-hunter** via Task tool:

```
subagent_type: "bug-hunter"
description: "Detect all bugs"
prompt: |
  Scan the entire codebase for bugs:
  - Run type-check and build
  - Check for security vulnerabilities
  - Find dead code and debug statements
  - Categorize by priority (critical/high/medium/low)

  Generate: reports/bug-hunting-report.md

  IMPORTANT: Write the entire report in Russian language.

  Return summary with bug counts per priority.
```

**After bug-hunter returns**:

1. Read `reports/bug-hunting-report.md`
2. Parse bug counts by priority
3. If zero bugs → skip to Phase 7 (Final Summary)
4. Update TodoWrite: mark detection complete

---

## Phase 2.5: History Enrichment (CRITICAL/HIGH only)

**Purpose**: Find previously fixed similar bugs to detect regressions and provide historical context.

**When to run**: Only for CRITICAL and HIGH priority bugs (skip for MEDIUM/LOW).

### Steps

1. **Extract keywords** from each CRITICAL/HIGH bug title/description

2. **Search Beads history**:

   ```bash
   # For each bug, search by relevant keywords
   bd search "{keywords}" --status closed --limit 5

   # Also search by category
   bd search "security" --status closed --limit 5      # for security bugs
   bd search "dependency" --status closed --limit 5    # for dependency bugs
   bd search "{file_path}" --status closed --limit 3   # for file-specific bugs
   ```

3. **Evaluate results**:
   - **Match found**: Similar closed issue exists
     - Could be regression (same bug returned)
     - Could be related pattern (similar problem elsewhere)
   - **No match**: New type of bug

4. **Enrich bug data**:

   ```
   For each bug with history matches:
   - Add to bug metadata: related_issues: [<bd-prefix>-xxx, <bd-prefix>-yyy]
   - Note if potential regression: is_regression: true/false
   ```

5. **Store enrichment** for Phase 3 and Phase 5:
   ```json
   // .tmp/current/history-enrichment.json
   {
     "bug_1": {
       "related_closed": ["<bd-prefix>-abc", "<bd-prefix>-def"],
       "is_potential_regression": false,
       "context": "Similar security fix in <bd-prefix>-abc"
     }
   }
   ```

### Output

- **If related issues found**: Include in bug description when creating Beads issue
- **If potential regression**: Flag for special attention in bug-fixer prompt
- **If no history**: Proceed normally (new bug type)

### Example

```bash
# Bug: "Vulnerable tar package"
bd search "tar" --status closed --limit 5
bd search "vulnerability" --status closed --limit 5
bd search "pnpm override" --status closed --limit 5

# Results: No matches → new bug, no enrichment needed
# Results: <bd-prefix>-xyz found → add to related_issues
```

**Note**: History enrichment is informational, not blocking. Missing history doesn't prevent fixing.

---

## Phase 3: Create Beads Issues

**ДЕДУПЛИКАЦИЯ (ОБЯЗАТЕЛЬНО перед каждым `bd create`)**:
1. Перед созданием задачи искать существующие открытые задачи:
   ```bash
   bd search "{bug_title_keywords}" --status open
   ```
2. Если найдена открытая задача с тем же багом → **НЕ создавать дубль**, использовать существующий ID в маппинге
3. Создавать новую задачу **только если дубль не найден**

**For each bug found** (после проверки дедупликации), create a Beads issue.

### For CRITICAL/HIGH bugs (with history enrichment):

```bash
# If related_issues found in Phase 2.5:
bd create "BUG: {bug_title}" -t bug -p {1|2} \
  -d "{description}

## History Context
Related closed issues: {related_issues}
Potential regression: {yes/no}
Previous fix context: {context from enrichment}" \
  --deps discovered-from:{wisp_id}

# If no history found:
bd create "BUG: {bug_title}" -t bug -p {1|2} -d "{description}" \
  --deps discovered-from:{wisp_id}
```

### For MEDIUM/LOW bugs (no history check):

```bash
# Medium bugs (P3)
bd create "BUG: {bug_title}" -t bug -p 3 -d "{description}" \
  --deps discovered-from:{wisp_id}

# Low bugs (P4)
bd create "BUG: {bug_title}" -t bug -p 4 -d "{description}" \
  --deps discovered-from:{wisp_id}
```

**Track issue IDs** in a mapping (включая переиспользованные существующие ID):

```
bug_1 → <bd-prefix>-aaa (related: <bd-prefix>-xyz)
bug_2 → <bd-prefix>-bbb (existing, reused)
...
```

Update TodoWrite: mark "Create Beads issues" complete.

---

## Phase 4: Quality Gate (Pre-fix)

Run inline validation:

```bash
pnpm type-check
pnpm build
```

- If both pass → proceed to fixing
- If fail → report to user, exit

---

## Phase 5: Fixing Loop

**For each priority** (critical → high → medium → low):

1. **Check if bugs exist** for this priority
   - If zero → skip to next priority

2. **Update TodoWrite**: mark current priority in_progress

3. **Claim issues in Beads**:

   ```bash
   bd update {issue_id} --status in_progress
   ```

4. **Invoke bug-fixer** via Task tool:

   ```
   subagent_type: "bug-fixer"
   description: "Fix {priority} bugs"
   prompt: |
     Read reports/bug-hunting-report.md and fix all {priority} priority bugs.

     ## History Context (for CRITICAL/HIGH only)
     Check .tmp/current/history-enrichment.json for related closed issues.
     If a bug has related_closed issues:
     - Review the previous fix approach (bd show {related_id})
     - Consider if this is a regression
     - Apply learnings from previous fix

     For each bug:
     1. Backup file before editing
     2. If history exists, review previous fix first
     3. Implement fix
     4. Log change to .tmp/current/changes/bug-changes.json

     Generate/update: reports/bug-fixes-implemented.md

     IMPORTANT: Write the entire report in Russian language.

     Return: count of fixed bugs, count of failed fixes, list of fixed bug IDs.
   ```

5. **Quality Gate** (inline):

   ```bash
   pnpm type-check
   pnpm build
   ```

   - If FAIL → report error, suggest rollback, exit
   - If PASS → continue

6. **Close fixed issues in Beads**:

   ```bash
   bd close {issue_id_1} {issue_id_2} ... --reason "Fixed in health check"
   ```

7. **Update TodoWrite**: mark priority complete

8. **Repeat** for next priority

---

## Phase 6: Verification

After all priorities fixed:

1. **Update TodoWrite**: mark verification in_progress

2. **Invoke bug-hunter** (verification mode):

   ```
   subagent_type: "bug-hunter"
   description: "Verification scan"
   prompt: |
     Re-scan codebase after fixes.
     Compare with previous reports/bug-hunting-report.md.

     Report:
     - Bugs fixed (count)
     - Bugs remaining (count)
     - New bugs introduced (count)
   ```

3. **Decision**:
   - If bugs_remaining == 0 → Phase 7
   - If iteration < 3 AND bugs_remaining > 0 → Go to Phase 2
   - If iteration >= 3 → Phase 7 with remaining bugs

---

## Phase 7: Final Summary & Beads Complete

1. **Complete Beads wisp**:

   ```bash
   # If all bugs fixed
   bd mol squash {wisp_id}

   # If no bugs found (nothing to do)
   bd mol burn {wisp_id}
   ```

2. **Обработка нерешённых багов** (если есть):
   - Проверить маппинг из Phase 3 — если задача ещё открыта → **НЕ создавать "REMAINING" дубль**
   - Если задача была закрыта, но баг вернулся → переоткрыть:
     ```bash
     bd update {issue_id} --status open -d "Не исправлен в health check. См. bug-hunting-report.md"
     ```
   - Создавать новую задачу **ТОЛЬКО** если в маппинге нет ID для этого бага:
     ```bash
     bd create "REMAINING: {bug_title}" -t bug -p {priority} \
       -d "Not fixed in health check. See bug-hunting-report.md"
     ```

3. **Generate summary for user**:

```markdown
## Проверка здоровья: Баги — Завершено

**Wisp ID**: {wisp_id}
**Итераций**: {count}/3
**Статус**: {УСПЕХ/ЧАСТИЧНЫЙ}

### Результаты

- Обнаружено: {total} багов
- Исправлено: {fixed} ({percentage}%)
- Осталось: {remaining}

### По приоритетам

- Критические: {fixed}/{total}
- Высокие: {fixed}/{total}
- Средние: {fixed}/{total}
- Низкие: {fixed}/{total}

### Задачи Beads

- Создано: {count}
- Закрыто: {count}
- Осталось: {count} (задачи созданы для отслеживания)

### Валидация

- Type Check: {status}
- Build: {status}

### Артефакты

- Обнаружение: `reports/bug-hunting-report.md`
- Исправления: `reports/bug-fixes-implemented.md`
```

4. **Update TodoWrite**: mark wisp complete

5. **Record metrics** (ОБЯЗАТЕЛЬНО — НЕ ПРОПУСКАТЬ):

   **Источники данных** (читать в указанном порядке):
   - `report_date` → из frontmatter `reports/bug-hunting-report.md`, поле `generated` (дата текущего прогона)
   - `detection.*` → из frontmatter `reports/bug-hunting-report.md` (`issues_found`, `critical_count`, `high_count`, `medium_count`, `low_count`, `files_processed`)
   - `remediation.*` → из результатов Phase 5 (фактические данные текущего прогона: сколько исправлено, сколько осталось, сколько файлов изменено)
   - `verification.*` → из результатов Phase 6

   **ВАЖНО**: НЕ брать данные из `reports/bug-fixes-implemented.md` — этот файл может содержать данные предыдущих прогонов. Использовать только фактические результаты текущей сессии.

   Прочитать `.tmp/metrics/YYYY-MM.json` (текущий месяц). Если не существует — создать структуру из шаблона `/record-metrics`.
   Обновить (или добавить) секцию `categories.bugs` данными текущего прогона:
   ```json
   "bugs": {
     "report_date": "YYYY-MM-DD",
     "detection": { "total_found": N, "critical": N, "high": N, "medium": N, "low": N, "files_scanned": N },
     "remediation": { "fixed": N, "remaining": N, "failed": N, "fix_rate_percent": N, "files_modified": N },
     "verification": { "status": "success|failed", "new_bugs_introduced": N, "regression_free": true|false }
   }
   ```
   Пересчитать `summary`, `health_scores` (fix_rate >=90%→HEALTHY, >=70%→NEEDS_ATTENTION, <70%→CRITICAL), `severity_distribution`.
   Записать файл через Write tool. **Если этот шаг не выполнен — workflow считается НЕЗАВЕРШЁННЫМ.**

6. **SESSION CLOSE PROTOCOL**:
   ```bash
   git status
   git add .
   bd sync
   git commit -m "fix: health check - {fixed} bugs fixed ({wisp_id})"
   bd sync
   git push
   ```

---

## Error Handling

**If quality gate fails**:

```
Rollback available: .tmp/current/changes/bug-changes.json

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

| Phase                | Beads Action                             |
| -------------------- | ---------------------------------------- |
| 1. Pre-flight        | `bd mol wisp healthcheck`                |
| 2.5. History (HIGH+) | `bd search "{keywords}" --status closed` |
| 3. After detection   | `bd create` for each bug (with history)  |
| 5. Before fix        | `bd update --status in_progress`         |
| 5. After fix         | `bd close --reason "Fixed"`              |
| 7. Complete          | `bd mol squash/burn`                     |
| 7. Remaining         | `bd create` for unfixed bugs             |

---

## Worker Prompts

See `references/worker-prompts.md` for detailed prompts.
