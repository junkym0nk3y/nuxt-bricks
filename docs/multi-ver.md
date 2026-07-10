# Версионирование страниц (последние N сохранённых копий с откатом)

## Context

Сейчас страница — одна строка в `bricks_pages`, каждое сохранение перезаписывает `schema` (JSONB) на месте: истории нет, откатить неудачное сохранение невозможно. Нужно хранить последние N (дефолт 5, конфигурируемо) версий каждой страницы и дать возможность откатиться / посмотреть превью версии из дашборда `/bricks`.

Подтверждённые требования: снапшот при **каждом** сохранении, меняющем `schema` (PATCH только thumbnail/published версий не плодит); UI — секция «Версии» в DetailsPanel дашборда с кнопками «Превью» и «Восстановить» (превью переиспользует существующий механизм `localStorage('bricks-preview-page')` + `/preview/<pagename>`); лимит — `bricks.versionsLimit` / env `NUXT_BRICKS_VERSIONS_LIMIT`, `0` отключает версионирование.

## Ключевые решения

- **Снапшот внутри `postgresStorageAdapter.updatePage` в транзакции** (INSERT старой строки → UPDATE → prune), а не в роуте: атомарность при конкурентных сохранениях; `pageUpdate.ts` не меняется. Кастомный адаптер (swap через `setBricksStorageAdapter`) сам отвечает за свою стратегию — контракт документируется в JSDoc интерфейса.
- **Restore — серверный эндпоинт** `POST /api/bricks/:id/versions/:versionId/restore`: не гоняет тяжёлый JSON туда-обратно, автоматически защищён auth-middleware (модифицирующий метод под `/api/bricks/**`). Restore применяет только **schema + layout + backgroundColor** — не трогает pagename/title/SEO/published (нет конфликтов уникальности pagename и неожиданных SEO-откатов). Внутри вызывает `updatePage`, который сам снапшотит текущее состояние → «откат отката» работает бесплатно.
- Триггер снапшота — `payload.schema !== undefined && versionsLimit > 0`.
- GET-эндпоинты версий публичны — та же модель, что существующий `GET /api/bricks/:id` (уже отдаёт полную schema).

## 1. БД — таблица `bricks_page_versions`

В `database/init.sql` **и** зеркально (идемпотентно) в `PAGES_SCHEMA_DDL` (`postgresStorageAdapter.ts:30` — существующий механизм «миграций» через `ensureSchema()`):

```sql
CREATE TABLE IF NOT EXISTS bricks_page_versions (
    id SERIAL PRIMARY KEY,
    page_id INTEGER NOT NULL REFERENCES bricks_pages(id) ON DELETE CASCADE,
    pagename VARCHAR(255) NOT NULL,
    title VARCHAR(500),
    description TEXT,
    keywords TEXT,
    social_image TEXT,
    layout VARCHAR(100),
    background_color VARCHAR(50),
    url_prefix VARCHAR(255),
    subdomain VARCHAR(255),
    schema JSONB NOT NULL,
    published BOOLEAN NOT NULL DEFAULT false,
    page_updated_at TIMESTAMP,          -- updated_at исходной строки на момент снапшота
    created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bricks_page_versions_page_created
    ON bricks_page_versions(page_id, created_at DESC);
```

Prune в той же транзакции после INSERT:

```sql
DELETE FROM bricks_page_versions
WHERE page_id = $1 AND id NOT IN (
    SELECT id FROM bricks_page_versions
    WHERE page_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2
);
```

## 2. Конфиг — `src/module.ts`

- `IBricksModuleOptions.versionsLimit?: number` (JSDoc: дефолт 5, 0 — выкл, env `NUXT_BRICKS_VERSIONS_LIMIT`), в `defaults: { versionsLimit: 5 }`.
- В `applyBricksRuntimeConfig()` (паттерн `bricksDatabaseUrl`): `runtimeConfig.bricksVersionsLimit = runtimeConfig.bricksVersionsLimit ?? process.env.NUXT_BRICKS_VERSIONS_LIMIT ?? options.versionsLimit` — имя ключа даёт NUXT\_-override в проде без ребилда.
- Серверный резолвер (env — строки): `resolveVersionsLimit(): number` — `Number(...)`, невалидное/отрицательное → 5, `Math.floor`.

## 3. Типы

`src/runtime/modules/common/types/bricks-api.d.ts`:

- `IPageVersionSummary { id; pageId; createdAt }` (лёгкий список без schema)
- `IPageVersion extends IPageVersionSummary` — полный снапшот meta + `schema: IBricksSchema` + `pageUpdatedAt`.

`src/runtime/modules/persistence/types/adapters.d.ts` — расширить `IStorageAdapter` (~строка 40):

- `listPageVersions(pageId): Promise<IPageVersionSummary[]>`
- `getPageVersion(pageId, versionId): Promise<IPageVersion | null>`
- JSDoc-контракт на `updatePage`: при наличии `schema` в payload и limit > 0 реализация снапшотит прежнюю строку и обрезает историю до N.

## 4. Postgres-слой

- `server/postgres/client.ts` — добавить `withTransaction<T>(fn)` (`pool.connect()` → BEGIN → fn(txQuery) → COMMIT/ROLLBACK → release; текущий `query()` идёт через `pool.query` — нужен выделенный клиент).
- `queryBuilders.ts` — `VERSION_SUMMARY_FIELDS`, `VERSION_SELECT_FIELDS` (camelCase-алиасы, как `PAGE_SELECT_FIELDS`).
- `postgresStorageAdapter.ts`:
    - DDL в `PAGES_SCHEMA_DDL`;
    - `updatePage` (~строка 143): если `payload.schema !== undefined && resolveVersionsLimit() > 0` — `withTransaction`: `INSERT INTO bricks_page_versions ... SELECT ... FROM bricks_pages WHERE id = $1 RETURNING id` (0 строк = страница не найдена → null), затем существующий динамический UPDATE, затем prune. Иначе — прежний путь без изменений;
    - реализации `listPageVersions` / `getPageVersion` (обе с `ensureSchema()`; `getPageVersion` — `WHERE id = $1 AND page_id = $2`, чтобы versionId нельзя было читать поперёк страниц).
- `server/utils/handlerHelpers.ts` — обобщить `requireNumericId(event, paramName = 'id')` для `versionId`; обновить README.

## 5. API-роуты (`src/runtime/server/api/bricks/`)

| Файл                                        | Роут                           | Поведение                                                                             |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| `[id]/versions/index.get.ts`                | `GET /api/bricks/:id/versions` | сводки без schema                                                                     |
| `[id]/versions/[versionId].get.ts`          | `GET .../versions/:versionId`  | полный `IPageVersion`, 404 если null                                                  |
| `[id]/versions/[versionId]/restore.post.ts` | `POST .../restore`             | `getPageVersion` → 404; `storage.updatePage(id, { schema, layout, backgroundColor })` |

**Важно:** роуты не автосканируются — зарегистрировать в массиве `apiHandlers` в `module.ts` (~строка 481, рядом с `/api/bricks/:id`).

## 6. Клиент

- `publish/utils/publishApi.ts` — `fetchPageVersionsRequest`, `fetchPageVersionRequest`, `restorePageVersionRequest` (нормализация ответа через `normalizePublishedPage`); README-таблица.
- `publish/stores/publish.ts` — экшен `restorePageVersion(id, versionId)`: запрос + вплавка нормализованной страницы в `publishedPages` (по образцу `patchPage`) → DetailsPanel обновится реактивно.
- `publish/composables/usePublishPreview.ts` — добавить `previewPageVersion(page: IPublishedPage, version: IPageVersion)`: собирает `IPreviewStoredPage` с **`pagename: page.pagename` (текущий, не из версии — должен совпасть с параметром роута `/preview/<pagename>`)**, meta из версии, `schema: version.schema`, свежий `storedAt` → `localStorage('bricks-preview-page')` → `window.open`.
- Новый композабл `publish/composables/usePublishPageVersions.ts` — `versions`, `isLoading`, `loadVersions(pageId)`, `previewVersion(page, versionId)`; README-таблица.
- Новый компонент `publish/components/BuilderPublishDetailsPanelVersions.vue` (сосед `BuilderPublishDetailsPanelRouting.vue`; строгий #region-порядок, CSS Modules, rem кратно 0.2): список версий (`formatPageDate` из `utils/dates.ts`), кнопки Превью/Восстановить, empty state; перезагрузка списка по `watch(() => props.page.updatedAt)`; emits `restore`, `notify`.
- `BuilderPublishDetailsPanel.vue` — вставить секцию после Routing; расширить `IPublishDetailsPanelEmits` в `types/dashboard.d.ts`.
- `publish/pages/index.vue` — подтверждение отката по образцу delete-confirmation (второй `BricksConfirmModal`, `confirm-variant="primary"`), тосты успех/ошибка.
- i18n `src/runtime/locales/ru.json` + `en.json` под `bricks.publish.dashboard.details.versions`: `title`, `empty`, `restore`, `preview`, `restoreConfirm.title`, `restoreConfirm.description` (`{date}`), `toasts.*`.

## 7. Edge cases

- POST create — снапшота нет (нечего снапшотить); первая версия появится при первом сохранении schema.
- Meta-only PATCH (title/published/thumbnail) — версий не создаёт (guard по `schema`).
- Удаление страницы — версии каскадом (FK).
- Смена pagename — превью использует текущий pagename, restore pagename не трогает.
- Live-рендер, published.get, localStorage-черновики — не затронуты.
- Известное ограничение v1: если билдер с этой же страницей открыт в соседней вкладке, его `BroadcastChannel('bricks-preview-sync')` ответит превью-вкладке живой схемой канваса и перекроет версию — задокументировать в JSDoc.
- Понижение лимита между запусками — история ужмётся при следующем сохранении (prune на каждом снапшоте).

## 8. Порядок реализации

1. DDL (`init.sql` + `PAGES_SCHEMA_DDL`).
2. `module.ts`: опция, runtimeConfig, регистрация роутов.
3. Типы (`bricks-api.d.ts`, `adapters.d.ts`).
4. `client.ts` (`withTransaction`), `queryBuilders.ts`, `postgresStorageAdapter.ts`, `handlerHelpers.ts`.
5. API-роуты.
6. `publishApi.ts`, стор, `usePublishPreview`, `usePublishPageVersions`.
7. Компоненты + `dashboard.d.ts` + `pages/index.vue`.
8. Локали ru/en, README-таблицы (publish/composables, publish/utils, persistence/server/utils), корневой README (док `versionsLimit`).
9. После каждого изменённого файла: `npx vue-tsc --noEmit | grep <file>` + `npx oxlint <file>`.

## Журнал

**2026-07-10 — реализовано (пп. 1–8), ожидает e2e-верификации (п. 9).**
vue-tsc/oxlint/vitest — чисто (103/103). Отступления от плана:

- `dates.ts`: добавлен `formatPageDateTime` (DD.MM.YYYY HH:mm) — в списке версий несколько снапшотов в день, одной даты недостаточно; используется списком и confirm-модалкой.
- oxlint max-lines (500) / complexity: манифест `apiHandlers` вынесен из `module.ts` в `src/api-handlers.ts` (`BRICKS_API_HANDLERS`), persistence-блок runtimeConfig — в `applyBricksPersistenceRuntimeConfig`; из стора `generateCopyPagename` вынесен в `utils/slugify.ts` (чистая функция с предикатом), сборка формы копии — в `utils/formState.ts` (`buildCopyFormState`), тест `publishStoreDuplicatePage.spec.ts` обновлён; confirm-флоу отката вынесен из `pages/index.vue` в композабл `usePublishVersionRestore.ts`.
- `usePublishPageVersions.previewVersion` защищён от повторного клика (`previewingVersionId`), секция «Версии» — ленивая (список грузится при открытии, перезагрузка по `watch(page.updatedAt)` только у открытой, смена страницы сворачивает секцию).

**Нюансы реализации (сверх плана):**

- `updatePage` сохраняет прежнюю семантику пустого payload: несуществующая страница → `null` (404), существующая с payload'ом из одних невалидных ключей → `Error('No fields to update')` (500).
- `IStorageAdapter` расширен обязательными `listPageVersions`/`getPageVersion` — **breaking для кастомных storage-адаптеров потребителей** (компилятор заставит дореализовать; контракт снапшотов — в JSDoc `updatePage`).
- `withTransaction` оборачивает ROLLBACK в try/catch — ошибка отката на мёртвом соединении не затеняет исходную; клиент всегда `release()`.
- `window.open` превью версии происходит **после** fetch полного снапшота: при аномально медленном ответе браузер может счесть клик протухшим (transient activation) и заблокировать попап. Осознанно не усложняли (открытие `about:blank` до fetch) — локальный запрос быстрый.
- Restore-ручка отвечает полной строкой страницы → стор вплавляет её через `normalizePublishedPage` без дозапроса; `updatedAt` меняется → открытая секция «Версии» перезагружается сама.
- Иконки секции — существующие `ta:outline-eye` (превью) и `ta:outline-arrow-back-up` (откат), новых регистраций в `BUILDER_ICONS` не потребовалось.
- Кнопка «Восстановить» не дизейблится для самой свежей версии — снапшот и текущее состояние могут расходиться (текущее состояние всегда «новее» последней версии на одно сохранение).

**2026-07-10 — e2e-верификация выполнена целиком (пп. 9.1–9.8). Фича готова.**

Прогон: curl-тесты + psql на прод-сборке playground (порт 3001, свежая БД `bricks_e2e` из `database/init.sql`), UI — Playwright на dev-сервере (основная БД). Результаты:

- ✓ 9.1–9.2: свежая БД из `init.sql` — все 5 таблиц; DDL-дельта через `ensureSchema()` на существующей БД тоже отработала (таблица появилась лениво). `\d bricks_page_versions` совпадает с планом. Каждое сохранение schema кладёт **прежнюю** строку; POST create версий не создаёт.
- ✓ 9.3: meta-only PATCH (title, published) счётчик версий не меняет.
- ✓ 9.4: 7 сохранений → ровно 5 строк; рестарт с `NUXT_BRICKS_VERSIONS_LIMIT=2` (без ребилда) → история ужалась до 2 при первом же сохранении; `=0` → сохранения проходят, новых версий нет.
- ✓ 9.5: `GET /versions` — сводки без schema (новые→старые); `GET /versions/:vid` — полный `IPageVersion`; 404 на несуществующую и на versionId чужой страницы (cross-page guard); `POST /restore` без auth → 401 (database-режим), с auth → schema откатилась, title/meta не тронуты, pre-restore состояние заснапшотилось само («откат отката» проверен), prune соблюдён.
- ✓ 9.6: секция «Versions» в DetailsPanel — ленивая загрузка при открытии, даты DD.MM.YYYY HH:mm, Превью открывает `/preview/<pagename>` со схемой версии (не живой), Restore → confirm-модалка с датой → тост «Version restored» (пойман MutationObserver — живёт 4 c) → список перезагрузился реактивно (новый pre-restore снапшот сверху); empty state «No saved versions yet»; смена страницы сворачивает секцию; светлая и тёмная темы корректны.
- ✓ 9.7: удаление страницы через UI (confirm) → версии удалились каскадом (FK).
- ✓ 9.8: live-рендер published-страницы отдаёт текущую схему; автосейв черновика в редакторе (изменение → `bricks-builder:draft:<pagename>` записан, undo → удалён) работает как раньше.

**Нюансы прогона (не дефекты фичи):**

- Dev-сервер, запущенный до появления новых роутов, отдаёт на них 404 — `addServerHandler` регистрирует Nitro-роуты при старте (runtime-код горячо перезагружается, манифест module.ts — нет). После рестарта dev-сервера всё работает.
- Прод-сборка playground (`nuxi build playground`) в этом репо падает SSR-ошибками на страницах билдера (`Cannot find module vue/server-renderer`, затем `reading 'ce'`) — расхождение версий vue 3.5.29 (корень) / 3.5.39 (playground) в node_modules; published/preview-страницы и все API-ручки при этом работают. Существующая проблема окружения module-репо, не связана с версионированием.

**За рамками v1 (осознанно не делали):** diff-просмотр версий, именованные версии/автор снапшота, восстановление meta-полей (title/SEO), UI-индикация «сколько версий» до открытия секции, ограничение истории по объёму (лимит только по количеству).

## 9. Верификация (end-to-end)

1. Postgres поднят; `npm run dev` — таблица создастся лениво через `ensureSchema()` на первом запросе.
2. psql: `\d bricks_page_versions`; два сохранения в билдере → 2 строки с _прежними_ схемами.
3. Meta-only PATCH (toggle published, правка title) → счётчик строк не растёт.
4. Prune: 7 сохранений → ровно 5 строк; `NUXT_BRICKS_VERSIONS_LIMIT=2` → 2; `=0` → новых нет.
5. curl: `GET /versions` (без `schema` в payload), `GET /versions/:vid` (полный), `POST /restore` без auth → 401, с auth → schema откатилась + появилась новая версия pre-restore-состояния.
6. UI: дашборд → секция «Версии» → Превью открывает `/preview/<pagename>` со старой схемой (вкладка билдера этой страницы закрыта); Restore → confirm-модалка → тост → список обновился → редактор показывает откатанный контент.
7. Удаление страницы → версии удалились каскадом.
8. Регрессия: live-рендер published-страниц и автосейв черновика в редакторе работают как раньше.
