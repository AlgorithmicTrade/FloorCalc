---
# Agent Workflow
---

- Before creating new files, always check if there are existing files where the functionality can be added.
- Only create new files if no suitable place exists in the current codebase.
- If a file is too large to read in one go, do NOT give conclusions. Instead, use search (file_glob_search/grep) to find relevant functions/keywords, then read only the needed sections (by reading smaller ranges / relevant blocks).
- Always cite exact locations (file + function names) based on actual read content.
-Если чтение файла через @codebase не удалось, не делай вывод “слишком большой/нет доступа”. Скажи: “чтение не удалось (ошибка/таймаут)”, предложи альтернативу: искать по репозиторию или читать фрагментами.
