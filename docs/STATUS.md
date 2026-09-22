# Статус

_Обновлено: 2026-09-22. До дедлайна (29.09, 23:59 МСК) — 7 дней, сдаём 28.09._

## Где мы

Разработка. **Веха 1 (каркас) закрыта:** `make up` поднимает db → миграции → API → воркер, `/api/v1/ready` = ok.
Реализовано 12 из 107 операций контракта: system (health, ready, version, jobs/{id}), auth (register, login, refresh,
logout), me (get, patch), api-keys (list, create, revoke).

## Что готово

- `backend/` по `docs/ENGINEERING.md` §3: `create_app(settings)`, Problem с `error_code` из контракта на любую ошибку,
  `X-Request-ID` + JSON-логи, RBAC на permissions (`guest/user/admin/vendor`), `CurrentUser` вместо ORM,
  одна транзакция на запрос (`UowDep`, коммит до отправки ответа), refresh-ротация с отзывом в Redis и CSRF для web,
  rate limit на login/register, ключи API (хэш, scope не шире роли), идемпотентные сиды демо-учёток, arq-воркер с heartbeat.
- Миграция `20260922_0001` (users, api_keys, jobs; PG enum, naming convention, рабочий downgrade).
- Тесты: 34 (unit + integration на реальных Postgres/Redis + контрактный: операции бэкенда ⊆ `docs/api`,
  operationId и 2xx совпадают). `make check` — ruff, format, mypy (strict на domain/service), pytest, линт контракта.
- Фронт v0 перенесён в `frontend/`; v0-бэкенд — в `legacy/backend-v0/`, тег `v0-prototype`.
- Документы планирования (D-003…D-013), контракт `docs/api/` (107 операций), `research/` — см. прошлые записи в git.

## Дальше (порядок)

1. **Сиды:** каталог из `case/dataset` + ТТХ из `research/catalog_specs/` + бейджи; нормативы v1 с источниками;
   справочники ObjectType/ParameterDef/ProcessDef; демо-проекты трёх типов. API: reference + catalog.
2. **Ядро** `engine/`: demand → matching → sizing → economics + trace; эталонные тесты; калибровка по ФЦ БАС.
3. **Симуляция:** генератор планировки → DES на графе → summary/timeline/replay → fleet-sweep → N в экономику.
4. **API** по порядку из `docs/api/README.md`; фронт снимает моки по мере готовности.
5. Отчёты (PDF, Excel с формулами), чувствительность, Монте-Карло, приоритеты обследования.
6. Ассистент, демо гостя, админка, интеграции; аэропорт и больница на уровне параметров и подбора.
7. Документация, презентация, видео демо, сдача **28.09**.

Фронтендер: каркас из `template/frontend` в `frontend/` → типы из контракта → экраны на моках → 2D-плеер.

## Технический долг

- CI не настроен: ворота пока `make check` локально. Шаг: пайплайн SourceCraft после переезда (Q-010).
- `version` отдаёт `catalog_version`/`norm_set_version` = `none` — заменить на реальные версии вместе с сидами каталога.
- `legacy/backend-v0/` удалить после переноса логики (до сдачи).
- Логи arq дублируются (свой обработчик arq + наш JSON) — выключить обработчик arq.

## Риски

- 7 дней на план максимум: держим порядок выше, ежедневно обновляем этот файл, режем P2 первыми.
- Платформа сдачи ложилась от нагрузки (15.09): сдаём 28.09.
- Шаблон презентации ЛЦТ ещё не скачан (R10 в `docs/RESEARCH.md`) — сделать до 25.09.
- LLM из docker жюри может быть недоступен — fallback обязателен (D-008).
- Ставка НДС и финансовые нормативы 2026 не подтверждены источниками (R6) — до реализации экономики.
