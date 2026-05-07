---
description: Собрать метрики из reports/ всех health-скиллов в .tmp/metrics/YYYY-MM.json
argument-hint: "[YYYY-MM] (по умолчанию текущий месяц)"
allowed-tools: Read, Write, Bash
---

# Command: /record-metrics

Собрать метрики из отчётов всех health-скиллов и записать в `.tmp/metrics/YYYY-MM.json`.

## Использование

```
/record-metrics            # Текущий месяц
/record-metrics 2026-03    # Конкретный месяц
```

## Процесс

### 1. Инициализация

```bash
mkdir -p .tmp/metrics
```

Определить `YYYY-MM` — текущий месяц или из аргумента.

### 2. Сканирование отчётов

Прочитать ВСЕ файлы из `reports/`:

| Отчёт | Источник (health-скилл) | Тип данных |
|-------|------------------------|------------|
| `bug-hunting-report.md` | /health-bugs | Обнаружение |
| `bug-fixes-implemented.md` | /health-bugs | Исправление |
| `bug-verification-report.md` | /health-bugs | Верификация |
| `security-scan-report.md` | /health-security | Обнаружение |
| `security-fixes-implemented.md` | /health-security | Исправление |
| `dependency-scan-report.md` | /health-deps | Обнаружение |
| `dependency-updates-implemented.md` | /health-deps | Исправление |
| `dead-code-report.md` | /health-cleanup | Обнаружение |
| `dead-code-cleanup-summary.md` | /health-cleanup | Исправление |
| `dead-code-verification-report.md` | /health-cleanup | Верификация |
| `reuse-hunting-report.md` | /health-reuse | Обнаружение |
| `reuse-fixes-implemented.md` | /health-reuse | Исправление |

### 3. Парсинг каждого отчёта

Для каждого файла:

1. **Прочитать YAML frontmatter** (между `---` маркерами) — извлечь:
   - `generated` / дата
   - `status`
   - `issues_found`, `critical_count`, `high_count`, `medium_count`, `low_count`
   - `files_processed`
   - `modifications_made`
   - Любые специфичные поля (`security_score`, `health_score`, `bugs_fixed`, `bugs_remaining`)

2. **Если YAML отсутствует** — парсить из текста:
   - Искать таблицы с `| Приоритет | Количество |` или `| Показатель | Значение |`
   - Искать строки вида: `Обнаружено проблем: N`, `Исправлено: N`, `Осталось: N`
   - Искать паттерн `X/100` для оценок (score)

3. **Для *-implemented / *-fixes файлов** — извлечь:
   - Количество исправленных (fixed)
   - Количество оставшихся (remaining)
   - Количество файлов изменённых (files_modified)
   - Количество неудачных исправлений (failed)

### 4. Формирование JSON метрик

Записать результат в `.tmp/metrics/YYYY-MM.json`:

```json
{
  "month": "2026-03",
  "generated": "2026-03-29T12:00:00Z",
  "project_version": "0.9.1",

  "categories": {
    "bugs": {
      "report_date": "2026-03-20",
      "detection": {
        "total_found": 31,
        "critical": 2,
        "high": 8,
        "medium": 14,
        "low": 7,
        "files_scanned": 180
      },
      "remediation": {
        "fixed": 9,
        "remaining": 1,
        "failed": 0,
        "fix_rate_percent": 90,
        "files_modified": 15
      },
      "verification": {
        "status": "success",
        "new_bugs_introduced": 0,
        "regression_free": true
      }
    },
    "security": {
      "report_date": "2026-03-20",
      "detection": {
        "total_found": 16,
        "critical": 0,
        "high": 4,
        "medium": 7,
        "low": 5,
        "files_scanned": 200
      },
      "remediation": {
        "fixed": 14,
        "verified_safe": 3,
        "remaining": 2,
        "failed": 0,
        "fix_rate_percent": 77,
        "files_modified": 20
      },
      "score": {
        "current": 85,
        "previous": 72,
        "max": 100
      }
    },
    "dependencies": {
      "report_date": "2026-03-20",
      "detection": {
        "total_found": 14,
        "critical": 1,
        "high": 5,
        "medium": 7,
        "low": 1,
        "total_dependencies": 951
      },
      "remediation": {
        "updated": 5,
        "added": 1,
        "removed": 1,
        "remaining": 0,
        "failed": 0,
        "fix_rate_percent": 100,
        "vulnerabilities_before": 89,
        "vulnerabilities_after": 50,
        "vulnerabilities_reduced": 39,
        "reduction_percent": 44
      },
      "score": {
        "current": 72,
        "max": 100
      }
    },
    "dead_code": {
      "report_date": "2026-03-22",
      "detection": {
        "total_found": 101,
        "from_original": 22,
        "new_issues": 79,
        "eliminated_from_original": 41
      },
      "remediation": {
        "elements_processed": 253,
        "elements_fixed": 246,
        "skipped": 12,
        "files_deleted": 31,
        "files_modified": 47,
        "console_logs_removed": 151,
        "types_removed": 14,
        "dependencies_removed": 10,
        "fix_rate_percent": 97
      }
    },
    "reuse": {
      "report_date": null,
      "detection": {
        "total_found": 0
      },
      "remediation": {
        "fixed": 0,
        "fix_rate_percent": 0
      }
    }
  },

  "summary": {
    "total_issues_found": 162,
    "total_issues_fixed": 269,
    "total_remaining": 3,
    "overall_fix_rate_percent": 89,
    "categories_scanned": 4,
    "categories_with_data": 4,
    "last_scan_date": "2026-03-22"
  },

  "health_scores": {
    "bugs": { "score": 90, "status": "HEALTHY" },
    "security": { "score": 85, "status": "HEALTHY" },
    "dependencies": { "score": 72, "status": "NEEDS_ATTENTION" },
    "dead_code": { "score": 97, "status": "HEALTHY" },
    "overall": { "score": 86, "status": "HEALTHY" }
  },

  "severity_distribution": {
    "critical": 3,
    "high": 17,
    "medium": 28,
    "low": 13,
    "total": 61
  },

  "trends": {
    "note": "Заполняется при наличии предыдущего месяца"
  },

  "quality_gates": {
    "type_check": { "passed": true, "last_run": "2026-03-22" },
    "build": { "passed": true, "last_run": "2026-03-22" }
  }
}
```

### 5. Расчёт метрик

**Оценка здоровья по категории:**
- `fix_rate >= 90%` → HEALTHY
- `fix_rate >= 70%` → NEEDS_ATTENTION
- `fix_rate < 70%` → CRITICAL

**Общая оценка здоровья:**
- Среднее арифметическое оценок по всем категориям с данными
- Если хотя бы одна категория CRITICAL → общий статус CRITICAL

**Процент исправления:**
```
fix_rate = (fixed / total_found) * 100
```

**Распределение по серьёзности:**
- Суммировать critical/high/medium/low из всех detection-секций

### 6. Сравнение с предыдущим месяцем (если есть)

Если существует `.tmp/metrics/YYYY-(MM-1).json`:
- Рассчитать дельту по каждой категории
- Заполнить секцию `trends`

### 7. Бэкап

```bash
cp .tmp/metrics/YYYY-MM.json .tmp/metrics/YYYY-MM.json.backup
```

### 8. Вывод

```
Metrics recorded: .tmp/metrics/YYYY-MM.json
- Categories: N with data
- Total issues found: N
- Total fixed: N
- Overall fix rate: N%
- Overall health: STATUS

Run /health-metrics to generate the full report.
```

## Правила парсинга

### YAML Frontmatter
```
---
report_type: bug-hunting
issues_found: 31
critical_count: 2
---
```
Парсить как ключ-значение между `---` маркерами.

### Таблицы Markdown
```
| Показатель | Значение |
|------------|----------|
| Исправлено | 9 |
```
Парсить числа из правой колонки.

### Текстовые паттерны
- `Обнаружено проблем: N` → issues_found
- `Исправлено: N` / `Fixed: N` → fixed
- `Осталось: N` / `Remaining: N` → remaining
- `Оценка безопасности: N/100` → score
- `files_processed: N` → files_scanned
- `Сокращение уязвимостей: -N (X%)` → reduction

### Отсутствующие отчёты
Если файл отчёта не найден — записать `report_date: null` и нулевые значения.

## Обработка ошибок

- **Отчёт не найден**: Пропустить, записать null в report_date
- **Ошибка парсинга**: Записать что удалось извлечь, добавить `"parse_errors": [...]`
- **Пустой отчёт**: Записать нулевые значения
- **Нет ни одного отчёта**: Сообщить "Нет отчётов в reports/. Сначала запустите health-скиллы."

## Связанные команды

- `/health-metrics` — генерирует сводный отчёт из собранных метрик
- `/health-bugs` — генерирует отчёты по багам
- `/health-security` — генерирует отчёты по безопасности
- `/health-deps` — генерирует отчёты по зависимостям
- `/health-cleanup` — генерирует отчёты по мёртвому коду
- `/health-reuse` — генерирует отчёты по дублированию
