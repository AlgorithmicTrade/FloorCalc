# -*- coding: utf-8 -*-
"""
Тест-драйвер для beads-sync-trigger.py.
Запускает хук как subprocess на каждый JSON payload из текущей директории
и печатает результат. Сам драйвер не содержит строки 'bd' в своей Bash
команде, поэтому внешний хук Claude Code молча пропустит его.
"""
from __future__ import annotations

import io
import json
import subprocess
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

HERE = Path(__file__).parent
HOOK = HERE.parent / "beads-sync-trigger.py"
PROJECT = HERE.parent.parent.parent  # G:/Project-X/FundingBot

# Ожидания: {файл: ("triggered"|"silent", подстрока_в_additionalContext_или_None)}
expectations = {
    "t1_update.json":      ("triggered", "FundingBot-07y"),
    "t2_create.json":      ("triggered", "FundingBot-new1"),
    "t3_quoted_path.json": ("triggered", "FundingBot-qpath"),
    "t4_chain.json":       ("triggered", "FundingBot-chain"),
    "t5_readonly.json":    ("silent",    None),
    "t6_echo_quoted.json": ("silent",    None),
    "t7_grep.json":        ("silent",    None),
    "t8_dep.json":         ("triggered", "FundingBot-aaa"),
    "t9_nonbash.json":     ("silent",    None),
}

# Очистим очередь и лог перед прогоном
queue_file = PROJECT / ".claude" / "anytype-sync-queue.txt"
log_file   = PROJECT / ".claude" / "hooks" / "beads-sync-trigger.log"
queue_file.write_text("", encoding="utf-8")
if log_file.exists():
    log_file.write_text("", encoding="utf-8")

passed = 0
failed = 0

for name, (expect_kind, expect_substr) in expectations.items():
    payload_path = HERE / name
    payload = payload_path.read_bytes()
    proc = subprocess.run(
        [sys.executable, str(HOOK)],
        input=payload,
        capture_output=True,
        env={**__import__("os").environ, "CLAUDE_PROJECT_DIR": str(PROJECT)},
    )
    out = proc.stdout.decode("utf-8", errors="replace").strip()

    if expect_kind == "silent":
        ok = (out == "")
        detail = "(silent)" if ok else f"EXPECTED SILENT, GOT: {out[:200]}"
    else:
        ok = bool(out) and (expect_substr in out if expect_substr else True)
        detail = "ok" if ok else f"EXPECTED substr '{expect_substr}', GOT: {out[:300]}"

    status = "PASS" if ok else "FAIL"
    print(f"[{status}] {name} -> {detail}")
    if ok:
        passed += 1
    else:
        failed += 1

print(f"\n--- Total: {passed} passed, {failed} failed ---")
print("\n--- Queue after tests ---")
print(queue_file.read_text(encoding="utf-8"))
sys.exit(0 if failed == 0 else 1)
