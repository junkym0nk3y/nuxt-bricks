# Спринт: ссылки, медиа, адаптивы, учётки, шаблоны

## Контекст

Семь пунктов от владельца по итогам эксплуатации билдера. Три из них — реальные баги
(канвас врёт про раскладку, published режет десктоп, шаблоны нарисованы но не существуют),
два — недостающие фичи в готовых модулях (ссылки в редакторе, категории/оптимизация медиа),
два — новая функциональность (редактор адаптивов, управление учётками).

Решения владельца, принятые при планировании:

- **Адаптивы**: произвольный набор устройств, но `desktop` и `mobile` обязательны, всего
  не более 4, у каждого — выбор иконки. Плюс per-page параметры.
- **Учётки**: создание пользователей, роли, смена паролей; всё выключается флагом конфига.
  Keycloak — только концепция и сбор информации в бэклог, но задел учесть в абстракции.
- **Шаблоны**: любую страницу можно дополнительно сохранить как шаблон (копия становится
  шаблоном). Загрузка из JSON — не обязательна.
- **Порядок**: малые фиксы → макеты → крупное.

Схема БД правится **в `migrations/0001_init.sql`** (не новым файлом): правка SQL → тот же
DDL руками в живую БД → пересчёт строки в `bricks_schema_migrations` → 0 pending.

---

## Диагностика п.4 (выполнена, замеры вживую)

Проверено в playground на `/bricks/test` и `/test` через Playwright.

| Поверхность                 | Ширина контейнера                   | Ячейка грида |
| --------------------------- | ----------------------------------- | ------------ |
| Билдер `desktop`, окно 1512 | 1429px (при `style="width:160rem"`) | 258.2px      |
| Билдер `desktop`, окно 1280 | 1197px                              | 211.8px      |
| Published, окно 1280        | **768px** (tablet-ветка)            | 131.2px      |
| Published, окно 1920        | 1920px                              | 356.8px      |

**Корень бага билдера**: `.canvas` в `TheBuilderCanvas.vue` — flex-item внутри
`.canvasWrapper` (`display: flex`), имеет `flex-shrink: 1` и `min-width: auto`. Заданная
`width: 160rem` ведёт себя как flex-basis и сжимается под доступное место; сжатие
останавливает только `min-width` враппера из `useCanvas.ts:109-112`
(`canvasStore.width * totalScale`). Масштаб применяется дважды — `transform: scale()`
плюс реальное сжатие layout-ширины. Грид пересчитывает `1fr` от неверной ширины,
поэтому канвас показывает не то, что будет на published.

**Корень дыры published**: порог `desktop: 1600` в `useBricksConfig.ts:22-28`. Диапазон
1024–1599 попадает в tablet-ветку, промежуточной ступени нет (`laptop: 1024` объявлен
в типе и дефолтах, но в генерации media-queries не участвует). Закрывается п.3.

---

## Фаза 1 — малые фиксы (без макетов)

### 1.1 П.4: статика канваса в билдере

- `TheBuilderCanvas.vue` (`.canvas`, ~строка 490): добавить `flex-shrink: 0`. Layout-ширина
  становится ровно заданной, за вписывание отвечает только `transform: scale()`.
- Проверить то же в Figma-режиме: `BuilderCanvasViewport.vue` (`.viewport`, ~строка 320)
  и `.figmaWrapper` — там три канваса в ряд, сжатие даст тот же эффект.
- `useCanvas.ts:109-112`: после фикса `canvasWrapperStyle.minWidth` остаётся нужен
  (держит скролл-область при ручном зуме больше fit) — не удалять, но перепроверить,
  что не конфликтует с `flex-shrink: 0`.
- Auto-fit при ресайзе окна (`TheBuilderCanvas.vue:310`) **оставить**: после фикса он
  меняет только визуальный зум, не раскладку. Снятие листенера сделало бы desktop-канвас
  1600px некликабельным на ноутбуке без ручного зума.

### 1.2 П.4-спутник: `BlockText` container queries

`BlockText.vue:123-129` использует `@container (min-width: 768px/1024px)`, но `container-type`
объявлен только на `.bricks-canvas`. В билдере текст 1.8rem, на published — всегда 1.4rem.
Перевести на тот же механизм, что у остальных блоков: `responsiveCssVars` в
`blockText.definition.ts` + per-device CSS-переменная размера шрифта. Убрать `@container`.

### 1.3 П.1: ссылки в текстовом редакторе

- `package.json`: `@tiptap/extension-link@^3.0.0` в `peerDependencies` (рядом с остальными
  tiptap-пакетами, ~строки 112-127) и в devDependencies.
- `text-editor/utils/createTiptapEditor.ts`: добавить в lazy-`Promise.all` и в набор
  extensions — `Link.configure({ openOnClick: false, autolink: false })`.
- `plugins/builder/textEditorToolbarSetup.ts`: кнопка в группу `marks` (или своя группа
  `link`) с `isActive: () => editor.isActive('link')`; действие открывает модалку.
- Новая модалка `text-editor/components/TheTextEditorLinkModal.vue` на `BricksModal`
  (образец — `TheTextEditorModal.vue`): поле URL, чекбокс «в новой вкладке», кнопки
  «Применить» / «Убрать ссылку». Валидация URL — переиспользовать `isSafeLinkUrl`
  из `common/utils/sanitize/urlPolicy.ts`.
- `ui/inputs/BricksTextEditorToolbar.vue`: ключ в `TOOLBAR_TOOLTIP_KEYS` (~строки 42-61)
    - строки в `locales/ru.json` и `en.json` (`bricks.textEditor.toolbar.*`).
- **Санитайзер**: `a[href,target,rel,title]` и `isSafeLinkUrl` уже готовы
  (`sanitizeRichText.ts:38-77`), правок allowlist не требуется. Но `rel` сейчас не
  навязывается — добавить в `safeAttrValue`/пост-обработку принудительный
  `rel="noopener noreferrer"` при `target="_blank"`.
- **Стили обязательны**: `default.scss:55` делает reset `a { text-decoration: none;
color: inherit }` для `body.bricks-page`, а правила для `a` внутри `[data-tiptap-content]`
  нет — без него вставленная ссылка визуально неотличима от текста. Добавить правило
  в блок `.bricks-text [data-tiptap-content]` (~строки 354-460).
- Решение по внутренним ссылкам: оставить нативный `<a>` (full reload). Перехват в
  `NuxtLink` не делать — рендерер работает через `v-html`, замена потребовала бы парсинга
  HTML в рантайме. Зафиксировать как осознанное ограничение.
- Тесты: расширить `test/common/sanitize.spec.ts` кейсом принудительного `rel`.

---

## Фаза 2 — макеты в Figma (на утверждение)

Файл дизайн-системы: `FsPQKxtsHrbJiyiyal9ZlR`. Новые страницы-концепты, всё на
инстансах библиотеки и переменных `var(--bricks-*)`, обе темы. После утверждения —
запись в `docs/figma-sync-workflow.md`.

- **Viewport Editor (concept)** — п.3: список устройств (до 4, `desktop`/`mobile`
  неудаляемые), выбор иконки, поля `width` / `aside` / `maxWidth` / `minWidth`;
  где живёт — модалка создания страницы и настройки страницы в билдере.
- **Users & Roles (concept)** — п.5: список пользователей, создание, смена пароля,
  выбор роли, деактивация; вид раздела при выключенном флаге конфига.
- **Templates (concept)** — п.7: живая секция «Шаблоны» дашборда (сетка карточек с
  миниатюрами), «Сохранить как шаблон» из билдера и из строки списка страниц, выбор
  шаблона в модалке создания.

---

## Фаза 3 — п.7 Шаблоны

Наименьший из крупных пунктов, переиспользует готовые механизмы.

- `migrations/0001_init.sql`: таблица `bricks_templates` (`id`, `name`, `description`,
  `thumbnail_url`, `schema JSONB`, `page_meta JSONB`, `created_at`, `updated_at`),
  уникальный индекс по `name`.
- `persistence/types/adapters.d.ts`: методы шаблонов в `IStorageAdapter` +
  реализация в `postgresStorageAdapter.ts`; отражение в `docs/external-backend-contract.md`.
- Эндпоинты в `src/runtime/server/api/bricks/templates/` (`index.get`, `index.post`,
  `[id].delete`) + регистрация в `src/api-handlers.ts`.
- Сохранение: переиспользовать `publish/utils/currentPageWrite.ts:184`
  (`runSaveCurrentPageAsCopy`) как образец; миниатюра — существующий
  `api/bricks/media/s3-page-thumbnail.post.ts`.
- Применение: оживить ветку `'template'` в `TPublishCreatePageSource`
  (`publish/types/dashboard.d.ts:224`), карточку в
  `BuilderPublishCreatePageStartOptions.vue:83-101`, использовать путь применения схемы
  из `usePublishSchemaImport.ts`.
- Секция дашборда: `BuilderPublishDashboardNav.vue:49` — заменить жёсткий `templates: 0`
  на реальный счётчик; `TheBuilderPublishDashboard.vue:159-172` — сетка вместо
  empty-state; подключить поиск шаблонов.
- Точка входа «сохранить как шаблон»: действие в строке списка страниц
  (`BuilderPublishPagesListRow.vue`) — снимает вопрос «какая текущая страница»,
  плюс пункт в сплит-кнопке сохранения в билдере.
- `documentation/docs/guide/ru/01-getting-started.md:9` — раздел уже описан как
  существующий, привести текст к факту.
- Тесты: спека на CRUD + применение шаблона к новой странице.

---

## Фаза 5 — п.3 Редактор адаптивов

Самая сквозная правка: `TBricksDeviceKey` (`common/types/brick.ts`) перестаёт быть
литеральным объединением.

- **Модель**: набор устройств (2–4), у каждого `key`, `label`, `icon`, `width`, `aside`,
  `maxWidth?`, `minWidth?`, `remBase?`. `desktop` и `mobile` обязательны и неудаляемы.
- **Хранение**: колонка `viewport_config JSONB NULL` в `bricks_pages` (`null` =
  глобальный дефолт из `app.config`). Зеркалить в `bricks_page_versions`.
- **Затрагивается** (перечисляю, т.к. цепочка длинная):
    - `useBricksConfig.ts` — резолвер с per-page слоем;
    - `useBricksStyles.ts`, `layouts-blocks/utils/responsiveCss.ts`,
      `useResponsiveLayoutStyles.ts`, `useResponsiveVisibilityStyles.ts` — генерация
      media-queries по динамическому списку (сейчас `DEVICES` — константа из трёх);
    - `plugins/bricks-styles.ts` — плагин вызывает генераторы без параметров, нужен
      доступ к конфигу текущей страницы (архитектурный сдвиг);
    - `builder/core/stores/canvas.ts` — `viewport`, `setViewport`, `VIEWPORT_BASE_HEIGHT`,
      дублирующие дефолты ширин (строки 12-16, 32-43);
    - `props.responsive[device]` — `stores/actions/properties.ts:67-113`,
      `useSidebarResponsiveScope.ts`, `layouts-blocks/registry.ts:152` (`resolveBlockProps`),
      `utils/responsiveVars.ts`;
    - `deviceVisibility.ts` + `IDeviceVisibilityConfig` (`common/types/brick.ts:50`);
    - табы устройств в панели свойств, Figma-режим (`TheBuilderCanvas.vue:365-367` —
      жёстко три `BuilderCanvasViewport`), `BuilderCanvasBottomBar.vue:52-89`;
    - миграция существующих схем: ключи `responsive` / `deviceVisibility` под новый набор.
- **Побочный выигрыш**: добавление `laptop` закрывает дыру 1024–1599, из-за которой
  ноутбук получает tablet-раскладку (замеры выше).
- **Дополнительно почистить рассинхрон**: `BlockSlider.vue:134-144,394,398` —
  hardcoded 768/1024 вне конфига (свитч на 1024, когда остальной адаптив на 1600).
- UI: модалка создания страницы + настройки страницы в билдере, по макету.
- Тесты: расширить `test/layouts-blocks/responsiveLayoutCss.spec.ts` и
  `test/common/deviceVisibility.spec.ts` на произвольный набор устройств.

---

## Фаза 6 — п.5 Учётки и роли

- `migrations/0001_init.sql`: `bricks_users` + `role VARCHAR(32) NOT NULL DEFAULT 'editor'`
  с CHECK на `'admin' | 'editor' | 'viewer'`.
- `IAuthAdapter` (`persistence/types/adapters.d.ts:217`) сейчас **только читающий** —
  добавить `listUsers`, `createUser`, `updateUserPassword`, `updateUserRole`,
  `setUserActive`, `deleteUser`; реализация в `postgresAuthAdapter.ts`; отражение
  в `docs/external-backend-contract.md`.
- **Инвалидация сессий при смене пароля** — сейчас баг: `postgresAuthAdapter.ts:48`
  джойнит сессии без участия хеша, украденная кука живёт до 7 суток с любым новым
  паролем. Смена пароля и деактивация должны удалять сессии пользователя.
- Опции модуля (`src/types/module.d.ts:12-33`): `auth.allowUserManagement?: boolean`,
  `auth.allowPasswordChange?: boolean` (дефолты — включено); при выключении раздел
  скрыт в UI **и** ручки отвечают 404/403, а не только скрытие в интерфейсе.
- **Проверка прав**: `event.context.bricksUser` ставится в
  `server/middleware/auth.ts`, но нигде не читается — все защищённые ручки одинаково
  доступны любой валидной сессии. Ввести гард по роли и применить к page/media/
  template/user-ручкам.
- Эндпоинты `api/bricks/users/**` + регистрация в `src/api-handlers.ts`; переиспользовать
  `passwords.ts` (scrypt), `scryptGate.ts`, `csrfProtection.ts`.
- UI: раздел дашборда по макету; кнопка «сменить пароль» для себя вне зависимости
  от `allowUserManagement`.
- CLI `src/cli/bricks-hash-password.mjs`: upsert `ON CONFLICT (username) DO UPDATE`
  вместо голого INSERT (сейчас основной сценарий «сменить пароль» падает на UNIQUE);
  убрать пароль из argv-примера в `README.md:323` (виден в `ps` и истории шелла).
- **Задел под Keycloak**: слой доступа к пользователю оформить так, чтобы источником
  мог быть не только Postgres (`mode: 'basic' | 'database'` → готовность к `'oidc'`).
  Реализацию OIDC **не делать**; собрать в `docs/backlog.md` раздел: discovery,
  code flow c PKCE, маппинг claims в роли, соседство с cookie-сессиями, что делать
  с локальными учётками при включённом OIDC.

---

## Проверки

По каждой фазе (выбор по области изменения, как в `CLAUDE.md`):

- `.ts` / `.vue`: `npm run type-check`, `npx oxlint <файлы>`
- стили: `npx stylelint <файлы>`
- логика: `npx vitest run <спека>`
- границы модулей: `npm run deps:check` (обязательно для фаз 3, 5 и 6 — новые
  server↔client связи)
- широкое: `npm run lint:check`, `npm test`, затем `npm run dev:build`

## Верификация вживую

Playground: dev-сервер на порту 3001 (может быть уже запущен — проверять
`Another Nuxt dev server is already running`), Postgres — контейнер `nuxt-bricks-db`.
Билдер за логином (`auth.mode: 'database'`), временный пользователь по процедуре
скилла `verify`, удалять после проверки. Страница `test` — published, содержит гриды.

- **п.4**: `/bricks/test` на desktop, замерить `getComputedStyle` канваса и ячейки
  грида при 1920 / 1512 / 1280 — `offsetWidth` канваса должен остаться 1600px на всех
  трёх, меняться должен только `transform: scale()`. Сравнить ячейку с `/test` при
  ширине ≥ порога desktop — должны совпасть.
- **п.1**: вставить ссылку в трёх поверхностях (панель свойств, модалка, inline на
  канвасе), проверить `rel` на published, проверить видимость ссылки в обеих темах.
- **п.3**: создать страницу с 4 устройствами, переключить канвас, сверить published.
- **п.5**: создать пользователя каждой роли, проверить отказы ручек по роли, смену
  пароля с инвалидацией сессии, поведение при выключенном флаге.
- **п.7**: сохранить страницу как шаблон, создать из шаблона, сверить схему.

Визуальные правки — проверять в светлой и тёмной теме.

## Ревью

Каждый законченный пункт — ревью у Codex (`codex:codex-rescue`, модель gpt-5.6-sol high,
только в фоне, коммиты запрещены, все проверки прогнать до передачи и написать об этом
в промпте). Для фаз 3, 5 и 6 — расширенный формат (способ починки / радиус поражения /
чем может сломаться / как проверить), т.к. правки сквозные. Находки перепроверять
самому перед принятием.
