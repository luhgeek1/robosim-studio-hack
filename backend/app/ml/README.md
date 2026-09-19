# ML / LLM часть RoboScope — заготовка и инструкция

Статус: **не реализовано**, продукт работает на детерминированных провайдерах.
Этот документ — задание для агента/команды, которая будет делать ML-часть.

## Что можно и что нельзя

LLM отвечает только за понимание и объяснение (PROJECT_CONTEXT.md §5, §26):

| Можно (LLM)                                   | Нельзя (только код)                          |
|-----------------------------------------------|----------------------------------------------|
| понять структуру файла, сопоставить поля      | валидация диапазонов, бизнес-правила         |
| извлечь число и единицу из текста             | hard constraints подбора роботов             |
| вернуть confidence и исходное значение        | расчёт количества роботов, экономика, ROI    |
| объяснить результат человеческим языком       | симуляция и KPI                              |
| написать executive summary                    | любые числа, которых нет во входном контексте|

## Точки подключения

Интерфейсы: `app/ml/providers.py`. Заглушки: `app/ml/llm_stub.py`. Выбор провайдера —
переменные окружения `ROBOSCOPE_IMPORT_PROVIDER=llm`, `ROBOSCOPE_EXPLANATION_PROVIDER=llm`.

### 1. SmartImportProvider.normalize(records, object_type) -> NormalizedDocument

Вход: `list[RawRecord]` — плоский список полей из файла пользователя, который уже
сделали парсеры (`app/services/parsers.py`): `{field, value, unit, context}`.
Парсеры **не** менять — они формат-зависимые, но не предметные.

Выход: `NormalizedDocument` (`app/schemas.py`) с параметрами из реестра
`app/data/parameters.py` (ключ, значение в целевых единицах, `source="confirmed"`,
`source_value` — исходная строка, `confidence` 0..1). Всё, что не удалось сопоставить —
в `unmapped`. Ничего не выдумывать: если параметра нет — не добавлять его вовсе,
`finalize()` сам подставит типовое значение как *предположение* или пометит «нет данных».

Обязательно после ответа модели вызвать
`app.services.normalizer.finalize(mapped, unmapped, object_type)` — это диапазоны,
дефолты и счётчики, они остаются в коде.

Эталон: `POST /api/projects/{id}/import/demo` и затем `GET /api/projects/{id}/export`
дают канонический JSON, который должен получаться из `sample_data/warehouse_moscow_01.json`.
Метрика качества: доля правильно сопоставленных ключей и точность значений на
`sample_data/*.json` и листах `Датасеты_хакатон.xlsx` (rule-based даёт 38 из 48 на демо-файле).

Промпт-заготовка: `app/ml/prompts/smart_import.md`.

### 2. ExplanationProvider

* `explain_configuration(context)` — `context` = JSON `ConfigurationsOut` + `target_sla`.
  Вернуть `{"why", "not_fewer", "not_more"}` типа `Explanation(title, body, points)`.
* `executive_summary(context)` — `context` = JSON `Recommendation`. 2–4 предложения для
  директора. Язык — русский, термины ROI/CAPEX/OPEX/TCO/SLA — латиницей.

Правило: в тексте могут встречаться только числа из `context`. Эталон стиля —
`app/services/explain.py` (rule-based) и экран «Симуляция» во фронтенде.

Промпт-заготовка: `app/ml/prompts/explain.md`.

## Как проверить

```bash
cd backend && .venv/bin/pytest -q            # детерминированные тесты должны проходить
ROBOSCOPE_IMPORT_PROVIDER=llm .venv/bin/uvicorn app.main:app --reload
```

Тесты в `tests/test_normalizer.py` можно использовать как контракт: LLM-провайдер
должен давать не хуже rule-based на тех же примерах.
