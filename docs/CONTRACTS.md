# Контракты: доменная модель и API

> **Статус: ЧЕРНОВИК.** Модель выведена из ТЗ (3.1–3.8) и данных. Финальная версия — после решения Q-001 (основа кода).
> Когда API появится в коде, источником истины станет OpenAPI из FastAPI, а здесь останутся модель и договорённости.

## Принципы

1. **Происхождение у каждого значения.** Любая характеристика продукта, параметр объекта или норматив хранится как
   `value + unit + source_id + as_of + status`. `status`: `confirmed` (подтверждено источником) / `default` (норматив
   по умолчанию) / `assumption` (допущение команды с обоснованием) / `user` (ввёл пользователь) / `missing`.
2. **Воспроизводимость.** Каждый расчёт сохраняет снимок входов и версии: `catalog_version`, `norms_version`,
   `model_version`, `inputs_hash`. Проект можно переоткрыть и получить тот же результат (ТЗ 3.1.5).
3. **Ручная правка — это событие.** Переопределение автозначения пишется в журнал: кто, когда, было → стало (ТЗ 3.5.4).
4. **Расширяемость через справочники, а не код.** Новый тип объекта = новые записи в `object_types`, `parameter_defs`,
   `processes` + шаблон планировки. Ядро не меняется (ТЗ 2, 4.2.6).

## Сущности

```
Справочники и каталог
  Industry            отрасль (9 из каталога ФЦ БАС)
  ObjectType          склад | аэропорт | медучреждение | …  (industry_id)
  Process             процесс объекта: перемещение паллет, отбор, уборка, доставка питания…  (object_type_id)
  SolutionType        AMR | FMR | штабелёр | тягач | уборщик | система хранения | …
  ProcessSolution     какие типы решений применимы к процессу (M:N) + правила подбора
  Product             продукт каталога (id из CSV, производитель, название, статус, УГТ, регион, страна)
  ProductOffer        предложение продукта в отрасли: сценарий, кейсы, цена с НДС (дубли CSV = разные offers)
  ProductSpec         ТТХ: product_id, key, value, unit, source_id, as_of, status  (6 групп ТЗ 3.3)
  Source              url | файл | «организатор» | «допущение команды», title, retrieved_at, kind
  Badge               «Есть в 719», «Протестировано ФЦ БАС», …

Нормативы
  ParameterDef        object_type_id, key, group, unit, type, required, min, max, default, source_id, hint, example
  Norm                ключевой коэффициент модели: key, value, unit, source_id, rationale, affects[]
  NormSet             версия набора нормативов (админ публикует новую → старые расчёты сохраняют свою)

Пользователи и проекты
  User, Role          guest | user | admin  (vendor — опционально)
  Project             owner_id, object_type_id, name, created_at, updated_at, version
  ProjectParam        project_id, key, value, unit, status, source_id, raw_value (из файла), changed_by, changed_at
  Scenario            project_id, kind: baseline | purchase | raas | lease, name, overrides{}
  ScenarioItem        scenario_id, process_id, product_offer_id, count, count_source: analytic | simulated | manual
  CalculationRun      scenario_id, inputs_hash, catalog_version, norms_version, model_version, results{}, created_at
  SimulationRun       scenario_id, config{}, seed, status: queued | running | done | failed, kpis{}, events_ref
  AuditEvent          кто, когда, сущность, было → стало
```

## API (контур)

Префикс `/api/v1`. Авторизация — JWT; гость — без токена, только чтение каталога и демо-проекта.

| Группа | Эндпоинты |
|---|---|
| auth | `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /me` |
| справочники | `GET /object-types`, `GET /object-types/{id}/parameters` (схема формы), `GET /object-types/{id}/processes` |
| каталог | `GET /products?filters&sort&q`, `GET /products/{id}`, `POST /products/compare`, admin: `POST/PATCH/DELETE /products`, `POST /catalog/import` (CSV), `POST /catalog/enrich` |
| нормативы | `GET /norms?version`, admin: `POST /norm-sets` (новая версия) |
| проекты | `GET/POST /projects`, `GET/PATCH/DELETE /projects/{id}`, `POST /projects/{id}/copy`, `GET /templates/{object_type}.xlsx`, `POST /projects/{id}/import`, `PATCH /projects/{id}/params`, `GET /projects/{id}/validation` |
| подбор | `GET /projects/{id}/matching` → по процессам: продукты со статусом, причинами, недостающими данными, вкладами в скоринг |
| сценарии | `GET/POST /projects/{id}/scenarios`, `PATCH /scenarios/{id}`, `POST /scenarios/{id}/calculate` → `CalculationRun` |
| риски | `POST /scenarios/{id}/sensitivity` (торнадо), `POST /scenarios/{id}/monte-carlo` |
| имитация | `POST /scenarios/{id}/simulations` → `{run_id}`, `GET /simulations/{run_id}` (статус + KPI), `GET /simulations/{run_id}/events` (журнал для воспроизведения) |
| отчёт | `GET /projects/{id}/report.pdf`, `GET /projects/{id}/report.xlsx` |

## Контракт симуляции → фронт (черновик)

Бэкенд считает, фронт только воспроизводит. Журнал событий компактный, фронт интерполирует движение между узлами.

```json
{
  "layout": {"width_m": 125, "height_m": 80,
             "zones": [{"id": "dock_in", "kind": "receiving", "polygon": [[0,0],[20,0],[20,15],[0,15]]}],
             "nodes": [{"id": "n1", "x": 10, "y": 7}], "edges": [{"from": "n1", "to": "n2", "length_m": 12.5, "capacity": 1}],
             "chargers": ["n40"]},
  "robots": [{"id": "R1", "model": "Ronavi H1500"}],
  "events": [
    {"t": 12.4, "robot": "R1", "type": "move",   "path": ["n1", "n2", "n7"], "eta": 31.0},
    {"t": 31.0, "robot": "R1", "type": "load",   "task": "T15", "dur": 20},
    {"t": 95.2, "robot": "R3", "type": "wait",   "edge": "n7-n8", "reason": "aisle_busy"},
    {"t": 3600, "robot": "R2", "type": "charge", "charger": "n40", "dur": 1080},
    {"t": 7210, "robot": "R4", "type": "fail",   "dur": 1800}
  ],
  "kpis_timeline": [{"t": 3600, "done": 131, "demand": 136, "queue": 4, "sla": 0.97, "util": 0.81}],
  "summary": {"throughput_per_h": 131, "sla": 0.96, "utilization": 0.79, "charging_share": 0.11,
              "congestion_top": [{"edge": "n7-n8", "wait_s": 812}]}
}
```
