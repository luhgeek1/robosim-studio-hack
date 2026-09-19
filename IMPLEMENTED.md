# RoboScope — что реализовано

Живой журнал состояния проекта для команды и AI-агентов. Источник продуктовой истины — `PROJECT_CONTEXT.md`;
здесь — что из него уже сделано, как устроено и что дальше.

## Запуск

```bash
# backend (Python 3.12+)
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000      # Swagger: http://localhost:8000/docs
.venv/bin/pytest -q                                      # 14 тестов цепочки и нормализатора

# frontend
npm install && npm run dev                               # http://localhost:5173, /api проксируется на :8000
```

`docker compose up` поднимает оба сервиса. База — SQLite (`backend/roboscope.db`), PostgreSQL через
`ROBOSCOPE_DATABASE_URL`. Каталог роботов грузится из `catalog_export_v4.csv` при старте (187 решений).

## Статус по функциям PROJECT_CONTEXT §27

| Блок | Статус | Где |
|---|---|---|
| Проект: создание, тип объекта (склад / аэропорт / медучреждение) | готово | `POST /api/projects`, экран «Проекты» |
| Smart Import: xlsx / csv / json / текст → канонические параметры | готово (rule-based), LLM — заготовка | `services/parsers.py`, `services/normalizer.py`, `app/ml/` |
| Data Confidence: подтверждено / предположения / нет данных, вне диапазона | готово | `services/confidence.py`, `GET …/confidence` |
| Валидация (Pydantic + бизнес-правила + диапазоны датасета) | готово | `data/parameters.py`, `services/validator.py` |
| Правка параметров пользователем с пересчётом | готово | `PATCH …/parameters`, инлайн-редактор на экране «Объект» |
| Анализ текущего процесса (профиль нагрузки, ручная мощность, SLA «как сейчас») | готово | `GET …/analysis` (SLA «как сейчас» — из симуляции ручного процесса) |
| Подбор роботов: hard constraints → scoring → why / why not | готово | `services/matching.py`, `GET …/matching` |
| Количество роботов: пиковый поток ÷ эффективная производительность | готово | `services/sizing.py` |
| Экономика: CAPEX / OPEX / TCO / выгода / ROI / окупаемость, кривая 60 мес. | готово | `services/economics.py` |
| Сценарии Current / Purchase / RaaS | готово | `GET …/scenarios` |
| Симуляция (SimPy): очередь, роботы, зарядка, SLA, utilization, события | готово | `services/simulation.py`, `GET …/simulation` |
| Рекомендация: минимальная конфигурация, выполняющая SLA в бюджете; «почему 3 / не 2 / не 4» | готово | `services/recommendation.py`, `services/explain.py` |
| 3D digital twin, связанный с KPI симуляции; демо-сценарий 3 → 2 → 3 | готово | `src/twin/`, экран «Симуляция» |
| Отчёт / executive summary | JSON готов, PDF — позже | `POST …/report` |
| Аэропорт, медучреждение | импорт + достоверность данных; расчётные модули — позже | `data/parameters.py` (AIRPORT, MEDICAL) |
| LLM Smart Import, LLM Explanation | заготовка + инструкция | `backend/app/ml/README.md` |

## Как устроен расчёт (все числа считает код, не LLM)

1. **Парсер** превращает файл в плоский список `{field, value, unit}`; **нормализатор** сопоставляет поля
   с реестром параметров (алиасы, единицы: мм → м, тыс. → ₽, «до 15 млн» → 15), хранит исходную строку и confidence.
   Недостающие параметры берутся из типовых значений датасета как *предположения*; без дефолта — «нет данных».
2. **Site** (`services/site.py`) — производные величины: средний и пиковый поток, часовой профиль, ручная
   мощность (10,2 паллеты/ч на оператора с учётом потерь времени), стоимость FTE, текущий OPEX.
3. **Matching**: жёсткие проверки (тип груза, грузоподъёмность ≥ 1,5 × средней паллеты, ширина проходов
   с запасом 0,5 м, ровность пола, УГТ ≥ 7), затем score: производительность 25 %, стоимость конфигурации 25 %,
   инфраструктура 15 %, зрелость 15 %, качество данных 10 %, внедрения 10 %.
4. **Sizing**: эффективная производительность = номинал × доступность (батарея/зарядка, простои) ×
   фактор расстояния (площадь зоны); мощность флота теряет 4 % на каждого следующего робота (помехи в проходах).
5. **Simulation**: партии паллет (фуры, волны заказов) по часовому профилю; роботы работают циклом
   приёмка → хранение → комплектация → отгрузка, заряжаются; задача «в срок», если ждала ≤ норматива (20 мин);
   ждавшие дольше 3× норматива уходят людям. Режим «пик» — 8 часов на пиковой интенсивности.
6. **Economics**: CAPEX = роботы + интеграция 1,2 + зарядные 0,17/робот + ПО 0,5 (+ разметка 0,9) + резерв 10 %.
   Роботы вытесняют транспортную часть работы операторов (по умолчанию 40 % штата, 1 оператор в смену на робота,
   лишние роботы — вполовину), необработанный поток возвращается людям, опоздания стоят 20 ₽/паллета.
   Кривая: 3 месяца внедрения, 6 месяцев разгона, индексация зарплат 8 %/год. RaaS: 4,5 % цены в месяц + 0,6 запуск.
7. **Recommendation**: перебирает `required−1 … required+1`, выбирает минимальное количество с SLA ≥ цели
   и CAPEX ≤ бюджета; объяснения строятся из чисел этих конфигураций.

Демо-проект (`backend/sample_data/warehouse_moscow_01.json`): 3 × Ronavi H1500, 11,3 млн ₽, окупаемость 2,0 года,
ROI 248 %, SLA 99 %; 2 робота — SLA ≈ 30 %, не окупаются; 4 — простой 52 %, ROI 211 %.

## API (все под `/api`)

`GET object-types` · `GET/POST projects` · `GET/DELETE projects/{id}` · `POST projects/{id}/import` (multipart) ·
`POST projects/{id}/import/demo` · `GET/PATCH projects/{id}/parameters` · `GET projects/{id}/confidence` ·
`PUT projects/{id}/selection` · `GET projects/{id}/export` · `GET projects/{id}/analysis` · `GET projects/{id}/matching` ·
`GET projects/{id}/configurations?robot_id` · `GET projects/{id}/simulation?robot_id&count&load` ·
`GET projects/{id}/scenarios?robot_id&count` · `GET projects/{id}/recommendation?robot_id&count` · `POST projects/{id}/report` ·
`GET catalog/robots` · `GET catalog/robots/{id}` · `GET health`.

Результаты кэшируются в `calculation_results` / `simulation_runs` по версии проекта; правка параметра поднимает версию.

## Фронтенд

Vite + React 19 + TypeScript + Tailwind 4, three.js (react-three-fiber), zustand, framer-motion. Все экраны берут
данные из API (`src/api.ts`, кэш `src/query.ts`). 3D-двойник анимирует роботов локально, но очередь, загрузка зон,
utilization, SLA и экономика приходят из симуляции бэкенда; график «очередь в течение дня» строится по её событиям.

## Что дальше

- ML: LLM-провайдеры импорта и объяснений (см. `backend/app/ml/README.md`).
- Расчётные модули для аэропорта и медучреждения (реестры параметров уже есть).
- PDF-отчёт, выгрузка в PostgreSQL в проде, авторизация (non-goal для MVP).
- Воспроизведение событий симуляции в 3D один-в-один (сейчас двойник ведёт себя по KPI, события доступны в API).
