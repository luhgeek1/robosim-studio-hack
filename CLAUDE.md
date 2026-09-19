@AGENTS.md

## Для Claude Code

- В начале сессии прочитай `docs/STATUS.md` и `docs/DECISIONS.md` (они короткие) — там текущее состояние.
- Файлы в `case/` большие (извлечённые PDF по 50–150 КБ). Читай нужный фрагмент через grep/offset, а не целиком;
  для широкого поиска по ним используй субагента.
- Датасеты (`case/dataset/*.xlsx`, `.csv`, `.docx`) разбирай через Python (pandas/openpyxl), не через Read.
- После заметной работы обнови `docs/STATUS.md`; после решения — `docs/DECISIONS.md` (см. таблицу в AGENTS.md).
