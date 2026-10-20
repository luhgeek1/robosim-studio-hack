# Подключение Google, Яндекс ID и VK ID

Инструкция для текущей реализации РобоМеры, проверена по официальным материалам 20.10.2026.
Приложения создаются в твоих кабинетах; здесь нет реальных ключей. Устройство аккаунтов — [AUTH.md](AUTH.md).

Состояние на 21.10.2026: Google и Яндекс включены в `robomera-api` через Fly Secrets; API и воркер обновлены на том же образе
main `0d9f572`. Проверены `enabled: true`, readiness и переходы с production-формы к страницам входа Google/Яндекса с PKCE.
В Google Console пока Testing с добавленными тестовыми аккаунтами (по скриншоту пользователя); для публичного
запуска нужно завершить Branding/Audience. Полный вход и callback с реальным аккаунтом ещё требуют проверки пользователем.
VK и отправка писем пока не включены. Локальная копия credentials Яндекса — `.secrets/yandex/.env` с правами `0600`;
файл игнорируется Git и Docker (`**/.env`), папка дополнительно исключена локальным `.git/info/exclude`.
Секреты и исходный JSON не попадают в Git. Полный вход с реальным аккаунтом Яндекса ещё требует проверки пользователем.

## Адреса, которые нужно скопировать

Основной адрес сайта — `https://prooood.ru`. Внешний API доступен через этот же origin, с префиксом `/api`.

| Сервис | Полный Redirect URI / Redirect URL |
|---|---|
| Google | `https://prooood.ru/api/v1/auth/oauth/google/callback` |
| Яндекс ID | `https://prooood.ru/api/v1/auth/oauth/yandex/callback` |
| VK ID | `https://prooood.ru/api/v1/auth/oauth/vk/callback` |

В callback не добавляй query, fragment или завершающий `/`. Домен почты `mail.prooood.ru` для OAuth не используется.
При отдельном тестовом стенде создай отдельные приложения с его доменом и теми же путями callback.

Подготовь название «РобоМера», квадратный логотип и актуальный контактный email. Если кабинет запрашивает
политику конфиденциальности или условия сервиса, нужны реально опубликованные страницы. В этой ветке отдельных
публичных страниц с такими документами пока нет; не указывай выдуманные URL.

## Google

1. Открой [Google Cloud Console](https://console.cloud.google.com/) и создай или выбери проект, например `robomera`.
2. В **Google Auth platform → Branding** запусти **Get started**, укажи название, почту поддержки и контакты.
   В **Audience** выбери **External**, чтобы вход был доступен людям вне твоего Google Workspace.
3. В **Branding** укажи сайт `https://prooood.ru` и authorized domain `prooood.ru`; заполни остальные запрошенные поля.
4. В **Data Access** оставь базовые права: `openid`, email и profile. Для email/profile кабинет может показывать
   `https://www.googleapis.com/auth/userinfo.email` и `https://www.googleapis.com/auth/userinfo.profile`.
5. В **Audience → Test users** можно добавить аккаунты для проверки. У базовых прав `openid email profile` есть
   исключение: Google разрешает вход вне списка тестовых пользователей даже в Testing. Для штатного публичного
   выпуска заверши Branding и переведи приложение в In production, как описано ниже.
6. Открой **Clients → Create client → Web application**. В **Authorized redirect URIs** вставь callback Google
   из таблицы. Наш серверный поток не требует JavaScript SDK и настройки JavaScript origins.
7. Сохрани **Client ID** и **Client secret** в менеджере секретов. Google может показать secret только при создании.
   Они соответствуют `RS_GOOGLE_CLIENT_ID` и `RS_GOOGLE_CLIENT_SECRET`.

Источники: [настройка consent screen](https://developers.google.com/workspace/guides/configure-oauth-consent),
[создание Web client](https://developers.google.com/identity/protocols/oauth2/web-server#creatingcred),
[базовые права входа](https://developers.google.com/identity/openid-connect/openid-connect).

### Публичный выпуск Google

Уточнение от 21.10.2026: Testing сам по себе не означает ограничение только тестовыми аккаунтами для нашего
набора `openid email profile`. Это явно оговорено в [правилах Audience](https://support.google.com/cloud/answer/15549945).
Полный вход аккаунтом вне списка ещё не проверен; его можно проверить уже сейчас.

Для оформления публичного приложения:

1. Опубликуй политику конфиденциальности на `prooood.ru`, доступную без входа, и добавь ссылку на лендинг.
   Например, можно создать `/privacy`; такой страницы в текущем коде пока нет. Она должна описывать фактическое
   использование, хранение и передачу данных Google. Terms of Service для этой проверки опциональны.
2. Заполни недостающие поля **Branding**, включая URL политики. На скриншоте пользователя именно незавершённый
   Branding блокирует **Publish app**. Сайт `https://prooood.ru` и authorized domain `prooood.ru` уже указаны.
3. Для проверки бренда подтверди домен в Google Search Console аккаунтом владельца/редактора Cloud-проекта.
   Если кабинет предлагает **Verify Branding**, пройди проверку, затем **Publish branding**.
4. В **Audience** оставь **External**, нажми **Publish app**, дождись статуса **In production**.
5. Проверь вход аккаунтом, которого нет в Test users. Новые ключи, callback и выкладка API для смены Audience не нужны.

Базовые права входа не требуют проверки sensitive/restricted scopes; проверка названия/логотипа бренда — отдельная
процедура. Требования к домену, главной странице и политике — в
[инструкции Google по brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification).

## Яндекс ID

1. Открой [создание приложения для авторизации](https://oauth.yandex.ru/client/new/id/).
   Выбери тип **Для авторизации пользователей**: он поддерживает разрешения группы `login`.
2. Укажи название сервиса, логотип и контактную почту.
3. В платформах выбери **Веб-сервисы**, в **Redirect URI** вставь callback Яндекса из таблицы.
4. В доступе к данным выбери **Логин, имя и фамилия, пол** (`login:info`) и **Адрес электронной почты**
   (`login:email`). Остальные разрешения для нашего потока не нужны.
5. Подтверди создание. На странице приложения скопируй **ClientID** и **Client secret / Пароль приложения**
   в `RS_YANDEX_CLIENT_ID` и `RS_YANDEX_CLIENT_SECRET`.
6. Для публичного запуска пройди доступную в кабинете верификацию сервиса: без неё Яндекс может показывать предупреждение.

[Официальная инструкция Яндекса](https://yandex.ru/dev/id/doc/ru/register-auth).

## VK ID

1. Открой [кабинет VK ID](https://id.vk.ru/business/), раздел **Мои приложения → Добавить приложение**.
2. Укажи название «РобоМера», платформу **Web** и логотип.
3. В **Базовый домен** укажи `prooood.ru`, в **Доверенный redirect URL** — полный callback VK из таблицы.
4. В настройках авторизации и доступа к данным включи получение **Почты**; она нужна для самостоятельной регистрации.
   Обязательная почта позволяет избежать отказа регистрации, если пользователь её не передаст.
5. Подтверди профиль бизнеса по запросу VK. Включи приложение и скопируй его **ID приложения / client_id**
   в `RS_VK_CLIENT_ID`.
6. Для текущего кода уровень конфиденциальности — **Публичное**: используется PKCE с App ID.
   Защищённый ключ и сервисный ключ доступа в эту конфигурацию не добавляются.

**Конфиденциальный режим VK — отдельная интеграция.** Он требует `service_token` при обмене кода и списка разрешённых
IP сервера. Текущий адаптер этих параметров не передаёт. Просто включить переключатель в кабинете недостаточно;
для такого режима нужно расширить адаптер и настроить исходящие IP инфраструктуры.

**Локальная проверка VK:** по текущей документации поддерживаются `http://localhost` на порту 80 и
`https://localhost` на 443; другие порты временно не поддерживаются. Поэтому `localhost:5173` для VK не подходит.
Проще проверять на HTTPS-стенде. Альтернатива — локальный reverse proxy на поддержанном порту, с одинаковым origin
для фронтенда, API и `RS_PUBLIC_*_URL`.

Источник: [создание и настройка приложения VK ID](https://id.vk.ru/about/business/go/docs/ru/vkid/latest/vk-id/connection/create-application).
Публичный PKCE-поток также показан в [официальном SDK](https://github.com/VKCOM/vkid-web-sdk#readme).

## Куда добавить полученные значения

В серверное окружение, например в локальный игнорируемый `backend/.env`:

```dotenv
RS_PUBLIC_WEB_URL=https://prooood.ru
RS_PUBLIC_API_URL=https://prooood.ru
RS_COOKIE_SECURE=true
RS_COOKIE_SAMESITE=lax

RS_GOOGLE_CLIENT_ID=replace_with_google_client_id
RS_GOOGLE_CLIENT_SECRET=replace_with_google_client_secret
RS_YANDEX_CLIENT_ID=replace_with_yandex_client_id
RS_YANDEX_CLIENT_SECRET=replace_with_yandex_client_secret
RS_VK_CLIENT_ID=replace_with_vk_app_id
```

Подставь свои значения вместо `replace_with_*`. Каждый провайдер включается независимо; для Google/Яндекса нужна пара
ID + secret, для VK — ID. Значения не добавляются в `VITE_*`, Git или чат.

На Fly.io получатель секретов — **`robomera-api`**: API и arq-воркер находятся в этом приложении.
Подготовь файл `NAME=VALUE` вне репозитория и загрузи его через stdin:

```bash
flyctl secrets import --stage --app robomera-api < /absolute/path/to/private-oauth.env
```

`--stage` сохраняет секреты до следующей выкладки. При выкладке новой версии API с миграциями они попадут
в API и воркер; затем нужно обновить фронтенд. Уже работающий старый код OAuth не включает.
Без `--stage` команда запускает обновление приложения сразу. Команды здесь приведены для самостоятельного выполнения,
в этой сессии секреты и production не менялись.
[Документация команды Fly](https://docs.fly.io/flyctl/cmd/fly_secrets_import).

Для Google и Яндекса можно создать отдельные dev-приложения с адресами:

```text
http://localhost:5173/api/v1/auth/oauth/google/callback
http://localhost:5173/api/v1/auth/oauth/yandex/callback
```

В локальном окружении тогда оба `RS_PUBLIC_*_URL=http://localhost:5173`, а `RS_COOKIE_SECURE=false`.
Не смешивай `localhost` и `127.0.0.1`. Для VK используй вариант, описанный выше.

## Проверка после включения

1. Открой `GET https://prooood.ru/api/v1/auth/oauth/providers`: нужные провайдеры должны иметь `enabled: true`.
   Кнопки на `/login` появляются только для включённых провайдеров. Ответ API не содержит секретов.
2. Проверь каждый сервис в отдельной приватной сессии: новый вход, повторный вход, отказ в доступе.
3. Для существующей почты сначала войди прежним способом и подключи провайдера на `/account` после подтверждения почты.
   Совпадение адреса само по себе аккаунты не объединяет. Для привязки нужен вход за последние 10 минут.
4. При `redirect_uri_mismatch` сверь origin, путь, порт и завершающий `/` с таблицей и окружением API.
   Если Google не пускает тестовый аккаунт — проверь Audience; если VK не возвращает email — доступ к почте.
5. Настрой Resend по [AUTH.md](AUTH.md#подключение-провайдеров-и-resend), затем проверь письмо и принятие приглашения.

Домашний маршрут и логотип учитывают сессию: пользователь → проекты, администратор → админка,
производитель → кабинет, гость → демо. При открытии `/` восстановление сессии завершается до выбора экрана.
