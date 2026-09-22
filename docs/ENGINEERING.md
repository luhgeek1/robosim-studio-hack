# Инженерный стандарт

> Обязателен для людей и агентов. Выведен из аудита `template/` (22.09.2026): что берём, что чиним, как пишем новое.
> Жюри оценивает архитектуру, воспроизводимость, модель данных, производительность и стабильность (25% баллов) и
> **читает код**, в том числе проверяет, участвует ли симуляция в расчёте.

## 1. Что берём из `template/` как есть

| Что | Где в шаблоне | Почему |
|---|---|---|
| Конверт ошибок RFC 7807 + `error_code` + тест формата | `backend/src/core/errors.py`, `core/error_handling.py`, `tests/integration/test_error_format.py` | эталон, совпадает с контрактом `Problem` |
| ASGI-middleware трассировки (`X-Request-ID`, `X-Process-Time-Ms`) | `core/middlewares/request_tracing.py` | чисто и полезно |
| argon2id в thread-pool + `needs_rehash` | `core/crypto.py` | правильная криптография паролей |
| Интеграционные тесты на реальных Postgres/Redis | `tests/conftest.py`, `docker-compose.test.yml`, `Makefile` | лучше sqlite-подделок |
| Миксины ORM, keyset-пагинация, реестр идемпотентных сид-задач | `tables/mixins.py`, `domain/common/pagination.py`, `service/seeding/*` | готовые кирпичи |
| Outbox с `FOR UPDATE SKIP LOCKED` | `matchmaking_interface.py:489-515`, `outbox_dispatcher.py` | паттерн верный, доработать бюджет ретраев |
| App-factory с флагами под тесты | `main.py: create_app(...)` | удобно для тестов и воркера |
| Фронт: axios с single-flight refresh + CSRF, adapters DTO→domain, FSD-раскладка, гарды роутов, пресеты env | `frontend/src/shared/api/axiosInstance.ts`, `entities/*/model/adapters.ts` | рабочая логика, которую нельзя терять |

## 2. Что в шаблоне сломано и что делаем вместо

| Дефект в шаблоне | Правило для нового кода |
|---|---|
| ORM-объект `User` доходит до роутеров через `auth_user` | `auth_user` возвращает `CurrentUser` (frozen dataclass). ORM не покидает пакет репозиториев и сервисов |
| Доменные правила внутри ORM-модели (`users_table.py`, ~20 `@property`, вызов `get_settings()` из модели) | ORM-модели — только колонки и связи. Правила — чистые функции в `domain/` от DTO |
| Pydantic-схемы API одновременно служат внутренними DTO и контрактом с ML | Три слоя: `api/schemas` (Pydantic) ≠ `domain` (dataclass) ≠ `db/models` (ORM). Переходы через явные `mappers.py` |
| Модули на 800–1100 строк, смешивающие 3 ответственности | Модуль ≤ 300 строк, функция ≤ 40. Одна ответственность на модуль |
| «God-repository» на 12 агрегатов, `def add(self, instance)` без типа | Репозиторий на агрегат, ≤ 200 строк, типизированные методы |
| `UoW.commit()` сбрасывает флаг и коммитит дважды; промежуточные коммиты в сервисах | Одна транзакция на запрос: коммитит только зависимость `get_uow` на выходе; в сервисах — `flush()`. Побочные эффекты (HTTP, LLM, файлы) — после коммита или через outbox |
| `except Exception` с возвратом 200 при упавшей БД | Ловим только ожидаемые исключения; сессия в failed-состоянии не маскируется |
| Rate limiter — заглушка `return None` | Либо рабочий лимит на `/auth/*` и ассистент, либо ничего. Заглушек «для галочки» не держим |
| CORS настроен, но middleware не подключён | Каждая настройка в `Settings` обязана где-то использоваться; неиспользуемые удаляем |
| Refresh для web возвращает токен в теле, `auth_version` не проверяется при refresh | Для `X-Client: web` refresh только в httpOnly-cookie; `auth_version` проверяется строго; access и refresh с разными `jti` |
| RBAC только по строке `"admin"`, permissions закомментированы | RBAC на permissions: `require(Permission.CATALOG_WRITE)`; роли — наборы permissions в коде (`guest`, `user`, `admin`, `vendor`) |
| Полный скан таблицы в горячем пути, `await` внутри list comprehension, O(N) HTTP-вызовов | Все фильтры и `LIMIT` — в SQL; никаких `select(Model)` без лимита; внешние вызовы батчами |
| `JSON` вместо `JSONB`, статусы `String(16)` вместо enum, нет `naming_convention`, миграции без `downgrade` | `JSONB` + GIN, PG enum через `sa.Enum`, `MetaData(naming_convention=...)`, `UuidPkMixin`, каждая миграция с рабочим `downgrade()` |
| Глобальные `Settings()` на импорте модуля, секреты-дефолты `change-me`, открытые `/docs` в проде | Только `Depends(get_settings)`; валидатор «в prod дефолты запрещены»; `/docs` открыт только в dev и для жюри по флагу |
| Пустые пакеты `queue/`, `workers/`, `webhooks/`, закомментированный код, две системы сидинга | Нет пустых пакетов и мёртвого кода. Одна система сидинга |
| Планировщик в каждом инстансе, outbox без лимита попыток, in-memory стейт для админ-флага | Фоновые задачи с `attempts`/`max_attempts`/`dead`; лидер через advisory lock; состояние только в Postgres/Redis |
| CI: `ruff --select E9,F63,F7` с `allow_failure`, интеграционные тесты не запускаются | CI — ворота: `ruff check` полный + `ruff format --check` + `mypy --strict` на `domain/` и `engine/` + unit + integration + сборка образа. Без `allow_failure` |
| Логи текстом без `request_id`, `/health` всегда 200 | JSON-логи с `request_id` через `contextvars`; `/health` (liveness) отдельно от `/ready` (readiness) |
| Фронт: типы API руками, ошибки разбираются ad hoc в страницах, битые виджеты shadcn, `build` без `tsc` | Типы из контракта (`openapi-typescript`), один `parseApiProblem`, `typecheck` в build и CI, мёртвый код удалить |

## 3. Структура нового бэкенда

```
backend/
  pyproject.toml            uv или poetry; ruff, mypy, pytest в конфиге
  alembic.ini, migrations/
  app/
    main.py                 create_app(settings, ...) — фабрика
    core/                   config (RS_*), errors (DomainError + ErrorCode), problem (обработчики), logging, middleware, security/
    worker.py               arq WorkerSettings: функции задач + heartbeat для /ready
    api/                    роутеры по тегам контракта + api/schemas/ (Pydantic, только вход/выход)
      v1/{auth,reference,catalog,projects,params,layout,matching,scenarios,calculations,simulation,reports,assist,demo,admin,integrations}.py
      schemas/…             1:1 с components/*.yaml контракта
      deps.py               get_uow, current_user, require(permission)
    domain/                 чистые dataclass-модели и правила без FastAPI и SQLAlchemy
      catalog/, project/, scenario/, norms/, layout/
    engine/                 расчётное ядро: только чистые функции + dataclass, полностью покрыто unit-тестами
      demand.py             спрос по процессам и часовой профиль
      matching.py           жёсткие проверки + скоринг с объяснениями
      sizing.py             время цикла и аналитическое N по модели решения
      layout/               генератор склада (dimensions — вывод геометрии с трассой, warehouse — зоны, стеллажи и граф),
                            graph.py — Дейкстра, средние маршруты, проверка правок редактора
      finance.py            аннуитет, график долга, NPV, IRR, окупаемость
      economics/            costs + opex (статьи CAPEX/OPEX, база, высвобождение ФОТ), financing (кредит, лизинг),
                            cashflow (помесячный поток: внедрение, разгон, индексация, замены), metrics — всё с трассой
      calculation/          сценарий целиком: спрос → N по процессу → экономика; вход — снимок, без БД
      verdict.py            интерпретация по интервалам ТЗ 3.5.7 и риски
      calibration.py        пересчёт модельных кейсов ФЦ БАС нашими формулами и нормативами
      sensitivity.py        торнадо, тепловая карта, Монте-Карло (аналитический)
      simulation/           DES на SimPy: model.py (граф, роботы, задачи), policies.py, kpi.py, events.py
      surrogate.py          метамодель (P2)
      trace.py              построение CalculationTrace из шагов расчёта
    service/                оркестрация: UoW, репозитории, engine, задачи; возвращают domain DTO
    db/                     models/ (ORM), repositories/ (на агрегат), uow.py, session.py
    infra/                  llm/ (providers: gemini, openai, rules), files/ (S3 или локально), reports/ (pdf, xlsx, docx), jobs/ (воркер)
    seeds/                  каталог из case/dataset + research/, нормативы v1 с источниками, демо-проекты, планировки
  tests/
    unit/engine/            эталонные числа, калибровка по ФЦ БАС, свойства (N растёт с объёмом и т.п.)
    integration/            API на реальном Postgres, контрактный тест «FastAPI OpenAPI ⊇ docs/api»
    e2e/                    сценарий демо (ТЗ 8.2.6): проект → подбор → расчёт → симуляция → отчёт
```

Принципы:
- **`engine/` не знает про базу, HTTP и LLM.** Вход — dataclass'ы, выход — dataclass'ы с трассой. Это то, что жюри
  прочитает первым; здесь самый высокий стандарт: типы, докстринги с формулами, тесты.
- **Нормативы — данные, не код.** `engine` получает `NormSet` как аргумент; ни одной числовой константы в теле функций,
  кроме математических (3600 с/ч, 12 мес.). Трасса считает `undocumented_constants` — числа в формулах вне списка
  структурных констант (`service/scenarios/serialize.py`); интеграционный тест требует 0.
- **Симуляция участвует в расчёте:** `service/scenarios/snapshot.py` передаёт в `ItemInput.simulated_robots` N из
  последней успешной симуляции сценария; в трассе виден источник `simulation`.
- **Воспроизводимость:** расчёт сохраняет `VersionStamp` + снимок входов; `rerun` считает на новых версиях и отдаёт дифф.
- **Транзакция на запрос** — `UowDep` (`Depends(..., scope="function")`): коммит выполняется до отправки ответа,
  поэтому упавший коммит превращается в 500, а не в потерянную запись. Сервисы делают только `flush()`.
- **Фоновые задачи** — один воркер-процесс (тот же образ, другая команда), очередь в Redis (arq или taskiq), таблица `jobs`
  в Postgres как источник истины по статусу; SSE читает прогресс из Redis pub/sub.
- **LLM** — `infra/llm/provider.py` с интерфейсом и тремя реализациями; всё, что LLM вернул, проходит Pydantic-валидацию
  и получает статус `llm_suggested`. Без ключа — `rules`.

## 4. Правила кода

1. Python 3.12+, полная типизация, `mypy --strict` на `domain/`, `engine/`, `service/`.
2. `ruff` полный набор (включая `B`, `UP`, `SIM`, `PL` с лимитами сложности), `ruff format`. Длина строки 110.
3. Имена: код и идентификаторы на английском; ключи параметров и нормативов — `snake_case` с единицей в имени
   (`aisle_width_m`, `salary_rub_month`); строки для UI и документации — на русском.
4. Докстринг у каждой функции `engine/`: формула, единицы, источник норматива.
5. Ошибки — только через иерархию `DomainError` → `Problem` с `error_code` из контракта.
6. Никаких `print`; логирование структурное с `request_id`.
7. Тесты: каждая функция `engine/` — unit с эталонными числами (посчитанными вручную в докстринге теста);
   каждый эндпоинт — хотя бы один интеграционный тест; контрактный тест сверяет операции и схемы с `docs/api`.
8. Миграции: только через Alembic autogenerate + ручная проверка; `downgrade` обязателен.
9. PR или коммит меняет одно: контракт, движок, API, фронт. Коммит-сообщение на английском, императив.
10. Перед коммитом: `make check` зелёный; `docs/STATUS.md` обновлён, если сделан заметный кусок.
    Коммитим по ходу работы, каждый логический кусок отдельно.
11. Никаких шапок в начале файла (модульный докстринг, комментарий-описание). Комментарии — только у неочевидных
    строк и про «почему», не «что».

## 5. Фронтенд (для ориентира фронтендеру)

- Каркас `template/frontend` (FSD, shadcn, TanStack Query, react-router 7). Перед стартом почистить: пустые
  каталоги-дубли `* 2`, мёртвые виджеты shadcn с битыми импортами, второй eslint-конфиг, Sentry DSN в env, `tsc -b` в build.
- Типы API — `openapi-typescript` из `docs/api/openapi.bundled.yaml`; тонкий типизированный враппер над существующим
  `axiosInstance` (сохраняет refresh и CSRF); `X-Client: web` в дефолтных заголовках; один `parseApiProblem`.
- Ключи TanStack Query — фабрика по тегам контракта; `QueryClient` с `staleTime` и глобальным `onError`.
- 2D-плеер — canvas + rAF, данные из `SimulationReplay`, интерполяция по рёбрам, pan/zoom через `@use-gesture/react`.
- Русский интерфейс, единицы у полей, работа от 1366×768, тёмная тема не обязательна.

## 6. Производительность и стабильность (бюджеты)

| Операция | Бюджет | Как достигаем |
|---|---|---|
| Открытие каталога, проекта | < 300 мс | индексы, пагинация, без N+1 |
| Расчёт экономики | < 2 с (ТЗ: ≤ 10 с) | чистые функции, без обращений к БД внутри цикла |
| Симуляция суток, ≤ 30 роботов | < 30 с (ТЗ: ≤ 60 с) | SimPy, события буферизуются пачками, KPI считаются на лету |
| Перебор флота 5 значений | < 60 с | параллельно в воркере, `record_events=false` |
| Монте-Карло 2000 прогонов | < 3 с (аналитический) | векторизация numpy |
| 50 одновременных пользователей | без деградации | uvicorn workers, воркер отдельно, Postgres pool |
