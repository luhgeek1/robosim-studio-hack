# RoboScope backend

FastAPI + SQLAlchemy (SQLite по умолчанию, PostgreSQL через `ROBOSCOPE_DATABASE_URL`) + SimPy.

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000     # http://localhost:8000/docs
.venv/bin/pytest -q
```

Цепочка: `parsers → normalizer (Smart Import) → validator → confidence → matching → sizing →
economics → simulation (SimPy) → recommendation`. Все расчёты детерминированы (seed в настройках).
Кэш результатов — таблицы `calculation_results` и `simulation_runs`, ключ — версия проекта.

ML-часть: см. `app/ml/README.md`.
