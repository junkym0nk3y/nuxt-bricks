# nuxt-bricks

Визуальный билдер лендингов для Nuxt 3. Модуль добавляет дашборд страниц,
drag-and-drop редактор, preview и рендер опубликованных страниц.

Основные возможности:

- brick-компоненты с настраиваемыми и адаптивными свойствами;
- редактирование текста через TipTap;
- версии страниц и откат изменений;
- медиатека в S3-совместимом хранилище;
- встроенный PostgreSQL или внешний HTTP backend;
- Basic Auth или пользователи и сессии в PostgreSQL.

Требования: Node.js `>=22.17`, Nuxt `>=3.21`.

## Установка

```bash
npm install nuxt-bricks
```

Минимальная конфигурация со встроенным PostgreSQL:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
    modules: ['nuxt-bricks'],
    bricks: {
        backend: { mode: 'builtin' },
        auth: { mode: 'basic' },
    },
});
```

```bash
# .env
NUXT_BRICKS_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/bricks
NUXT_BASIC_AUTH_USERNAME=admin
NUXT_BASIC_AUTH_PASSWORD=replace-me
```

Примените миграции и запустите Nuxt:

```bash
npx bricks-migrate migrate
npm run dev
```

После запуска доступны:

| Поверхность | Путь                        |
| ----------- | --------------------------- |
| Дашборд     | `/bricks`                   |
| Редактор    | `/bricks/<pagename>`        |
| Preview     | `/preview/<pagename>`       |
| Live        | URL опубликованной страницы |

Если приложение использует `@nuxtjs/i18n`, подключайте `nuxt-bricks` раньше
него в массиве `modules`.

## Brick-компоненты

Компонент попадает в библиотеку билдера, если рядом с ним лежит файл
`*.brick.ts` с экспортом `brick` (категория, описание, редактируемые свойства)
и default-экспортом Vue-компонента.

```typescript
import ProductCard from './ProductCard.vue';

export const brick = {
    category: 'Cards',
    description: 'Карточка товара',
    values: {
        headline: { type: 'input', default: 'Название' },
    },
    slots: ['footer'],
};

export default ProductCard;
```

Метаданные читаются на этапе сборки разбором исходника, без исполнения модуля,
поэтому у них есть ограничение: `category`, `description`, `values` и `slots`
записываются только литералами. Вынесенная константа, вызов функции или шаблон
с подстановкой роняют сборку с указанием файла и поля — молча подставить вместо
них что-то другое значило бы записать в манифест не то, что написано в файле.
Ограничение касается только этих четырёх полей: `dataSources` с их функциями
разбор не трогает. Поле `values` обязательно; у компонента без редактируемых
свойств это пустой объект.

Читается ровно значение литерала в объявлении `export const brick`. Всё, что
меняет объект после него — присваивание полю, `Object.assign`, мутация из
функции — рантайм увидит, а манифест нет: держите метаданные в самом литерале.

Ищутся такие файлы в `components/**/*.brick.ts` относительно `srcDir` проекта —
то есть в `components/` для Nuxt 3 и в `app/components/` для Nuxt 4, включая
любую вложенность:

```
components/
└── cards/
    ├── ProductCard.vue
    └── ProductCard.brick.ts
```

### Где brick-файлы не ищутся

Поддерживается ровно один каталог — `<srcDir>/components/**` при стандартном
`vite.root`, равном `srcDir`. Так работают Nuxt 3, Nuxt 4, кастомный `srcDir` и
монорепа, пока приложение держит brick-файлы у себя. Остальные расположения
модуль не поддерживает и не обещает находить:

- **`vite.root`, переопределённый независимо от `srcDir`.** Сканер считает пути
  от `srcDir`, а карту загрузчиков Vite строит от своего root — ключи сразу
  расходятся, и компонент не резолвится.
- **Дополнительные каталоги компонентов** — заданные верхнеуровневой опцией
  `components` (`components.dirs`) или добавленные Nuxt-модулем через
  `addComponentsDir`. Brick-файл в таком каталоге (например, в `~/ui`) сканер
  пропустит. Менять `components` при этом можно: важно только, чтобы сами
  brick-файлы лежали в `<srcDir>/components`.
- **Каталоги компонентов из слоёв Nuxt** (`extends`) — в скан не входят.
- **Библиотеки компонентов из npm** — brick-файлы внутри `node_modules` не
  сканируются, даже если пакет подключён как библиотека компонентов.
- **Симлинки за пределы Vite root** — сканер их перечислит, а Vite может
  отклонить или канонизировать путь иначе; результат зависит от allow-list
  workspace, `realpath` и `preserveSymlinks`, поэтому не гарантируется.

Обойти ограничение можно, положив brick-файл (или ре-экспорт компонента) в
`<srcDir>/components`.

Манифест библиотеки собирается автоматически на `nuxt dev` и `nuxt build`,
никакой отдельной команды генерации выполнять не нужно. В dev изменения
brick-файлов подхватываются сами: правка существующего файла обновляет манифест
и перезагружает страницу, добавление или удаление файла дополнительно вызывает
мягкий рестарт dev-сервера (карту загрузчиков компонентов Vite собирает на этапе
сборки, на лету её состав изменить нельзя) — руками перезапускать ничего не надо.

Все метаданные после правки свежие сразу: они приходят из манифеста, который
перегенерируется до перезагрузки страницы. Если brick-файл не разбирается,
dev-сервер продолжает работать на прежнем манифесте, а ошибку показывает оверлей
поверх страницы — она снимется сама, как только файл станет корректным.

## Backend данных

Режим задаётся в `nuxt.config` и фиксируется при сборке. Browser-facing API,
обработка изображений и S3 всегда остаются внутри Nuxt-приложения.

### Встроенный PostgreSQL

```typescript
bricks: {
    backend: { mode: 'builtin' },
}
```

Строка подключения задаётся через `NUXT_BRICKS_DATABASE_URL`. Миграции —
единственный источник схемы БД:

```bash
npx bricks-migrate status
npx bricks-migrate migrate
```

Для локальной разработки в репозитории есть `docker-compose.yml` с PostgreSQL.

#### Лимит времени SQL-запроса

Каждое соединение пула получает серверный `statement_timeout` — база сама
отменяет запрос, превысивший лимит, и освобождает соединение. Клиентский потолок
ожидания этого сделать не может: он отпускает ожидающего, но зависший запрос
продолжает занимать соединение из конечного пула.

```typescript
bricks: {
    database: { statementTimeoutMs: 8000 },
}
```

```bash
NUXT_BRICKS_DATABASE_STATEMENT_TIMEOUT_MS=8000
```

Дефолт — 8000 мс. Лимит считается на **каждый** statement, а не на запрос: один
HTTP-запрос выполняет их несколько (проверка сессии database-auth, затем `BEGIN`,
снапшот, запись, очистка истории, `COMMIT`), поэтому лимит ограничивает
длительность отдельной команды и освобождает соединение, но не задаёт потолок
всей операции — этот потолок держит клиент. Отменённый запрос возвращает `504` с
`data.code = STATEMENT_TIMEOUT`; в отличие от обрыва по клиентскому потолку исход
здесь определён — незавершённая запись откатана.

Выключить лимит нельзя: `0` и прочие невалидные значения трактуются как
«не задано» и заменяются дефолтом (в лог уходит предупреждение). Законно долгий
запрос обслуживается бо́льшим конечным значением. Параметр `statement_timeout` в
строке подключения перебивается настройкой, но не бесследно — см. ниже; такая
строка вызывает предупреждение, и параметр из неё стоит убрать.

Границы: лимит применяется к запросам приложения (данные страниц, медиа,
database-auth) и **не** применяется к `bricks-migrate` — CLI подключается
самостоятельно, и долгая DDL там законна. Кастомные storage-адаптеры этот пул не
используют, и лимит их не касается.

**Как лимит применяется.** Значение уходит и startup-параметром соединения, и
отдельным `SET` в самой сессии сразу после подключения. Второе — источник
истины: `statement_timeout` в строке подключения иначе перекрыл бы настройку (и
значением `0` снял бы лимит совсем), а надёжно вычистить его из строки нельзя —
её грамматику определяет драйвер.

Полностью параметр не игнорируется: значение из строки подключения доезжает до сервера в
startup-пакете и действует **до** установки настроенного лимита, а заменяется
сразу после подключения. Практическое следствие: очень маленькое значение в
строке способно отменить саму установку (соединение тогда не выдаётся, ошибка
уходит вызывающему), а синтаксически невалидное — сорвать подключение ещё
раньше. Поэтому параметр из строки подключения лучше удалить, а не полагаться
на перекрытие.

**Пуллер соединений.** При прямом подключении к PostgreSQL всё описанное
работает как есть. С PgBouncer — нет, и это надо учитывать:

- неизвестные startup-параметры PgBouncer по умолчанию не игнорирует, а
  отклоняет подключение, поэтому `statement_timeout` нужно внести в
  `ignore_startup_parameters`;
- `ignore_startup_parameters` именно игнорирует значение, а не передаёт его
  PostgreSQL, — лимит приложения при этом не применяется;
- сессионный `SET` надёжен только в session pooling. В transaction pooling он
  относится к тому серверному соединению, которое привязано в этот момент, и на
  следующие транзакции не переносится.

Рабочая раскладка для PgBouncer: `ignore_startup_parameters = statement_timeout`
плюс лимит, заданный на роли или базе в самом PostgreSQL
(`ALTER ROLE … SET statement_timeout = '8000'`).

### Внешний HTTP backend

```typescript
bricks: {
    backend: { mode: 'external' },
    auth: { mode: 'basic' },
}
```

```bash
NUXT_BRICKS_BACKEND_URL=https://api.example.com/bricks
NUXT_BRICKS_BACKEND_TOKEN=server-to-server-secret
NUXT_BRICKS_BACKEND_HEALTH_URL=https://api.example.com/health
```

`backend.url` — полный base URL API; сегмент `bricks` автоматически не
добавляется. Адаптер отправляет Bearer token, если он задан. Полный контракт
ручек — [`docs/external-backend-contract.md`](docs/external-backend-contract.md);
кратко внешний backend должен реализовать следующие JSON-ручки:

| Метод                                | Назначение                  |
| ------------------------------------ | --------------------------- |
| `GET/POST {base}`                    | список и создание страниц   |
| `GET/PATCH/DELETE {base}/:id`        | чтение, изменение, удаление |
| `GET {base}/:id/versions`            | список версий               |
| `GET {base}/:id/versions/:versionId` | снапшот версии              |
| `GET {base}/public/pages/:pagename`  | опубликованная страница     |
| `GET/POST {base}/media`              | список и регистрация медиа  |
| `PATCH/DELETE {base}/media/:id`      | изменение и удаление медиа  |

`404` означает отсутствие записи. Конфликты должны возвращать `409` с
`data.code`: `PAGENAME_CONFLICT` или `REVISION_CONFLICT`. При изменении schema
внешний backend сам отвечает за создание и очистку версий.

Списки страниц возвращаются без `schema`, полная страница — только из point-
lookup. Даты передаются в ISO 8601, `PATCH` страницы принимает
`expectedRevision` в JSON body. `POST {base}/media` регистрирует только JSON-
метаданные без binary и должен быть идемпотентным по `url`.

Database-auth несовместим с external-режимом, потому что пользователи и сессии
этого режима хранятся в локальном PostgreSQL.

### Dev-прокси host-API (`PROXY_URL`)

`PROXY_URL` не выбирает backend данных. Он используется только в dev для
проксирования `/api/*` host-проекта, кроме `/api/bricks/**` — этот namespace
всегда обслуживается локально. Значение принимается с завершающим
слэшем и без; в production-сборке proxy middleware не регистрируется. Один и
тот же адрес используется и SSR-запросами, и клиентским dev-прокси.

## Авторизация

Защищены builder, preview и editorial API `/api/bricks/**` (включая media
proxy и page thumbnail). Публичны health-пробы,
`GET/HEAD /api/bricks/public/**`, используемый live-рендерером, и
`GET/HEAD /api/bricks/components` (манифест библиотеки компонентов: имена,
категории, пути brick-файлов и их редакторские метаданные).

### Basic Auth

Это режим по умолчанию:

```bash
NUXT_BASIC_AUTH_USERNAME=admin
NUXT_BASIC_AUTH_PASSWORD=replace-me
```

Дефолтный пароль `change-me` разрешён только в development. В production с
таким паролем защищённые пути отвечают `503`.

`BASIC_AUTH_USERNAME` и `BASIC_AUTH_PASSWORD` также поддерживаются при сборке и
в dev, но для уже собранного приложения используйте `NUXT_*`-варианты выше.

### Пользователи в PostgreSQL

Режим требует `backend.mode: 'builtin'` и применённых миграций:

```typescript
bricks: {
    backend: { mode: 'builtin' },
    auth: {
        mode: 'database',
        sessionMaxAgeSeconds: 604800,
    },
}
```

Дефолтных пользователей нет. CLI генерирует scrypt-хеш и готовый SQL:

```bash
npx bricks-hash-password mypassword --username admin
```

Обычно режим задаётся в `nuxt.config`. Для его переопределения в уже собранном
приложении нужны одновременно `NUXT_BRICKS_AUTH_MODE` и
`NUXT_PUBLIC_BRICKS_AUTH_MODE`; срок сессии меняется через
`NUXT_BRICKS_AUTH_SESSION_MAX_AGE`. Режим не включает роли, 2FA и UI управления
пользователями.

### CSRF

Изменяющие запросы к bricks API требуют same-origin заголовков браузера либо
`x-bricks-csrf: 1`. Последний вариант предназначен для CLI и интеграций:

```bash
curl -X POST 'https://example.com/api/bricks/auth/login' \
  -H 'x-bricks-csrf: 1' \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"..."}'
```

## Медиа и S3

Файлы хранятся в S3-совместимом storage, а метаданные — в выбранном backend
данных. Секреты задавайте через env:

```bash
NUXT_BRICKS_S3_ENDPOINT=https://storage.example.com
NUXT_BRICKS_S3_REGION=region-1
NUXT_BRICKS_S3_BUCKET=my-bucket
NUXT_BRICKS_S3_ACCESS_KEY_ID=...
NUXT_BRICKS_S3_SECRET_ACCESS_KEY=...
```

По умолчанию используются endpoint Yandex Object Storage и managed-префиксы
`bricks-media/` и `bricks-thumbnails/`.

Сервер проверяет тип содержимого, санитизирует SVG и ограничивает входные
данные. Дефолтные лимиты: 10 МБ для изображений, 100 МБ для видео, 100 МП для
растров и 4 МБ для JSON editorial API. В production дополнительно настройте
body- и rate-limits на reverse proxy.

## Версии страниц

При сохранении изменённой schema backend создаёт снапшот предыдущего состояния.
Глубина истории задаётся через `bricks.versionsLimit` или
`NUXT_BRICKS_VERSIONS_LIMIT`; дефолт — `5`, значение `0` отключает версии.

Откат восстанавливает schema и настройки layout, не меняя URL, SEO и статус
публикации. Сам откат также попадает в историю.

## Маршруты и поверхности

```typescript
bricks: {
    routes: {
        builderPrefix: '/admin/builder',
        previewPrefix: '/look',
    },
    features: {
        builder: true,
        publishedPages: true,
    },
}
```

Префиксы задаются при сборке: начинаются с `/`, состоят из lowercase-сегментов
`[a-z0-9-]`, не имеют trailing slash и не пересекаются. Поддерживается
нестандартный `app.baseURL`.

`features.builder: false` создаёт render-only сборку без UI, preview и
editorial API. `features.publishedPages: false` отключает catch-all live-
маршруты.

Статические страницы Nuxt имеют приоритет над live-маршрутами bricks. Корневые
динамические маршруты приложения (`[slug].vue`, `[...slug].vue`) могут с ними
конфликтовать; в таком случае используйте `urlPrefix`, собственный regex или
отключите `publishedPages`.

## Data sources опубликованных страниц

Brick-компоненты могут объявлять `dataSources`, выполняемые при рендере. Это
публичный контекст: поддерживаются только `GET` и `HEAD`, cookies и identity не
пробрасываются, абсолютные URL запрещены без allow-list.

```typescript
bricks: {
    dataSources: {
        allowedHosts: ['api.example.com'],
        timeoutMs: 10000,
        concurrency: 6,
        maxResponseBytes: 1024 * 1024,
        maxRequestsPerPage: 24,
        totalDeadlineMs: 15000,
    },
}
```

Относительные URL (`/api/...`) разрешены всегда. Одинаковые запросы одного
рендера дедуплицируются; ошибка или превышение бюджета оставляет компонент с
дефолтными props и не прерывает рендер всей страницы.

## Изоляция стилей

Reset модуля ограничен поверхностями bricks. Контент canvas и published-
страницы наследует стили host-приложения, а UI билдера изолирован CSS Modules.
CSS-переменные, transition-имена и utility-классы модуля имеют префикс
`bricks-`. Swiper CSS загружается только вместе со слайдером.

## Production

- Перед rollout выполняйте `npx bricks-migrate migrate` отдельной ролью с
  DDL-правами; приложению достаточно DML.
- Храните PostgreSQL URL, S3 credentials и auth/backend tokens только в env.
- Используйте TLS и внешний reverse proxy с body- и rate-limits.
- Включайте `NUXT_BRICKS_TRUST_PROXY=true` только за одним доверенным proxy-
  хопом; модуль использует последний элемент `x-forwarded-*`.
- Резервируйте PostgreSQL и S3 как согласованную пару.

Health endpoints:

- `GET /api/bricks/health` — liveness;
- `GET /api/bricks/health/ready` — readiness выбранного backend данных.

Для external backend рекомендуется задать `NUXT_BRICKS_BACKEND_HEALTH_URL`.
Непредвиденные ошибки API возвращают безопасный `500` с `data.errorId`; полная
ошибка с тем же идентификатором остаётся в server log.

### Обновление существующей БД

Не изменяйте уже применённые SQL-файлы: checksum drift блокирует дальнейшие
миграции. Миграция `0004_timestamptz` считает старые значения `TIMESTAMP`
записанными в UTC. Если исторически использовалась другая timezone,
скорректируйте значения перед применением этой миграции.

## Разработка

```bash
npm install
npm run dev
```

Основные команды:

| Команда                     | Назначение                              |
| --------------------------- | --------------------------------------- |
| `npm run type-check`        | проверить TypeScript                    |
| `npm run lint:check`        | линтеры и архитектурные границы         |
| `npm test`                  | unit-тесты Vitest                       |
| `npm run test:e2e`          | критические browser-сценарии Playwright |
| `npm run dev:build`         | production build playground             |
| `npm run smoke:pack`        | проверить tarball в чистом consumer     |
| `npm run smoke:integration` | lifecycle против PostgreSQL и MinIO     |
| `npm run smoke:external`    | lifecycle внешнего HTTP backend         |
| `npm run budget:bundle`     | проверить gzip-бюджеты initial bundle   |

Runtime-код разделён на домены в `src/runtime/modules/`, тесты лежат в `test/`,
browser-сценарии — в `e2e/`, миграции — в `migrations/`. Перед первым локальным
E2E-запуском выполните `npx playwright install chromium`; backend и test
consumer поднимутся автоматически. Границы зависимостей описаны в
`.dependency-cruiser.cjs`; краткие инструкции для AI — в `CLAUDE.md`.
