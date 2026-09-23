# OpenAPI-контракт

Источник истины по API. Файлы:

```
openapi.yaml            корень: info, tags, security, список путей (ссылки на paths/*)
paths/*.yaml            path items по доменам: auth, reference (справочники + каталог), projects, analysis, simulation, platform
components/*.yaml       схемы: common (ошибки, происхождение, деньги, задачи), reference, catalog, projects, analysis, simulation, platform
openapi.bundled.yaml    склеенный в один файл (генерируется, не редактировать руками)
```

Человекочитаемое описание модели и договорённостей — `docs/CONTRACTS.md`. Изменение контракта = правка YAML здесь
+ запись в разделе «Изменения» в `docs/CONTRACTS.md`.

## Команды

Нужен Node.js. Всё через `npx`, ставить глобально ничего не надо.

```bash
# проверка (обязательна перед коммитом изменений контракта)
npx -y @redocly/cli@latest lint docs/api/openapi.yaml

# склейка в один файл — для генерации типов и для жюри
npx -y @redocly/cli@latest bundle docs/api/openapi.yaml -o docs/api/openapi.bundled.yaml

# документация в браузере
npx -y @redocly/cli@latest preview-docs docs/api/openapi.yaml

# mock-сервер для фронтенда (порт 4010; -d = динамические данные по схемам, без -d — примеры из контракта)
npx -y @stoplight/prism-cli@latest mock docs/api/openapi.yaml -p 4010
npx -y @stoplight/prism-cli@latest mock -d docs/api/openapi.yaml -p 4010

# TypeScript-типы для фронтенда (из склеенного файла имена схем чище)
npx -y openapi-typescript docs/api/openapi.bundled.yaml -o frontend/src/shared/api/schema.d.ts
```

Фронтенд: `VITE_API_BASE_URL=` (пусто) и `VITE_PROXY_TARGET=http://127.0.0.1:4010` — vite проксирует `/api` в mock,
префикс `/api/v1` уже в путях контракта. Когда бэкенд поднят локально — `VITE_PROXY_TARGET=http://127.0.0.1:8000`.

## Как читать контракт

- Гостевые эндпоинты помечены `security: []`; остальные требуют `Authorization: Bearer`.
- `Problem` — единственный формат ошибки; `error_code` — закрытый enum в `components/common.yaml`.
- Коды 400, 401, 403, 404, 422 и 429 может вернуть любая операция (неверный ввод, нет или чужой токен, чужой или
  несуществующий объект, лимит запросов) — всегда с телом `Problem`; в операциях они описаны, только когда у кода
  есть особый смысл. Остальные коды (409, 413, 415, 503 …) описаны явно.
- Интеграционные тесты бэкенда сверяют с контрактом каждый ответ: код, тип содержимого и схему тела
  (`backend/tests/contract_check.py`). Поле, которое бывает `null`, обязано быть описано как nullable.
- Долгие операции: 202 + `Job` или `SimulationRun`, прогресс по SSE (`/jobs/{id}/stream`, `/simulations/{id}/stream`).
- У всех значений, влияющих на расчёт, есть `provenance.status` — фронт показывает его бейджем.
- Плеер имитации работает по `SimulationReplay`: планировка + роботы + события окна времени; движение интерполируется на фронте.

## Порядок реализации на бэкенде (чтобы фронт раньше снимал моки)

1. system, auth, reference (object-types, norms), catalog (list, product, compare).
2. projects, params, import (шаблон), validation, processes, layout/generate.
3. matching, scenarios, calculate, comparison, trace.
4. simulations + replay + timeline + stream, fleet-sweep.
5. sensitivity, monte-carlo, survey-priorities, reports.
6. assist, demo, admin (catalog CRUD, enrichment, norm-sets), support-measures, rfq, integrations.
