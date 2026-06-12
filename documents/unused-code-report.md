# Отчёт: неиспользуемый код после рефактора

Дата: 2026-06-12. Инструменты: knip 5.x (разовый запуск через `npx`, временный `knip.ts`-конфиг с entry points Nuxt-модуля), верификация каждой находки grep'ом по `src/` + `playground/`.

**Методика:** entry points — `src/module.ts`, `src/cli/stories-generate.mjs`, всё, что регистрируется строковыми путями (plugins, server handlers, middleware, layouts, pages), `playground/**` как потребитель. `.brick.ts` в репозитории отсутствуют (живут в потребляющих проектах, сканируются глобами `/components/**` — на анализ не влияют).

**Уверенность:** `high` — подтверждено grep'ом (0 использований вне определения); `medium` — возможна осознанная причина оставить.

---

## TL;DR

| Категория | Найдено |
| --- | --- |
| Файлы-сироты | **0** 🎉 |
| Полностью мёртвые экспорты | 5 |
| Лишний `export` (используется только в своём файле) | 14 |
| Мёртвые типы | 1 (`SidebarState` — заодно дубль и нарушение нейминга) |
| Зависимости на удаление | 2–3 (`scroll-lock`, `@types/scroll-lock`, опц. `@nuxt/test-utils`) |
| Зависимости «не подключены» | lint-staged + commitlint (нет git-хуков и CI) |
| Зависимости на добавление | 4 транзитивных `@tiptap/extension-*` |

После рефактора структура чистая: ни одного осиротевшего `.ts`/`.vue`/`.scss` файла. `convertBetweenUnits()` (кандидат из прежнего плана рефактора) уже удалён — подтверждено.

---

## 1. Полностью мёртвые экспорты (high — безопасно удалить)

Нигде не импортируются и не используются даже в своём файле:

| Экспорт | Файл | Примечание |
| --- | --- | --- |
| `getFilenameWithoutExtension` | `src/runtime/modules/persistence/server/utils/imageProcessing.ts:86` | |
| `extractFormField` | `src/runtime/modules/persistence/server/utils/imageProcessing.ts:50` | |
| `invalidateCachedComponent` | `src/runtime/modules/render/composables/useRendererStories.ts:17` | |
| `clearComponentCache` | `src/runtime/modules/render/composables/useRendererStories.ts:10` | |
| `closePool` | `src/runtime/modules/persistence/server/postgres/client.ts:100` | Кандидат на graceful shutdown — либо подключить к nitro `close`-хуку, либо удалить |

## 2. Мёртвые типы (high)

| Тип | Файл | Примечание |
| --- | --- | --- |
| `SidebarState` | `src/runtime/modules/common/types/brick.ts:155` | Не используется нигде. Заодно: дублирует локальный `ISidebarState` из `builder/core/stores/sidebar.ts` и нарушает конвенцию префикса `I`. Удалить из common |

## 3. Лишний `export` (high — убрать ключевое слово, код оставить)

Используются **только внутри своего файла** — `export` создаёт ложную поверхность API:

| Символ | Файл |
| --- | --- |
| `formatJsonDisplayValue` | `builder/shell/sidebar/utils/propertyFormatters.ts:43` |
| `dispatchLayoutDrop` | `layouts-blocks/composables/useLayoutDropZone.ts:20` |
| `pickComparableFormState` | `builder/publish/utils/draftSnapshots.ts:18` |
| `loadTiptapModules` | `text-editor/utils/createTiptapEditor.ts:29` |
| `DEFAULT_DEVICE_VISIBILITY` | `common/utils/bricks/deviceVisibility.ts:3` |
| `formatRequestError` | `builder/publish/utils/requestErrors.ts:10` |
| `SUPPORTED_MEDIA_NODES` | `text-editor/utils/selectedMediaNode.ts:8` |
| `getPool` | `persistence/server/postgres/client.ts:41` |
| `cloneComponentSlot` | `common/utils/bricks/components.ts:42` |
| `toCamelCaseString` | `common/utils/case-transform.ts:12` |
| `PX_PER_REM` | `text-editor/utils/sizeUnits.ts:10` |
| `ISelectOption` (interface) | `builder/shell/sidebar/components/property-editors/types.ts:3` |
| `IComponentsComputed` (interface) | `builder/core/stores/types.ts:211` |

**Medium (оставить export, но осознанно):**

| Символ | Файл | Почему оставить |
| --- | --- | --- |
| `isBricksSchema` | `common/utils/bricks/publishedPage.ts:13` | Упомянут в CLAUDE.md как часть API `normalizePublishedPage`; type guard может понадобиться извне |
| `setBricksStorageAdapter`, `setBricksPublishAdapter` | `persistence/server/registry.ts:28,50` | **НЕ мёртвые**: задел под публичный subpath-export `nuxt-bricks/persistence` (запланирован, ещё не выполнен) |

## 4. Зависимости

### 4.1 Удалить (high)

| Пакет | Где объявлен | Проверка |
| --- | --- | --- |
| `scroll-lock` | peerDependencies | 0 использований в `src/` и `playground/` (grep по `scroll-lock\|scrollLock\|disablePageScroll\|enablePageScroll`) — наследие ida-landing |
| `@types/scroll-lock` | devDependencies | Следует за `scroll-lock` |

### 4.2 Решить судьбу (medium)

| Пакет | Ситуация |
| --- | --- |
| `@nuxt/test-utils` | Не используется (единственный тест — чистый vitest + `@vitejs/plugin-vue`). Но расширение тестового покрытия планировалось — если будут e2e/runtime-тесты Nuxt, оставить; иначе удалить |
| `lint-staged` + `.lintstagedrc.cjs`, `@commitlint/cli` + `@commitlint/config-conventional` + `commitlint.config.mjs` | Конфиги есть, но **не подключены**: нет `.husky/`, нет `core.hooksPath`, нет хуков в `.git/hooks`, нет CI (`.github/workflows` отсутствует). Либо подключить (husky/simple-git-hooks + `prepare`-скрипт), либо удалить все 5 артефактов |

### 4.3 Добавить в peerDependencies (medium)

`text-editor/composables/useInlineEditor.ts:136-139` напрямую импортирует `@tiptap/extension-document`, `-paragraph`, `-text`, `-hard-break`, которых нет в package.json (доступны только транзитивно через `@tiptap/starter-kit`). Остальные используемые расширения tiptap в peerDeps перечислены — эти четыре стоит добавить для консистентности (они уже в `VITE_OPTIMIZE_INCLUDE` в `src/module.ts:79-82`).

### 4.4 False positives — НЕ трогать

- `sass`, `normalize.css` — используются SCSS-пайплайном (`assets/scss/bundle.scss:1`), knip не парсит scss.
- `nitropack`, `ofetch`, `vue-router` (unlisted) — поставляются самим `nuxt`, импорт из них — норма для Nuxt-модуля.

## 5. Что проверено и чисто

- **Файлы-сироты**: 0 (knip `--include files` по `src/**` + `playground/**`).
- **SCSS**: все 5 файлов в `src/runtime/assets/scss/` подключены (bundle.scss → variables/transitions/fonts; bundle + default — entry из module.ts).
- **CLI**: `src/cli/stories-generate.mjs` → `generate-stories-json.mjs` — живые (bin `bricks-gen`).

## Ограничения анализа

- Экспорты entry-файлов (plugins, server handlers, pages, playground) knip не проверяет — там мёртвых экспортов быть может, но они и есть точки входа.
- Неиспользуемые поля возвращаемых объектов композаблов / неиспользуемые props компонентов инструментом не ловятся — отдельный ручной аудит при желании.

## Итоговый чек-лист «безопасно удалить» (для следующего захода)

1. 5 мёртвых функций из §1 (по `closePool` — решить: wire или delete).
2. `SidebarState` из `common/types/brick.ts`.
3. Убрать `export` у 13 символов из §3.
4. `scroll-lock` + `@types/scroll-lock` из package.json.
5. Решение по lint-staged/commitlint и `@nuxt/test-utils` (§4.2) — требует решения владельца.
6. Добавить 4 `@tiptap/extension-*` в peerDependencies (§4.3).
