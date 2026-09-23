# РобоМера — экспресс-оценка роботизации объекта

Хакатон ЛЦТ 2026, задача №1 (ДПиИР Москвы + АНО «ФЦ БАС»). Каталог роботов → объяснимый подбор под объект →
количество и экономика (как сейчас / покупка / RaaS) → 2D-имитация, подтверждающая расчёт → отчёт PDF/Excel.

## Запуск

```bash
make up        # docker compose: Postgres, Redis, миграции, API http://localhost:8000/api/docs, воркер
make check     # линтеры, типы, тесты, линт контракта
```

Демо-учётки (пароль `Demo12345!`): `admin@robomera.demo`, `user@robomera.demo`, `vendor@robomera.demo`.

## Где что

- `backend/` — API и расчётное ядро (FastAPI, PostgreSQL, Alembic, Redis + arq). Стандарт — `docs/ENGINEERING.md`.
- `frontend/` — веб-клиент.
- `docs/api/` — OpenAPI-контракт, источник истины по API; `docs/CONTRACTS.md` — модель и договорённости.
- `docs/` — продукт, решения, статус, данные; точка входа для разработчиков и ассистентов — `AGENTS.md`.
