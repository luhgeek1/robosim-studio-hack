# Фронтенд: план MVP и карта экранов

Решение — D-018. Видение и путь пользователя — `docs/PRODUCT.md`, контракт — `docs/api/`, стандарт — `docs/ENGINEERING.md` §5.
Здесь — что на каком экране, из каких эндпоинтов, и что готово.

## Принципы

- MVP делаем мы (Марк + Claude) на живых эндпоинтах; фронтендер потом рестайлит и развивает. Логику данных (хуки,
  типы, адаптеры) рестайл не трогает: меняются `ui/` и токены темы.
- Всё, что показывает число, показывает и его происхождение: бейдж `provenance.status`, формула по клику.
- Фронт ничего не считает и не анимирует «для вида»: KPI, N роботов, деньги — только из ответов бэкенда.
  Имитация — только воспроизведение `SimulationReplay` (D-006).
- Русский интерфейс, единицы у полей, подсказки из `ParameterDef.hint`/`example`, работа от 1366×768.

## Стек

Vite + React 19 + TypeScript strict, Tailwind 4 + shadcn/ui (radix, стиль nova), TanStack Query 5, react-router 7, axios
с single-flight refresh и CSRF (перенесён из `template/frontend`), recharts, sonner. Типы — `openapi-typescript`
из `docs/api/openapi.bundled.yaml` (`npm run gen:api`). Без i18n, Sentry и PWA — не нужны для кейса.

Раскладка FSD: `app/` (провайдеры, роутер, стили) → `pages/` → `widgets/` → `features/` → `entities/` → `shared/`
(`api/` клиент и схема, `ui/` shadcn, `lib/` форматирование). Импорт только вниз по слоям; `entities/provenance`
(бейдж происхождения, формула) — базовая сущность, её импортируют другие сущности.

## Соглашения для рестайла

- **Типы ответов — из контракта:** `Res<'/api/v1/…', 'get'>` в `entities/*/api.ts`. Расхождение YAML и экрана ломает
  `tsc`, а не демо. После правки контракта: `npm run gen:api`.
- **Данные — в `entities/*/api.ts`** (запросы и хуки TanStack Query, ключи — `shared/api/keys.ts`); экраны их только
  читают. Рестайл меняет `pages/`, `widgets/`, `shared/ui/` и токены в `app/index.css`, хуки не трогает.
- Ошибки — один формат `Problem`: `parseApiProblem` / `problemText`; ошибки мутаций показываются тостом глобально.
- Тема: токены shadcn + свои `ok / warn / crit / info` (`bg-ok-soft text-ok`…), класс `num` — табличные цифры.
- Деньги приходят в рублях, на экране — `formatRub` (млн ₽); формулы и входы — компонент `Formula`.

## Экраны и эндпоинты

| Маршрут | Экран | Эндпоинты | Статус |
|---|---|---|---|
| `/login` | Вход, регистрация, кнопки демо-учёток | `login`, `register`, `refreshTokens`, `getMe` | MVP |
| `/catalog` | Каталог (гость): поиск, фильтры, сортировка, выбор в сравнение | `listProducts`, `getCatalogFacets` | MVP |
| `/catalog/:productId` | Карточка: ТТХ по 6 группам с бейджами, предложения, внедрения, источники | `getProduct` | MVP |
| `/catalog/compare` | Сравнение 2–5 продуктов, лучшее значение подсвечено | `compareProducts` | MVP |
| `/projects` | Проекты: сводка, создать (пустой / демо), копировать, удалить | `listProjects`, `createProject`, `copyProject`, `deleteProject`, `listObjectTypes` | MVP |
| `/projects/:id` | Обзор: статус, панель доверия, путь по шагам, журнал | `getProject`, `getProjectDataQuality`, `listProjectAudit` | MVP |
| `…/object` | Параметры по группам: правка, валидация, импорт Excel, шаблон | `listProjectParams`, `updateProjectParam`, `resetProjectParam`, `getProjectValidation`, `importProjectParamsFile`, `applyImport`, `downloadImportTemplate` | MVP |
| `…/processes` | «Где деньги»: спрос, пик, ФОТ по процессам, часовой профиль | `getProjectProcesses` | MVP |
| `…/matching` | Подбор по процессам: подходит / проверить / исключено, причины, скоринг, веса | `getMatching`, `runMatching` | MVP |
| `…/layout` | 2D-схема склада, маршруты, вывод геометрии, перегенерация | `getLayout`, `generateLayout` | MVP (редактор — дальше) |
| `…/scenarios` | Сценарии: из рекомендации, копия, удаление | `listScenarios`, `createScenario`, `copyScenario`, `deleteScenario` | MVP |
| `…/scenarios/:sid` | Состав, финансирование, горизонт; расчёт: N, CAPEX/OPEX/эффект с формулами, поток, вердикт, риски, калибровка, трасса | `getScenario`, `updateScenario`, `calculateScenario`, `getCalculation`, `getCalculationTrace`, `getCalculationNarrative` | MVP |
| `…/comparison` | Как сейчас / покупка / RaaS / лизинг, рекомендация, кривые | `getComparison` | MVP |
| `…/risks` | Торнадо, тепловая карта «ФОТ × объём», Монте-Карло, что замерить | `runSensitivity`, `runMonteCarlo`, `getSurveyPriorities` | MVP |
| `…/simulation` | 2D-плеер по журналу событий, KPI, перебор флота, узкое место | `/simulations/*`, `fleet-sweep` | ждёт бэкенд (DES) |
| `…/report` | PDF / Excel / DOCX | `/reports/*` | ждёт бэкенд |
| `/demo`, `/admin` | Демо гостя, админка каталога и нормативов | `/demo/*`, `/admin/*` | ждёт бэкенд |

Пункты «ждёт бэкенд» видны в навигации неактивными с подписью «скоро» — жюри видит полный путь.

## Порядок работ

1. Каркас: перенос v0 в `legacy/frontend-v0/` (3D-карта — тег `v0-twin-3d`), новый `frontend/`, клиент API, типы,
   авторизация, оболочка с навигацией.
2. Каталог → проекты → объект → процессы → подбор → планировка → сценарии и расчёт → сравнение → риски.
3. Имитация: плеер на canvas по `SimulationReplay` сразу после эндпоинтов DES; затем отчёты, демо гостя, админка.
4. Рестайл фронтендером; 3D-вид на тех же событиях — P2.

## Запуск

```bash
cd frontend && npm install
npm run dev          # :5173, /api проксируется на VITE_PROXY_TARGET (по умолчанию http://127.0.0.1:8000)
npm run gen:api      # типы из docs/api/openapi.bundled.yaml
npm run check        # tsc + oxlint + prettier --check + сборка
```

Без бэкенда: Prism-мок (`docs/api/README.md`) и `VITE_PROXY_TARGET=http://127.0.0.1:4010`.
В составе стека: `make up` поднимает и фронт — http://localhost:3000 (nginx раздаёт сборку и проксирует `/api` на бэкенд).
