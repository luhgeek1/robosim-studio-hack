# Контракты: доменная модель и API

> Источник истины по API — `docs/api/openapi.yaml` (+ `paths/`, `components/`; склейка `openapi.bundled.yaml`).
> Этот файл — карта и договорённости, которые не выразить в YAML. Как запускать линт, mock и генерацию типов —
> `docs/api/README.md`. Любое изменение контракта фиксируется внизу в «Изменениях».

## Принципы

1. **Происхождение у каждого значения.** Параметры объекта, ТТХ продуктов и нормативы несут `provenance`:
   `status` (`user` / `imported` / `llm_suggested` / `default` / `assumption` / `derived` / `confirmed` / `vendor_claim` / `missing`),
   `source` (вид, название, URL, дата), `confidence`, `raw_value`. Фронт показывает статус бейджем везде, где есть число.
2. **Воспроизводимость.** Расчёт и симуляция хранят `VersionStamp` (версии проекта, каталога, нормативов, движка, планировки,
   хэш входов). `POST /calculations/{id}/rerun` считает на актуальных версиях и отдаёт дифф с причинами.
3. **Ручная правка — событие.** Изменение параметра, переопределение норматива, ручное добавление продукта пишутся
   в журнал (`/projects/{id}/audit`, `/params/{key}/history`) и меняют версию проекта → расчёты становятся `stale`.
4. **Симуляция определяет N.** `ScenarioItem.count_result` показывает `analytic`, `simulated`, `reserve`, `final`
   и `source`; при `use_simulation=true` (по умолчанию) экономика берёт `final` из последней успешной симуляции.
5. **Расширяемость через справочники.** Новый тип объекта = `ObjectType` + `ParameterDef` + `ProcessDef` +
   шаблон планировки + сиды. Код ядра не меняется.
6. **Гость видит каталог и демо**, всё остальное — с токеном; админ и вендор — по permissions.

## Доменная модель

```
Справочники        ObjectType ─┬─ ParameterGroup ─ ParameterDef (ключ, единица, диапазон, default: PValue)
                               └─ ProcessDef (спрос, SLA, группы персонала, SolutionType[])
                   SolutionType (модель расчёта: transport_cycle | goods_to_person | area_coverage | …)
                   NormSet (версия) ─ Norm (значение, единица, источник, обоснование, affects[])

Каталог            Manufacturer ─ Product ─┬─ ProductOffer (отрасль, сценарий, цена с НДС; дубли CSV = offers)
                                           ├─ Spec (6 групп ТЗ, provenance, is_key_constraint)
                                           ├─ ProductCase (внедрения)
                                           └─ Badge (719, tested_fcbas, specs_confirmed, …)
                   EnrichmentJob ─ EnrichmentProposal (LLM предложил → админ принял)

Проект             Project ─┬─ ProjectParam (value, provenance, validation, history)
                            ├─ Layout (zones, racks, nodes, edges, stats) — версия
                            ├─ MatchingResult ─ ProcessMatching ─ Candidate (status, reasons, score_breakdown)
                            └─ Scenario (kind, items[ScenarioItem], financing, horizon, overrides)
                                  ├─ CalculationRun (sizing, capex, opex, effect, cashflow, metrics, interpretation, risks, trace)
                                  ├─ SimulationRun (config, summary, timeline, replay events, heatmap)
                                  ├─ SensitivityResult / MonteCarloResult / SurveyPriorities
                                  └─ Report (pdf | xlsx | docx)
Платформа          User (role) ─ ApiKey;  Job (фоновая задача);  AuditEvent;  Rfq;  SupportMeasure
```

## Статусы, которые видит пользователь

| Сущность | Статусы | Как показывать |
|---|---|---|
| Кандидат подбора | `fit` / `check` / `excluded` / `manual` | «Подходит» / «Требует проверки» / «Не подходит» / «Добавлено вручную» + причины |
| Расчёт | `fresh` / `stale` | «Актуален» / «Параметры изменились — пересчитать» |
| Задача | `queued` / `running` / `done` / `failed` / `cancelled` | прогресс-бар со `stage`, SSE |
| Происхождение | см. `ProvenanceStatus` | бейдж: «Вы ввели», «Из файла», «Предложил ассистент», «По умолчанию (источник)», «Допущение», «Подтверждено», «Заявка вендора», «Нет данных» |
| Вердикт | `attractive` / `reasonable` / `questionable` / `not_recommended` / `insufficient_data` | цвет + заголовок + диапазон окупаемости |

## Как устроен путь пользователя в терминах API

1. `POST /projects` (blank / demo / copy) → `GET /object-types/{key}` (схема формы) → `PUT /projects/{id}/params`
   или `POST …/import` → `POST …/import/{id}/apply` → `GET …/validation`, `GET …/data-quality`.
2. `GET …/processes` — «где деньги» → `GET …/matching` (+ `POST …/matching` с весами, `POST …/matching/manual`).
3. `POST …/layout/generate` (или `PUT …/layout` из редактора).
4. `POST /projects/{id}/scenarios` (`from_recommendation: true` — заполнить лучшими) → копии для `raas` / `lease`.
5. `POST /scenarios/{id}/simulations` → SSE → `GET /simulations/{id}` (summary, `vs_analytic`, `bottleneck`)
   → `POST /scenarios/{id}/fleet-sweep` для кривой N.
6. `POST /scenarios/{id}/calculate` → `GET /calculations/{id}/trace` → `GET /projects/{id}/comparison`.
7. `POST /scenarios/{id}/sensitivity`, `POST …/monte-carlo`, `GET …/survey-priorities`.
8. `POST /projects/{id}/reports` (pdf / xlsx / docx) → `GET /reports/{id}/download`.
   Опционально: `POST …/assist/explain`, `GET /calculations/{id}/narrative`, `GET /support-measures`, `POST …/rfq`.

## Контракт симуляции → 2D-плеер

- `SimulationReplay` = планировка (`Layout`) + роботы (`id`, процесс, модель, габарит, скорость) + окно событий
  `[from_s, to_s)` + `tasks_snapshot` на начало окна. Плеер держит буфер на следующее окно (`next_from_s`).
- Событие `move`: `path` — узлы, `eta` — момент прибытия; плеер интерполирует положение по рёбрам с постоянной
  скоростью между `t` и `eta`. Остальные типы (`load`, `unload`, `wait`, `charge`, `fail`, `idle`) — состояние в узле
  на `dur` секунд; `wait` несёт `edge` и `reason` для подсветки затора.
- KPI для панели — из `SimulationTimeline` (шаг 5 мин) и `summary`; тепловая карта — `SimulationHeatmap`.
- Управление плеером (старт / пауза / скорость / перемотка) — на фронте; «перезапустить с другим N» —
  новый `POST …/simulations` с `fleet_override`.
- Снимок для отчёта — фронт рендерит PNG и грузит в `POST /simulations/{id}/visuals`.

## Что бэкенд гарантирует по времени

- `calculate` синхронный, ≤ 10 с (цель < 2 с). `sensitivity` и аналитический `monte-carlo` — синхронные.
- `simulations`, `fleet-sweep`, `reports`, `enrich`, `monte-carlo` (surrogate / des) — 202 + задача, прогресс по SSE.
- Ответы списков — не более `page_size` ≤ 200 элементов.

## Что ещё не решено в контракте

- Формат `hourly_profile` для аэропорта (двухпиковый) и больницы (три кормления) — пока массив из 24 долей, хватит.
- Нужен ли отдельный `PATCH /scenarios/{id}/items/{item_id}` — пока состав меняется целиком через `PATCH /scenarios/{id}`.
- Роль `vendor`: эндпоинты предложений правок карточек не описаны (Q-009).

## Изменения

| Дата | Версия | Что |
|---|---|---|
| 2026-09-23 | 0.5.1 | Аудит: поля, которые бэкенд отдаёт как `null`, помечены nullable — `Project.headline_metrics`, `ScenarioItem.candidate_status`, `Norm.range`, `ProcessDef.sla`, `Calculation.calibration`, `robot.utilization_target`, `ProcessDemand` (`demand_per_day`, `avg/peak_per_hour`, `hourly_profile`, `profile_provenance`), `ProcessDemandList.peak_factor`, `ProcessMatching.demand_summary`, `AuditEntry.before/after`, импорт `conflict_with_current`, чувствительность `heatmap` и `provenance_status`, имитация `chargers.energy_kwh`, `baseline`, `queue_avg`, `footprint_m`, `Report.versions`. `SimulationReplay.layout` — новая схема `LayoutPlan` (снимок схемы прогона). `downloadFile` отдаёт PNG/GIF/JPEG/PDF. `uploadSimulationVisual`: `chart_png`, 413, 415. Правило: 400/401/403/404/422/429 может вернуть любая операция (`docs/api/README.md`); тесты бэкенда сверяют каждый ответ с контрактом |
| 2026-09-23 | 0.5.0 | Отчёты. `createReport` — фоновая задача (202), форматы `pdf`, `xlsx`, `json`; `docx` пока 422. `Report`: `job_id`, `error` (Problem, если сборка не удалась). `live_formulas: false` — Excel только со значениями. Новый `GET /files/{file_id}` (`downloadFile`) отдаёт снимки имитации и подложки владельцу проекта. `Cashflow.upfront_rub` — платёж в момент 0 (CAPEX или первый взнос), с ним сходятся накопленный поток и NPV |
| 2026-09-23 | 0.4.0 | Имитация. `SimulationRun`: `purpose` (`run` / `sweep`), `job_id`, `events_count`. `SimulationSummary.skipped_processes` — процессы, которые движок пока не имитирует; `baseline` = null (`compare_baseline` по умолчанию false, не поддерживается). `FleetSweepRequest.from_count/to_count` допускают null (поиск вместо полного перебора). `FleetSweepResult`: `recommended_count` допускает null, добавлены `analytic_count`, `target_pct`, `simulation_id`, `applied`, у точек — `sla_min_pct`, `passed`, `runs`. Перебор записывает N в сценарий: `count_result.source = simulated`. Параметр `robots` у реплея — через запятую |
| 2026-09-23 | 0.3.0 | Планировка. `Layout`: `template`, `stats` (`LayoutStats`: `avg_route_m`, `routes[]` с числом усреднённых пар, `docks_in/out`, `pods`, `nodes`, `edges`), `derivation[]` — шаги вывода геометрии с формулами, `warnings[]`, `params_changed`, в `generator` — `overrides`, `params`, `project_version`. `LayoutTemplate`: `warehouse_u_flow` (по умолчанию) и `warehouse_flow_through`; у `LayoutGenerateRequest.overrides` описаны ключи, неизвестный ключ — 409. Новая операция `GET …/layout/background` (`getLayoutBackground`), у загрузки подложки — 404 и 413. `TraceInput.kind` — добавлен `layout` (маршрут из планировки), `NormCategory` — `layout`. Генерация и правка повышают `project_version`: расчёты становятся stale; демо-склад создаётся сразу с планировкой |
| 2026-09-22 | 0.2.0 | Сценарии и расчёт. `ScenarioItem` и `ScenarioItemWrite`: своя цена и производительность с обязательной причиной (`price_override_rub`, `throughput_override_per_hour`, `override_reason`, ТЗ 3.5.3–3.5.4), в ответе — `price_rub` и `price_source`; `offer_id` допускает `null`. `Interpretation`: вердикт `baseline` и интервал `none` для базового сценария. `SizingResult.robot.cycle_time_s` и `effective_throughput_per_hour` допускают `null` (площадные модели, ручное количество). `CalculationRun.calibration`: `within_tolerance` и `checks[]` — каждое число модельного кейса ФЦ БАС против нашего. `SensitivityResult.items[].kind`: добавлены `catalog` и `group`. `runMonteCarlo`: `surrogate` и `des` отвечают 409, пока нет имитации |
| 2026-09-22 | 0.1.1 | `SolutionType.sizing_model` допускает `null`: категории каталога вне складских, аэропортовых и больничных процессов (дроны, морские, агро) не имеют модели расчёта |
| 2026-09-22 | 0.1.0 | Первая полная версия: 107 операций, 190 схем. План максимум: каталог, проекты, планировка, подбор, сценарии, расчёт с трассой, сравнение, чувствительность, Монте-Карло, приоритеты обследования, симуляция с реплеем, отчёты, ассистент, демо гостя, меры поддержки, RFQ, админка, интеграции |
