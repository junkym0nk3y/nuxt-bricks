# План: перенос `/mock-api/**` под `/api/bricks/**`

Дата: 2026-07-13. Обратная совместимость не требуется (проект не опубликован,
см. CLAUDE.md).

## Мотивация

- `mock-api` — исторический артефакт: там не моки, а три боевые builder-ручки
  (библиотека компонентов канваса, anti-SSRF media proxy, загрузка page
  thumbnail). Имя вводит в заблуждение в auth/proxy-коде.
- `/mock-api` — второй «особый» корневой префикс, который тащится исключениями
  через `localApiPaths`, `routePaths`, `routeProtection`, `csrfProtection`,
  `proxyRouting`, `devProxy`, `useApiClient`. Перенос схлопывает резервацию до
  единственного префикса `/api/bricks`.
- Требование: ручка библиотеки компонентов обязана всегда обслуживаться
  текущим проектом — не проксироваться и не подменяться. Внутри
  `/api/bricks/**` это гарантировано по построению: `isLocalApiPathname`
  (общий предикат сервера и клиента) исключает весь namespace из проксирования
  независимо от наличия конкретного хендлера.

## Новые адреса

| Было                              | Станет                                    |
| --------------------------------- | ----------------------------------------- |
| `GET /mock-api/bricks-components` | `GET /api/bricks/components`              |
| `POST /mock-api/s3-media-proxy`   | `POST /api/bricks/media/s3-proxy`         |
| `POST /mock-api/s3-page-thumbnail`| `POST /api/bricks/media/s3-page-thumbnail`|

Конфликтов с `media/:id` нет: статические сегменты в Nitro приоритетнее
параметрических, методы тоже различаются.

## Намеренное изменение поведения

`/mock-api/bricks-components` сейчас — единственная незащищённая builder-ручка
(auth-матрица её не покрывает) с `Access-Control-Allow-Origin: *`. После
переноса `GET /api/bricks/components` попадает под правило «editorial API
защищён целиком» (`routeProtection.ts`): список компонентов проекта перестаёт
быть публичным. Канвас не страдает — он живёт внутри авторизованного билдера,
`apiFetcher` шлёт запросы с той же сессией. CORS-заголовок удаляем как
рудимент.

## Шаги

### 1. Перенос файлов хендлеров

Из `src/runtime/server/routes/mock-api/` в `src/runtime/server/api/bricks/`:

- `bricks-components.ts` → `components.get.ts` — попутно убрать
  `appendHeader(..., 'Access-Control-Allow-Origin', '*')` и ручной разбор
  `new URL(event.node.req.url...)` (заменить на `getQuery`).
- `s3-media-proxy.post.ts` → `media/s3-proxy.post.ts`.
- `s3-page-thumbnail.post.ts` → `media/s3-page-thumbnail.post.ts`.

Папку `server/routes/mock-api/` удалить (и `server/routes/`, если опустеет).
Проверить относительные импорты внутри перенесённых файлов (глубина пути
меняется).

### 2. Регистрация роутов (`src/module-setup.ts`)

В `registerBricksServerHandlers` удалить спец-блок mock-api (строки ~262–273)
и добавить три ручки в манифест `BRICKS_API_HANDLERS` с `isPublic: false` —
существующий цикл отсекает не-public ручки в render-only режиме, что
эквивалентно текущему гейту `isBuilderEnabled`. Обновить docblock функции.

### 3. Клиентские вызовы

- `builder/app/composables/useComponentLibrary.ts:35` —
  `/api/bricks/components` (сейчас с trailing slash — убрать).
- `builder/core/composables/useModalOptions.ts:34` — `/api/bricks/components`.
- `builder/app/composables/usePageThumbnail.ts:64` —
  `/api/bricks/media/s3-proxy`; `:122` — `/api/bricks/media/s3-page-thumbnail`.

### 4. Маршрутизация / резервации

- `common/utils/localApiPaths.ts:13` — `LOCAL_API_PREFIXES` →
  `['/api/bricks']`; обновить docblock модуля и `isLocalApiPathname`.
- `common/utils/bricks/routePaths.ts:30` — убрать `'mock-api'` из
  `RESERVED_ROOT_SEGMENTS`.
- Комментарии: `server/utils/proxyRouting.ts` (шапка, `shouldProxyRequest`),
  `server/middleware/devProxy.ts:7`, `common/composables/useApiClient.ts:101,168`.

### 5. Auth / CSRF

- `server/utils/auth/routeProtection.ts` — удалить ветку
  `pathname.startsWith('/mock-api/s3-')` (строки ~71–74) и упоминание в шапке:
  перенесённые ручки накрывает общее правило `/api/bricks`.
- `server/utils/auth/csrfProtection.ts:84` — удалить
  `|| pathname.startsWith('/mock-api/s3-')`, поправить docblock.
- `server/middleware/auth.ts:9` — обновить комментарий-матрицу.

### 6. Тесты (`test/`)

Обновить ожидания:

- `commonLocalApiPaths.spec.ts` — `/mock-api/**` больше не локальный префикс.
- `commonRoutePaths.spec.ts` — `mock-api` не зарезервирован.
- `serverProxyRouting.spec.ts`, `serverDevProxy.spec.ts` — кейсы про
  непроксирование перенесённых путей; `/mock-api/**` теперь обычный
  не-`/api`-путь (не проксируется, потому что не `/api/**`).
- `serverAuthRouteProtection.spec.ts` — s3-кейсы на новые пути; новый кейс:
  `GET /api/bricks/components` требует auth.
- `serverAuthCsrfProtection.spec.ts` — новые пути.
- `renderDataSourcePolicy.spec.ts` — упоминания mock-api.

### 7. Документация и комментарии

- `README.md` — упоминания `/mock-api/**`.
- `src/module.ts` — комментарии на строках ~108, 182, 399, 412.
- `persistence/server/utils/mediaOrchestration.ts:5`,
  `persistence/types/adapters.d.ts:157`,
  `builder/app/types/composables.d.ts:30,39,101` — комментарии/типы.
- README в `common/composables/` и `common/utils/`.
- `docs/external-backend-contract.md` не задет (контракт про `{base}/**`).
- `docs/backend-connection-modes-plan-2026-07-12.md` — исторический план, не
  трогаем.

### 8. Проверки

1. `npm run type-check`
2. `npx oxlint <изменённые файлы>`
3. `npx vitest run` по спекам из шага 6
4. `npm run deps:check`
5. Runtime-верификация через playground (skill `verify`): библиотека
   компонентов в канвасе загружается, thumbnail страницы сохраняется,
   media proxy работает (вставка изображения по URL).

## Журнал прогресса

- 2026-07-13 — план составлен, работа не начата.
