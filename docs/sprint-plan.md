# Спринт: ссылки, медиа, адаптивы, учётки, шаблоны

## Контекст

Семь пунктов от владельца по итогам эксплуатации билдера. Три из них — реальные баги
(канвас врёт про раскладку, published режет десктоп, шаблоны нарисованы но не существуют),
два — недостающие фичи в готовых модулях (ссылки в редакторе, категории/оптимизация медиа),
два — новая функциональность (редактор адаптивов, управление учётками).

Решения владельца, принятые при планировании:

- **Шаблоны**: любую страницу можно дополнительно сохранить как шаблон (копия становится
  шаблоном). Загрузка из JSON — не обязательна.
- **Порядок**: малые фиксы → макеты → крупное.

Схема БД правится **в `migrations/0001_init.sql`** (не новым файлом): правка SQL → тот же
DDL руками в живую БД → пересчёт строки в `bricks_schema_migrations` → 0 pending.

---

## Фаза 1 — малые фиксы (без макетов)

Пункты 1.1 (статика канваса) и 1.2 (`BlockText` без container queries) сделаны
12.08.2026 и из плана убраны; что именно поменялось — в README и в истории
коммитов. Остаётся 1.3: владелец вынес его из этой итерации, поэтому пункт лежит
здесь как готовая к работе заготовка.

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

- **Users & Roles (concept)** и **Профиль и аватар** — п.5: нарисованы 14.08.2026 и
  реализованы; ID страницы и бордов — в `docs/figma-sync-workflow.md`.
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

## Проверки

По каждой фазе (выбор по области изменения, как в `CLAUDE.md`):

- `.ts` / `.vue`: `npm run type-check`, `npx oxlint <файлы>`
- стили: `npx stylelint <файлы>`
- логика: `npx vitest run <спека>`
- границы модулей: `npm run deps:check` (обязательно для фазы 3 — новые
  server↔client связи)
- широкое: `npm run lint:check`, `npm test`, затем `npm run dev:build`

## Верификация вживую

Playground: dev-сервер на порту 3001 (может быть уже запущен — проверять
`Another Nuxt dev server is already running`), Postgres — контейнер `nuxt-bricks-db`.
Билдер за логином (`auth.mode: 'database'`), временный пользователь по процедуре
скилла `verify`, удалять после проверки. Страница `test` — published, содержит гриды.

- **п.1**: вставить ссылку в трёх поверхностях (панель свойств, модалка, inline на
  канвасе), проверить `rel` на published, проверить видимость ссылки в обеих темах.
- **п.7**: сохранить страницу как шаблон, создать из шаблона, сверить схему.

Визуальные правки — проверять в светлой и тёмной теме.

## Ревью

Каждый законченный пункт — ревью у Codex (`codex:codex-rescue`, модель gpt-5.6-sol high,
только в фоне, коммиты запрещены, все проверки прогнать до передачи и написать об этом
в промпте). Для фазы 3 — расширенный формат (способ починки / радиус поражения /
чем может сломаться / как проверить), т.к. правки сквозные. Находки перепроверять
самому перед принятием.
