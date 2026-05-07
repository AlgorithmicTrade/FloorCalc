---
description: Сводный отчёт здоровья проекта (bugs/security/deps/dead-code/reuse) из метрик health-скиллов
argument-hint: "[YYYY-MM | last-month] (по умолчанию текущий месяц)"
allowed-tools: Read, Write, Bash
---

# Command: /health-metrics

Генерация сводного отчёта здоровья проекта на основе метрик из health-скиллов.

## Использование

```
/health-metrics            # Текущий месяц
/health-metrics 2026-03    # Конкретный месяц
/health-metrics last-month # Предыдущий месяц
```

## Процесс

### 1. Загрузка метрик

Прочитать `.tmp/metrics/YYYY-MM.json`.

**Если файл отсутствует:**
1. Автоматически запустить `/record-metrics` — собрать метрики из `reports/`
2. Повторно прочитать `.tmp/metrics/YYYY-MM.json`
3. Если всё равно нет данных — сообщить: "Нет отчётов. Сначала запустите health-скиллы (/health-bugs, /health-security, /health-deps, /health-cleanup)."

**Для сравнения:** прочитать `.tmp/metrics/YYYY-(MM-1).json` (предыдущий месяц), если существует.

### 2. Анализ по категориям

Для каждой категории (bugs, security, dependencies, dead_code, reuse):

**2.1 Статус обнаружения:**
- Сколько проблем найдено всего
- Распределение по серьёзности (critical / high / medium / low)
- Дата последнего сканирования

**2.2 Прогресс исправления:**
- Сколько исправлено vs сколько осталось
- Процент исправления (fix_rate)
- Количество изменённых файлов
- Количество неудачных попыток

**2.3 Верификация (если есть):**
- Регрессии — были ли новые проблемы после исправлений
- Статус type-check / build после исправлений

### 3. Расчёт дополнительных метрик

**3.1 Индекс технического долга (Tech Debt Index):**
```
TDI = (critical * 10 + high * 5 + medium * 2 + low * 1) / categories_with_data
```
- TDI < 20 → LOW (зелёный)
- TDI 20-50 → MODERATE (жёлтый)
- TDI > 50 → HIGH (красный)

**3.2 Скорость исправления (Fix Velocity):**
```
velocity = total_fixed / days_since_first_scan
```
Единицы: исправлений/день

**3.3 Индекс регрессии (Regression Index):**
```
regression = new_issues_after_fixes / total_fixed * 100
```
- < 5% → STABLE
- 5-15% → MODERATE
- > 15% → UNSTABLE

**3.4 Покрытие категорий (Coverage):**
```
coverage = categories_with_data / total_categories * 100
```
5 категорий: bugs, security, deps, dead_code, reuse

**3.5 Критический риск (Critical Risk Score):**
```
risk = critical_remaining * 25 + high_remaining * 10
```
- 0 → NO RISK
- 1-25 → LOW
- 26-50 → MEDIUM
- > 50 → HIGH

**3.6 Эффективность quality gates:**
- Процент прохождений type-check после исправлений
- Процент прохождений build после исправлений

### 4. Тренды (если есть предыдущий месяц)

Для каждой метрики рассчитать:
- Абсолютная дельта: `current - previous`
- Процентная дельта: `(current - previous) / previous * 100`
- Индикатор: `↑` (>2%), `↓` (<-2%), `→` (стабильно)

### 5. Формирование отчёта

**Путь:** `docs/reports/metrics/YYYY-MM-ecosystem-health.md`

```bash
mkdir -p docs/reports/metrics
```

#### Структура отчёта:

---

```markdown
# Отчёт здоровья проекта — {YYYY-MM}

**Дата генерации:** {timestamp}
**Версия проекта:** {version}
**Период:** {month}

---

## 1. Общее состояние

| Метрика | Значение | Статус |
|---------|----------|--------|
| Общая оценка | {score}/100 | {HEALTHY/NEEDS_ATTENTION/CRITICAL} |
| Процент исправления | {fix_rate}% | {индикатор} |
| Технический долг (TDI) | {tdi} | {LOW/MODERATE/HIGH} |
| Критический риск | {risk} | {NO RISK/LOW/MEDIUM/HIGH} |
| Индекс регрессии | {regression}% | {STABLE/MODERATE/UNSTABLE} |
| Покрытие категорий | {coverage}% ({N}/5) | — |

### Общее определение здоровья:
- **HEALTHY AND IMPROVING**: оценка >=90%, нет критических, положительные тренды
- **HEALTHY**: оценка >=80%, не более 1 критической проблемы
- **NEEDS ATTENTION**: оценка 70-79% ИЛИ 2-5 критических
- **CRITICAL**: оценка <70% ИЛИ >5 критических

---

## 2. Баги (/health-bugs)

| Метрика | Значение |
|---------|----------|
| Дата сканирования | {date} |
| Обнаружено | {total} (C:{critical} H:{high} M:{medium} L:{low}) |
| Исправлено | {fixed} ({fix_rate}%) |
| Осталось | {remaining} |
| Новых после фиксов | {new_bugs} |
| Оценка | {score}/100 |

### Прогресс:
```
[████████████████████░░] {fix_rate}% ({fixed}/{total})
```

---

## 3. Безопасность (/health-security)

| Метрика | Значение |
|---------|----------|
| Дата сканирования | {date} |
| Обнаружено уязвимостей | {total} (C:{critical} H:{high} M:{medium} L:{low}) |
| Исправлено | {fixed} ({fix_rate}%) |
| Осталось | {remaining} |
| Оценка безопасности | {score}/100 (было {prev_score}/100) |
| Изменено файлов | {files_modified} |

### Прогресс:
```
[████████████████░░░░░░] {fix_rate}% ({fixed}/{total})
```

---

## 4. Зависимости (/health-deps)

| Метрика | Значение |
|---------|----------|
| Дата аудита | {date} |
| Всего зависимостей | {total_deps} |
| Проблем найдено | {total} (C:{critical} H:{high} M:{medium} L:{low}) |
| Обновлено | {updated} |
| Уязвимости ДО | {vulns_before} |
| Уязвимости ПОСЛЕ | {vulns_after} |
| Сокращение | -{reduction} ({reduction_pct}%) |
| Оценка здоровья | {score}/100 |

### Прогресс:
```
[██████████████████████] {fix_rate}% ({fixed}/{total})
```

---

## 5. Мёртвый код (/health-cleanup)

| Метрика | Значение |
|---------|----------|
| Дата сканирования | {date} |
| Всего активных проблем | {total} |
| Элементов обработано | {processed} |
| Элементов исправлено | {fixed} ({fix_rate}%) |
| Файлов удалено | {files_deleted} |
| Файлов модифицировано | {files_modified} |
| console.log удалено | {console_removed} |
| Типов удалено | {types_removed} |

### Прогресс:
```
[█████████████████████░] {fix_rate}% ({fixed}/{processed})
```

---

## 6. Дублирование кода (/health-reuse)

| Метрика | Значение |
|---------|----------|
| Дата сканирования | {date или "Не запускалось"} |
| Дублирований найдено | {total} |
| Консолидировано | {fixed} ({fix_rate}%) |

---

## 7. Распределение по серьёзности (все категории)

| Уровень | Найдено | Исправлено | Осталось | % исправления |
|---------|---------|------------|----------|---------------|
| CRITICAL | {n} | {n} | {n} | {pct}% |
| HIGH | {n} | {n} | {n} | {pct}% |
| MEDIUM | {n} | {n} | {n} | {pct}% |
| LOW | {n} | {n} | {n} | {pct}% |
| **ИТОГО** | **{n}** | **{n}** | **{n}** | **{pct}%** |

---

## 8. Quality Gates

| Gate | Статус | Последний запуск |
|------|--------|-----------------|
| TypeScript type-check | {PASS/FAIL} | {date} |
| Build (production) | {PASS/FAIL} | {date} |

---

## 9. Дополнительные метрики

| Метрика | Значение | Оценка |
|---------|----------|--------|
| Tech Debt Index | {tdi} | {LOW/MODERATE/HIGH} |
| Fix Velocity | {velocity} исправлений/день | — |
| Regression Index | {regression}% | {STABLE/MODERATE/UNSTABLE} |
| Critical Risk Score | {risk} | {NO RISK/LOW/MEDIUM/HIGH} |
| Категорий просканировано | {N}/5 | {coverage}% |

---

## 10. Тренды (vs предыдущий месяц)

> Если нет данных за предыдущий месяц: "Недостаточно данных для анализа трендов. Первый месяц сбора метрик."

| Метрика | {prev_month} | {curr_month} | Δ | Тренд |
|---------|-------------|-------------|---|-------|
| Общая оценка | {prev} | {curr} | {delta} | {↑/↓/→} |
| Всего проблем | {prev} | {curr} | {delta} | {↑/↓/→} |
| Процент исправления | {prev}% | {curr}% | {delta}% | {↑/↓/→} |
| Tech Debt Index | {prev} | {curr} | {delta} | {↑/↓/→} |
| Critical Risk | {prev} | {curr} | {delta} | {↑/↓/→} |

---

## 11. Рекомендации

### Высокий приоритет
- {Критические неисправленные проблемы}
- {Категории с fix_rate < 70%}

### Средний приоритет
- {Категории с fix_rate < 85%}
- {Не просканированные категории}

### Низкий приоритет
- {Оптимизации}
- {Мелкие улучшения}

---

## 12. Заключение

**Статус: {HEALTHY AND IMPROVING / HEALTHY / NEEDS ATTENTION / CRITICAL}**

{Краткое резюме 2-3 предложения: что хорошо, что требует внимания, следующие шаги.}

**Следующие действия:**
1. {действие 1}
2. {действие 2}
3. {действие 3}
```

---

### 6. Вывод результата

```
Report: docs/reports/metrics/YYYY-MM-ecosystem-health.md
- Overall Health: {STATUS}
- Total Issues Found: {count}
- Total Fixed: {count} ({fix_rate}%)
- Total Remaining: {count}
- Tech Debt Index: {tdi} ({level})
- Critical Risk: {risk} ({level})
- Top Concern: {описание главной проблемы}
- Recommendation: {главная рекомендация}
```

## Обработка ошибок

- **Нет `.tmp/metrics/YYYY-MM.json`**: Автоматически вызвать логику `/record-metrics`
- **Повреждённый JSON**: Попробовать `.tmp/metrics/YYYY-MM.json.backup`
- **Нет отчётов вообще**: Сообщить с инструкцией запустить health-скиллы
- **Ошибка записи**: Проверить права доступа и место на диске

## Связанные команды

- `/record-metrics` — сбор метрик из отчётов в JSON
- `/health-bugs` — обнаружение и исправление багов
- `/health-security` — аудит и исправление уязвимостей
- `/health-deps` — аудит и обновление зависимостей
- `/health-cleanup` — обнаружение и удаление мёртвого кода
- `/health-reuse` — обнаружение и консолидация дублирования
