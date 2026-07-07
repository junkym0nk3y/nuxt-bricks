# Аудит архитектуры nuxt-bricks — 2026-07-07

Полный аудит кодовой базы: архитектура, мёртвый код, стили, оптимизация, best practices, тесты, безопасность.
Метод: инструменты (knip, dependency-cruiser, oxlint, stylelint, vue-tsc, скриптовые grep-проверки) + 6 параллельных агентов-аудиторов по направлениям; топ-находки верифицированы вручную чтением кода.

**Объём:** ~50k LOC — 90 `.vue`, 220 `.ts`, 5 `.scss`; 7 доменов в `src/runtime/modules/`.

---

## Резюме

Кодовая база в **отличном состоянии**: границы доменов соблюдаются полностью (dependency-cruiser: 0 нарушений на 364 модуля / 1241 зависимость), мёртвого кода почти нет (knip: 0 неиспользуемых файлов, 2 экспорта), нейминг и конвенции выдержаны, cleanup ресурсов и TipTap-паттерны — чисто, README-навигация актуальна.

**Топ-5 проблем** (все верифицированы вручную):

1. **[P1, security] SQL-инъекция через имена колонок** в `buildUpdateQuery` — ключи тела запроса интерполируются в `SET` без whitelist.
2. **[P1, bundle] Граф builder-сторов протекает в published-бандл** через статический импорт `useInlineEditor` в `BlockText.vue`.
3. **[P1, bundle] `vanilla-jsoneditor` (~200KB+) грузится на каждой странице**, включая published — глобальный клиентский плагин ради одного lazy-редактора.
4. **[P1, bundle] Swiper eager в published** — попадает на каждую опубликованную страницу, даже без слайдера.
5. **[P1, API] Документированный публичный API `nuxt-bricks/persistence` не существует** — subpath-экспорт не объявлен в `package.json`.

Системные (не точечные) улучшения: сквозной `Record<string, any>` в layouts-blocks/render, отсутствие типов возврата у ~30 композаблов, нулевое тестовое покрытие `common/` и `builder/core` при 40 тестах в publish, пробелы правил oxlint (`no-explicit-any`, `eqeqeq`, `max-lines: 1000` vs лимит SFC 500).

---

## 0. Baseline (состояние до аудита)

| Инструмент                  | Результат                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `oxlint` (весь репозиторий) | ✅ 0 ошибок / 0 предупреждений                                                                              |
| `depcruise src/runtime`     | ✅ 0 нарушений (364 модуля, 1241 зависимость)                                                               |
| `stylelint`                 | ⚠️ 1 ошибка — `ui/base/button/BricksButton.vue:191` `order/properties-order` (в незакоммиченных изменениях) |
| `vue-tsc --noEmit`          | ⚠️ **7 существующих ошибок** (см. ниже)                                                                     |

Ошибки vue-tsc (все — типовые шимы, не рантайм):

- `definePageMeta` отсутствует в `#imports` — `playground/pages/index.vue:4`, `builder/app/pages/[pagename].vue:11`, `builder/app/pages/builder.vue:4`
- `LayoutKey` отсутствует в `#app` — `middleware/bricks-page-layout.global.ts:1,113`
- `setLocale` отсутствует на типе `Composer` — `builder/app/pages/[pagename].vue:49`, `builder/publish/pages/index.vue:34`

Рекомендация: починить шимы (`common/types/global.d.ts`), иначе правило CLAUDE.md «grep по изменённому файлу» пропускает реальные ошибки на этих файлах.

---

## 1. Мёртвый код — категория почти чистая ✅

Прогон `knip` с конфигом под Nuxt-модуль (entry: `module.ts`, cli, plugins, server, middleware, pages, `.brick.ts`, registry): **0 неиспользуемых файлов**. Находки:

| Находка                                                                                                                                                                                                                                                  | Файл                                                                | Приоритет | Действие                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | --------- | ----------------------------------------------------------------- |
| `isBricksSchema` — экспорт без внешних использований (вызывается только внутри своего файла)                                                                                                                                                             | `common/utils/bricks/publishedPage.ts:13`                           | P3        | Убрать `export` (упомянут в CLAUDE.md — обновить и там)           |
| `ISpacingMirrorSlot` — экспорт не нужен (используется только в union того же файла)                                                                                                                                                                      | `builder/shell/sidebar/components/property-editors/types.ts:73`     | P3        | Убрать `export`                                                   |
| `setBricksStorageAdapter` / `setBricksPublishAdapter` — **публичный API**, задокументирован как `import ... from 'nuxt-bricks/persistence'`, но **subpath-экспорта `./persistence` в `package.json` нет** — потребитель физически не может импортировать | `persistence/server/registry.ts:28,50` + `package.json` (`exports`) | **P1**    | Добавить subpath-экспорт (и сборку) либо убрать обещание из JSDoc |
| Ключи локалей `bricks.common.save`, `bricks.common.close` не используются (остальные 467 — используются, 12 «подозрительных» — динамические ключи)                                                                                                       | `locales/ru.json`, `en.json`                                        | P3        | Удалить или оставить как заготовку common-неймспейса              |
| Иконка `ta:outline-adjustments-horizontal` — 1 из 80 не используется                                                                                                                                                                                     | `plugins/vue-icons.ts`                                              | P3        | Удалить из `SYSTEM_ICONS`                                         |
| Peer-зависимости `@vee-validate/yup` и `upath` не импортируются нигде в `src/` (`@vee-validate/yup` — только в `VITE_OPTIMIZE_INCLUDE`)                                                                                                                  | `package.json`                                                      | P3        | Удалить из peerDependencies + из optimize-списка                  |

**Рекомендация в тулинг:** добавить knip в devDependencies + `knip.ts`-конфиг (проверен в этом аудите, даёт чистый сигнал):

```ts
export default {
    entry: [
        'src/module.ts',
        'src/cli/**/*.ts',
        'build.config.ts',
        'src/runtime/plugins/**/*.ts',
        'src/runtime/server/**/*.ts',
        'src/runtime/middleware/**/*.ts',
        'src/runtime/layouts/**/*.vue',
        'src/runtime/modules/**/pages/**/*.vue',
        'src/runtime/modules/**/*.brick.ts',
        'src/runtime/modules/layouts-blocks/registry.ts',
        'src/runtime/modules/layouts-blocks/canvasBlockComponents.ts',
        'playground/**/*.{ts,vue}',
    ],
    project: ['src/**/*.{ts,vue}'],
    ignore: ['dist/**', '.nuxt/**', 'src/runtime/types.d.ts'],
    ignoreDependencies: [/.*/],
    compilers: {
        vue: (text: string) =>
            [...text.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gm)].map((m) => m[1]).join(';'),
    },
};
```

---

## 2. Стили

### Мёртвые CSS-переменные (`assets/scss/shared/_variables.scss`)

- `--rgb-layout-svg` (строка 61) — 0 использований `var()`, соседние `--rgb-layout-{slider,grid,flex}` используются. **P3: удалить.**
- `--bricks-primary-200` (строки 33, 104, 150 — включая тёмную тему) — 0 использований. **P3: удалить все три объявления.**
- ⚠️ **НЕ трогать**: блок `--base-0…--base-900`, `--body-color`, `--background-color` (строки ~184-194) — это намеренный reset переменных проекта-потребителя для канваса (комментарий «Reset playground variables for canvas components»). Grep показывает 0 использований, но они перекрывают внешние переменные.

### Нарушения правил `.claude/rules/styles.md`

Чистые категории: `!important` — 0, `backdrop-filter` — 0, SCSS-переменные `$` — 0, `em` для размеров — 0 (есть только `em` в letter-spacing — см. ниже).

**px вместо rem** (P3, кроме осознанных):

- `builder/app/components/TheBuilderLoader.vue:254` (`background-size: 40px 40px`), `:304` (`border-radius: 2px`)
- `builder/core/components/BuilderLogo.vue:193,205` (`--cube-lift: -26px`)
- `builder/canvas/item/components/BuilderCanvasItem.vue:254,259,263,331` — `outline/border: 2px` (для outline канваса допустимо оставить осознанно, но перевести в `0.2rem` дёшево)
- `BuilderShellSidebarPropertyImageGalleryEditor.vue:389`, `BuilderShellSidebarPropertyAccordionItemsEditor.vue:305` — `border: 2px dashed`
- `border-radius: 999px` (pill-хак): `BuilderMediaGalleryGrid.vue:174`, `BuilderMediaGalleryFilters.vue:102`, `BlockSection.vue:255`, `BlockFlex.vue:322` — завести токен `--border-radius-pill`
- `builder/app/pages/builder.vue:15` `font-size: 10px` — **осознанно** (rem-база билдера, см. CLAUDE.md), не трогать

**rem не кратные 0.2** (P3): `1.1rem` — `BuilderShellSidebarPropertyEditors.vue:415`, `BuilderCanvasInlineEditingHeader.vue:126`, `BuilderCanvasInlineEditingOverlay.vue:337`, `BuilderPublishDashboardNav.vue:220`, `TextEditorImageSizePanel.vue:330,395`, `BlockSliderCaptions.vue:92`; `0.3rem` — `BuilderCanvasInlineEditingOverlay.vue:319`, `BlockSlider.vue:351,353`; `0.05rem` letter-spacing — `BuilderShellSidebarComponentsView.vue:368`, `BuilderCanvasViewport.vue:307`, `BlockSliderCaptions.vue:83`; `99.9rem` — `BuilderPublishPagesListRow.vue:229` (→ pill-токен); `0.1rem` в calc — `BricksToolbarColorPicker.vue:260`; сетка default.scss:399-418.

**Хардкод hex вместо переменных** (P3): `color: #fff` → `var(--bricks-base-0)` в `BuilderCanvasInlineEditingOverlay.vue:326,383`, `BuilderMediaGalleryPreviewLightbox.vue:80`, `BuilderMediaGalleryGrid.vue:154`, `BricksTextEditorToolbar.vue:326`, `BricksToolbarEditableSelect.vue:427`. Блоки hex в `TextEditorArea.vue:438-466,614` и `TheTextEditorModal.vue:363-389` — намеренный форс светлой темы области ввода: вынести в собственные токены, но поведение сохранить. Переопределения токенов hex'ами в превью-контекстах (`BuilderShellSidebarComponentCard.vue:408-442` и др.) — не нарушение.

**Прочее** (P3): `em` в letter-spacing (`BuilderShellSidebarPropertyEditors.vue:417,465`, `BuilderShellToolbarVerticalNav.vue:288`, `BuilderPublishDashboardNav.vue:222`); `transition:` внутри ~13 компонентов `ui/` вместо `transitions.scss`; px-брейкпоинты в media-query (`BricksSelect.vue:191`, `BricksInput.vue:406`, `BlockText.vue:117,121` — для брейкпоинтов приемлемо, можно узаконить в правилах).

---

## 3. Архитектура

### Границы доменов — ✅ полностью чисто

Все декларированные правила CLAUDE.md соблюдаются (проверено grep'ом всех кросс-доменных импортов + depcruise): `builder/core` ↛ canvas/shell/app (кроме известного tech-debt), `render` → только common+layouts-blocks, `layouts-blocks` ↛ builder, `persistence` — только из server/api, `ui` и `common` — без кросс-доменных импортов. Composables в `pages/` — нет. README.md — во всех 22 папках composables//utils/, спот-чек 5 штук — актуальны.

### Tech-debt импорты — оба декаплятся дёшево (P2)

**3a. `builder/core/composables/useComponentProperties.ts:7,118` → `app/composables/useModals.getModalOptions`** — тривиально. `getModalOptions` зависит только от кеша `bricks.json` + i18n, ничего app-специфичного. Вынести `loadModals` + `getModalOptions` в `builder/core/composables/useModalOptions.ts`, `app/useModals` реэкспортирует. Call-sites (2) не меняются.

**3b. `text-editor/composables/useInlineEditor.ts:18` → `builder/core/stores/components`** — средняя сложность, но **это же корень P1-протечки бандла** (см. §5.1). Используются 3 метода стора: `getComponentById`, `updateComponentProp` (×6), `saveToHistory` (×3). Решение: порт-интерфейс `IInlineEditorHost { getPropValue, updateProp, commitHistory }` в `text-editor/types`, провайд из composition root через `provide/inject` (ключ в `common/constants/injectionKeys`), `BlockText` берёт через `inject`. Один фикс закрывает и tech-debt, и протечку.

### God-files >500 строк — 9 файлов (P2)

Правило: SFC ≤300–500 строк. Схемы декомпозиции:

| Файл                                                                                             | Строк | Что извлечь                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builder/publish/components/BuilderPublishDetailsPanel.vue`                                      | 739   | Под-компоненты `...DetailsSeoFields` / `...DetailsRouting` / `...DetailsOgImage`; `liveUrl`/clipboard → `composables/usePublishDetailsUrl.ts`                                      |
| `builder/publish/stores/publish.ts`                                                              | 630   | API-слой → `utils/publishApi.ts`; валидация → `utils/formValidation.ts`; превью → `composables/usePublishPreview.ts`; стор — только state + оркестрация                            |
| `text-editor/components/TextEditorArea.vue`                                                      | 617   | `initEditor` + code-view/background-тогглы → `composables/useTextEditorArea.ts`                                                                                                    |
| `builder/shell/sidebar/composables/usePropertyVariants.ts`                                       | 616   | 13 почти одинаковых `handle*Variant` → реестр-мапа `Record<TPropertyType, VariantBuilder>` в `utils/variantBuilders.ts`; `handleNormalizeProps` → `utils/normalizeVariantProps.ts` |
| `render/pages/[pagename].vue`                                                                    | 532   | data-sources → `composables/useRendererDataSources.ts`; preview-sync (BroadcastChannel/resize) → `composables/useRendererPreviewSync.ts`                                           |
| `builder/shell/sidebar/components/BuilderShellSidebarComponentCard.vue`                          | 523   | Превью-масштабирование (ResizeObserver, ~половина файла) → `composables/useComponentCardPreview.ts`; drag → `useComponentCardDrag.ts`                                              |
| `ui/inputs/BricksInput.vue`                                                                      | 515   | Чистые хелперы (normalize/sanitize/roundToStep) → `utils/bricksInput.ts`; валидация + степпер → `composables/useBricksInput.ts`                                                    |
| `builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertySpacingEditor.vue` | 508   | edit-state/степпер → `composables/useSpacingEditor.ts`; 4 стороны → общий под-компонент                                                                                            |
| `builder/shell/sidebar/components/BuilderShellSidebarPublishView.vue`                            | 508   | Форм-логика → `composables/useSidebarPublishForm.ts`; частично дублирует DetailsPanel — рассмотреть общий `usePublishForm`                                                         |

### Прочее

- `render/components/RendererCloseButton.vue` — осознанная копия `ui/base/modal/BricksCloseButton.vue` (render не может импортировать ui). Оставить; опционально общий `@mixin close-button` в `assets/scss/shared/`, чтобы стили не разъезжались. (P3)
- Закрепить проверку границ в CI — `deps:check` уже есть в `lint:check`, достаточно гонять в CI.

---

## 4. Best practices (соответствие `.claude/rules/`)

Чистые категории по всем доменам: `==`/`!=` — 0; `as any`/`as unknown as` в builder/ui/common — 0; bare-props в шаблонах — 0 (спот-чек ~15 компонентов); cleanup таймеров/слушателей/observers — образцово (все проверенные `addEventListener`/`setTimeout`/`ResizeObserver`/`BroadcastChannel` чистятся); debounce на поиске/resize — есть; computed с сайд-эффектами — 0; нейминг компонентов и композаблов — 0 нарушений; `withDefaults` в `ui/` — везде.

### TypeScript

| Находка                                                                                                                                                                                                | Файл                                                                                                                                                                                        | Приоритет |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `value: any` в `validatePropertyValue` → `unknown` (внутри уже type-guards)                                                                                                                            | `builder/core/composables/useComponentProperties.ts:175`                                                                                                                                    | P2        |
| `getSelectorType` — switch → `Record<TPropertyType, string>`                                                                                                                                           | `builder/core/composables/useComponentProperties.ts:150`                                                                                                                                    | P2        |
| **Сквозной `Record<string, any>`** — `layouts-blocks/utils/responsiveVars.ts` (6 мест), все `block*.definition.ts`, `render/components/TheRenderer.vue:79` → `Record<string, unknown>` одной зачисткой | layouts-blocks/, render/                                                                                                                                                                    | P2        |
| `as unknown as`                                                                                                                                                                                        | `text-editor/tiptap/resizableImage.ts:162,177`, `render/composables/useBricksDataSources.ts:77`                                                                                             | P2        |
| `as any` на пропсах Swiper → типы Swiper (`AutoplayOptions` и т.д.)                                                                                                                                    | `layouts-blocks/components/BlockSlider.vue:249-251`                                                                                                                                         | P3        |
| `catch (error: any)` → `unknown`                                                                                                                                                                       | `common/utils/routing/bricks-api.ts:37`                                                                                                                                                     | P3        |
| `Record<string, any>` в generic                                                                                                                                                                        | `common/utils/bricks/components.ts:13`                                                                                                                                                      | P3        |
| Inline error-cast `(error as { data?... })` ×5 — уже есть утилита `normalizeBricksError` (`common/utils/main.ts:125`), переиспользовать + общий `IApiError` в types                                    | `builder/media/stores/media.ts:85`, `TheBuilderMediaGalleryModal.vue:96`, `persistence/server/postgres/client.ts:74`, `server/routes/mock-api/s3-image.post.ts:111`, `s3-delete.post.ts:36` | P2        |
| switch → map: `mapFlexJustify`/`mapFlexAlign` (`layouts-blocks/components/blockFlex.definition.ts:22,44`), `BricksActionButton.vue:68`                                                                 | —                                                                                                                                                                                           | P3        |
| **Систематически: нет явных типов возврата у ~30 композаблов** (`export function useX() {`) — правило требует типизацию возврата                                                                       | builder/ повсеместно                                                                                                                                                                        | P2        |

### Vue SFC

- `BuilderCanvasBottomBar.vue:30` — `defineProps` без `withDefaults` при опциональных пропсах (`sidebarOffset?`, `isFigmaMode?`) — P2; ещё 11 компонентов builder/ без `withDefaults` (только обязательные пропсы) — P3.
- `BuilderShellSidebarPropertyEditors.vue` — порядок `#region`: Data (123) стоит после Computed (38) — P3.
- `useCanvasWheel.ts:107` — единственный `.then()` в builder: `nextTick().then(...)` → `await nextTick()` — P3.

### TipTap-паттерны (CLAUDE.md) — ✅ все чисто

`shallowRef` для Editor — везде; `editor.destroy()` на unmount — везде; `isInternalUpdate` — корректно (сброс через `Promise.resolve().then()`); `@mousedown.prevent` — на всех selection-чувствительных кнопках. Одна дырка конвенции: **`BlockAccordion.vue:132`** — `item.content` (rich-HTML) рендерится через `v-html` без `data-tiptap-content` → `ul`/`ol` внутри аккордеона не получат стили. P2 (баг отображения).

---

## 5. Оптимизация и бандл

### 🔴 P1 — протечки в published-бандл (все верифицированы)

**5.1. Граф builder-сторов в published.** `layouts-blocks/components/BlockText.vue:10` статически импортирует `useInlineEditor` → `text-editor/composables/useInlineEditor.ts:18` статически импортирует `useComponentsStore` → за ним весь граф: `componentActions` + `actions/{crud,slots,properties,selection,schema,clipboard,order,favorites}` + `useHistoryStore`/`useNavigationStore`/`useSidebarStore` + `utils/history`. BlockText — leaf-блок, его `.vue` в published по дизайну, но сторы билдера там не нужны (inline-editing на published не активен — модуль всё равно бандлится). **Фикс = декаплинг 3b (§3): host-интерфейс через inject; заодно уходит tech-debt импорт.**

**5.2. `vanilla-jsoneditor` на каждой странице.** `plugins/json-editor-vue.client.ts:1` — модульный `import JsonEditorVue from 'json-editor-vue'`, плагин глобальный (`module.ts:330`, `mode: 'client'`). Единственный потребитель — lazy `BuilderShellSidebarPropertyJsonEditor.vue:62`. Глобальная регистрация сводит lazy на нет. **Фикс:** убрать глобальный плагин, импортировать `JsonEditorVue` локально внутри ленивого редактора.

**5.3. Swiper eager в published.** `BlockSlider.vue:21-22` — статические `swiper/vue` + `swiper/modules`; цепочка `registry.ts` → `blockSlider.definition.ts:13` → `BlockSlider.vue` статична ⇒ Swiper на каждой published-странице, даже без слайдера. **Фикс:** в `blockSlider.definition.ts` отдавать `defineAsyncComponent(() => import('./BlockSlider.vue'))` для published-пути (канвасу eager-мапа не мешает).

### 🟡 P2 — глобальные плагины на published

Все плагины `module.ts:324-332` без route-scope. На published лишние: `vue-icons.ts` (~40 статических иконок builder-UI), `vee-validate.ts` (vee-validate + rules + yup; в render/layouts-blocks ни одного useForm/useField), `text-editor-toolbar.ts` (~15KB конфига; TipTap не тянет — только type-import). **Фикс:** ранний `return` по роуту внутри плагинов либо инициализация по `/bricks`.

### Прочее

- **P2**: `builder/app/composables/usePreviewSync.ts:111-127` — `watch(componentsStore.components, { deep: true })` по всей схеме (deep-обход до debounce 300ms). Заменить на ревизию/версию стора.
- **P3**: eager-импорт модалок в `builder/app/pages/[pagename].vue:35-36` (`TheBuilderDocumentationModal`, `TheBuilderMediaGalleryModal`) → `defineAsyncComponent` (builder-only, влияние ограничено).
- **P3**: `JSON.parse(JSON.stringify())` ×5 (`common/utils/bricks/components.ts:18`, `useDraggableComponent.ts:172`, `useCanvasDrops.ts:330,390`, `useCanvasItemDrag.ts:41`) → `structuredClone` (объекты маленькие, приоритет низкий).
- **Чисто ✅**: ядро render/ без импортов builder/ui/text-editor; контейнерные definitions (Grid/Flex/Section/Space) не импортируют `.vue`; `canvasBlockComponents.ts` — единственный импортёр `BuilderCanvasItemLayout.vue` (firewall цел); TipTap и markdown-it — полностью динамические; sharp — server-only; property-editors — все lazy; history store ограничен 50 снапшотами; `Promise.all` где нужно уже есть; git-гигиена (dist/.nuxt/.playwright-mcp/bricks.json игнорируются).

---

## 6. Безопасность (сервер)

### 🔴 P1 — SQL-инъекция через имена колонок (верифицировано чтением всей цепочки)

`persistence/server/postgres/queryBuilders.ts:56-63`: `buildUpdateQuery` интерполирует **ключи тела запроса** как имена колонок: `updates.push(\`${column} = $${paramIndex}\`)`. Цепочка: `updatePageFromEvent` (`server/utils/pageUpdate.ts`) → `readNormalizedBody`(только`toCamelCaseShallow`, **без фильтрации ключей**) → `storage.updatePage(id, body)`→`buildUpdateQuery(payload)`. `toSnakeCaseString`не вырезает спецсимволы — ключ вида`{"a=(SELECT ...)--": 1}`попадает в`SET`как есть. Затронуты`updatePage`и`updateMedia` (`postgresStorageAdapter.ts:113,207`). Значения параметризованы, имена колонок — нет.

Смягчение: модифицирующие API за Basic Auth, но дефолтный пароль — `change-me`.

**Фикс:** whitelist колонок в `buildUpdateQuery` (`Set` допустимых полей per-таблица), неизвестные ключи отбрасывать.

### P2

- `server/middleware/basic-auth.ts:76` — сравнение кредов не константного времени → `crypto.timingSafeEqual`; дефолт `password: 'change-me'` (`module.ts:174`) — ронять старт в production без явного пароля.
- ✅ (2026-07-07) `persistence/server/postgres/client.ts` — `query`/`params` теперь логируются только вне production (`NODE_ENV`), в production — `code`/`message`.

### P3

- `media/index.post.ts` — не валидируются `size`/`mimeType`/`category` (тип/enum).
- Остальное чисто: все `WHERE`/`VALUES` параметризованы, try/catch на DB/S3 — полное покрытие, секретов в логах нет.

---

## 7. Тесты и типизация

### Покрытие — перекос в один домен

40 тестов в 8 файлах (`test/`), **все — builder/publish** + один юнит layouts-blocks (`responsiveCss`). **Ноль тестов**: `common/` (фундамент!), `builder/core` (history/canvas/components stores), `ui/`, `text-editor/`, `render/`, `persistence/`.

Приоритетные кандидаты (чистые функции, высокий fan-in, проверены — тестируются без Nuxt/DOM):

1. `common/utils/case-transform.ts` — нормализация всех ответов backend
2. `common/utils/bricks/publishedPage.ts` — `normalizePublishedPage` (критично для рендера)
3. `common/utils/bricks/deviceVisibility.ts` — SEO/aria-классы
4. `builder/core/utils/history.ts` + `stores/history.ts` — undo/redo (off-by-one риски), стор тестируется через `setActivePinia` как publish-тесты
5. `layouts-blocks/utils/responsiveVars.ts` (парная к покрытому responsiveCss) и `gridOverlayGeometry.ts` (чистая геометрия)
6. `common/utils/main.ts` (`convertPxToRem`, `validateHex`, `normalizeHex`)
7. **После фикса §6**: `buildUpdateQuery` — тест на whitelist/инъекцию

### Типизация

- `strict: true` действует (через `.nuxt/tsconfig.json`) ✅; `noUncheckedIndexedAccess: false` — стоит включить точечно (case-transform, responsiveVars живут на `record[key]`) — P3.
- `typescript.typeCheck` не включён — типы гоняются только вручную (`npm run type-check`). Закрепить vue-tsc в CI — P2.
- `types.d.ts`-шимы актуальны ✅; конвенция `types/*.d.ts` соблюдается (inline — только IProps/IEmits и Options/Return-формы функций) ✅.

### Пробелы oxlint (P2)

- `max-lines: 1000` противоречит лимиту SFC 300–500 → снизить до ~500 (все 9 god-файлов сейчас проходят линт).
- Нет `typescript/no-explicit-any` — при живых `any` в ~15 файлах и прямом запрете в правилах → включить хотя бы `warn`.
- Нет `eqeqeq` (сейчас нарушений 0 — закрепить правилом) и `no-console` (`["warn", { allow: ["warn", "error"] }]`).

---

## Приоритизированный backlog

### P1 — баги, безопасность, протечки бандла — ✅ все выполнены 2026-07-07

1. ✅ **SQL-инъекция**: whitelist колонок в `buildUpdateQuery` (`PAGE_UPDATE_FIELDS`/`MEDIA_UPDATE_FIELDS` в `queryBuilders.ts`) + тест `test/persistenceQueryBuilders.spec.ts` (6 кейсов, включая инъекцию через имя колонки).
2. ✅ **Протечка сторов в published**: `useInlineEditor` декаплен от `useComponentsStore` — порт `IInlineEditorHost` (`common/types/inlineEditing.d.ts`) + `INLINE_EDITOR_HOST_KEY` (`common/constants/injectionKeys.ts`), провайдит `TheBuilderCanvas.vue`; text-editor больше не импортирует builder (tech-debt §3b закрыт). Без хоста (published) редактор не инициализируется.
3. ✅ **vanilla-jsoneditor глобально**: плагин `plugins/json-editor-vue.client.ts` удалён (и из `module.ts`), `JsonEditorVue` + `Mode` импортируются локально в lazy `BuilderShellSidebarPropertyJsonEditor.vue`.
4. ✅ **Swiper eager**: в `blockSlider.definition.ts` — `defineAsyncComponent(() => import('./BlockSlider.vue'))`; канвас по-прежнему берёт eager-версию из `canvasBlockComponents.ts`.
5. ✅ **`nuxt-bricks/persistence`**: subpath-экспорт `./persistence` добавлен в `package.json` (`exports` + `typesVersions` → `dist/runtime/modules/persistence/server/registry`).
6. ✅ **Basic Auth**: сравнение кредов через `timingSafeEqual` по SHA-256-дайджестам (без short-circuit по логину); в production с дефолтным паролем `change-me` защищённые пути отвечают 503.

Верификация: vue-tsc (0 новых ошибок), oxlint — чисто, depcruise — 0 нарушений (364 модуля / 1245 зависимостей), vitest — 46/46. Прод-сборка не прогонялась (шёл dev-сервер).

### P2 — рефакторинг и системные улучшения

7. ✅ (2026-07-07) Декаплинг §3a: кеш модалок + `loadModals`/`getModalOptions`/`getCachedModal`/`isModalsCacheLoaded` вынесены в `builder/core/composables/useModalOptions.ts` (типы — `core/types/modals.d.ts`); `app/useModals` — фасад (`getModalComponent`/`getModalComponentLazy`), call-sites не менялись. Верификация: vue-tsc (0 новых), oxlint чисто, depcruise 0 нарушений (365/1247), vitest 46/46.
8. Декомпозиция 9 god-файлов по схемам §3 (по одному за сессию).
    - ✅ (2026-07-07) `BuilderPublishDetailsPanel.vue` 739→420 строк: под-компоненты `...DetailsPanelSeoFields` (Title/pagename/description/keywords, 196), `...DetailsPanelOgImage` (136), `...DetailsPanelRouting` (self-contained toggle+поля, 153) через `v-model:*`; `liveUrl`+clipboard → `composables/usePublishDetailsUrl.ts` (73). Типы под-компонентов + `TPublishFormErrors` — в `types/dashboard.d.ts`, README composables обновлён. Верификация: vue-tsc 0, oxlint/stylelint чисто, depcruise 0 (374/1286), vitest 46/46, Playwright (редактирование Title→dirty→save-bar, Routing-раскрытие, Cancel-сброс, консоль чистая).
    - ✅ (2026-07-07) `publish/stores/publish.ts` 630→479 строк: API-слой → `utils/publishApi.ts` (6 request-функций: CRUD `/api/bricks` + нормализация ответов, ошибки через `toRequestError`); валидация → `utils/formValidation.ts` (`validatePublishFormState` — чистая, возвращает `{formState, errors}`, та же ссылка если trim ничего не изменил; action `validateOptionalRoutingFields` удалён — влит в утилиту); превью → `composables/usePublishPreview.ts` (`previewCurrentPage` теперь возвращает `pagename | null` — `useBuilderPage.handlePreview` больше не перечитывает localStorage; `generatePreviewUrl` переехал туда же, actions превью из стора удалены). Call-sites: `useBuilderPage.ts`, `publish/pages/index.vue`, тест `publishStoreCreatePage.spec.ts` (generatePreviewUrl → композабл). README utils/composables обновлены. Верификация: vue-tsc 0, oxlint чисто, depcruise 0 (377/1302), vitest 46/46, Playwright-смоук (дашборд/список, patch Title→save→revert, превью с дашборда и из редактора, Save changes в редакторе — updated_at подтверждён через API, консоль без ошибок).
    - ✅ (2026-07-07) `TextEditorArea.vue` 617→461 строк: вся логика редактора (lazy-инициализация/destroy TipTap, синк props value/disabled/placeholder, тогглы code-view/тёмного фона, обработчики контента и вставки медиа, toolbarGroups) → `composables/useTextEditorArea.ts` (248); в SFC — только модалка-expand, классы, шаблон и стили. README composables обновлён (заодно снята устаревшая пометка tech-debt у useInlineEditor).
    - ✅ (2026-07-07) `usePropertyVariants.ts` 616→148 строк: 13 `handle*Variant` → реестр `VARIANT_BUILDERS: Partial<Record<TPropertyType, TVariantBuilder>>` в `utils/variantBuilders.ts` (258; общие фабрики `createArrayValueBuilder`/`createDisplayValueBuilder`, отдельно `buildSelectVariant`-эвристика и `buildInputVariant`-fallback); `handleNormalizeProps` → `utils/normalizeVariantProps.ts` (60). Порядок диспатча сохранён точно: boolean → select-эвристика (options 2+) → реестр → input. README utils обновлён.
    - ✅ (2026-07-07) `render/pages/[pagename].vue` 532→234 строки: data sources → `composables/useRendererDataSources.ts` (223; кеш brick-объявлений, useAsyncData, мердж props, dev-логи; композабл синхронный — хуки регистрируются до await, странице отдаётся промис `ready` для top-level await, иначе onMounted терял инстанс — поймано Playwright-смоуком); preview-sync → `composables/useRendererPreviewSync.ts` (214; localStorage-снапшот со свежестью, BroadcastChannel, visibilitychange, ResizeObserver + computed баннера device/resolution, closePreview). README composables обновлён. Playwright: дашборд, редактор `/bricks/test` (панель свойств, textarea-редактор, code-view тоггл), `/preview/test` (баннер, live-refresh data sources), live `/test` — консоль без ошибок.
    - ✅ (2026-07-07) `…SidebarComponentCard.vue` 523→322 строки: превью (lazy-загрузка brick-компонента, contain-масштабирование, ResizeObserver + watchers, `componentProps`) → `composables/useComponentCardPreview.ts` (242); dragstart через инжектированный `dragComposable` → `composables/useComponentCardDrag.ts` (36). README composables обновлён. Верификация: vue-tsc 0, oxlint чисто, depcruise 0 (384/1328), vitest 46/46, Playwright-смоук (панель Components: 9 layout-карточек с thumbnail'ами, dragstart идёт через новый `useComponentCardDrag`, консоль чистая; live-превью brick-компонентов в playground не проверить — `.brick.ts` там нет, ветка падает в icon/thumbnail как и раньше).
    - ✅ (2026-07-07) `ui/inputs/BricksInput.vue` 515→258 строк: чистые хелперы (`normalizeIncomingValue`, `sanitizeUserInput` — принимает type/min параметрами, `roundToStep`, новый `clampToRange` — заменил дублированный min/max-клампинг в blur и степпере) → `utils/bricksInput.ts` (107); валидация VeeValidate, атрибуты нативного input, обработчики input/blur/step и watcher → `composables/useBricksInput.ts` (225; типы `IBricksInputEmitFn`/`IBricksInputNativeAttributes`/`IUseBricksInputReturn` — в `inputs/types.d.ts`); в SFC — только props/emits, `classList` (нужен `$style`), шаблон и стили. README для новых папок `inputs/composables|utils` созданы. Верификация: vue-tsc 0, oxlint/stylelint чисто, depcruise 0 (386/1335), vitest 46/46, Playwright-смоук (панель Flex: степпер gap 24→25, ввод «3.7» → на blur округление к шагу «254», консоль без ошибок).
    - ✅ (2026-07-07) `…PropertySpacingEditor.vue` 508→145 строк: логика (слоты сторон top/bottom/left/right, isMargin, contentLabel, шаг степпера, инлайн-ввод с clamp/parse) → `composables/useSpacingEditor.ts` (213; return-интерфейс `IUseSpacingEditorReturn` в `types/composables.d.ts`; обработчики принимают `TSpacingSlot` с guard'ом на mirror); трижды продублированная разметка степпера + зеркальный чип → под-компонент `…SpacingEditorSide.vue` (207; props `ISidebarPropertySpacingEditorSideProps`, `vertical` для левой стороны, `v-model:editing-value`, собственный i18n для aria). README composables обновлён. Верификация: vue-tsc 0, oxlint/stylelint чисто, depcruise 0 (388/1342), vitest 46/46, Playwright-смоук (Flex → Spacing: степпер top 0→0.2 с зеркалом bottom, инлайн-ввод «1,5»→1.5, Esc-отмена, undo ×2 — консоль без ошибок; потребовался рестарт dev-сервера — Vite отдавал 404 на новый `.vue`).
    - ✅ (2026-07-07) `…SidebarPublishView.vue` 508→417 строк: вся форм-логика (state из publish-стора, validation schema, layout-опции/facets, formKey, initialValues, fullUrlPreview, `handleUpdateField`/`handleMediaSelect`/`handleClearSocialImage`/`handleLayoutChange`, onMounted-дефолты backgroundColor/layout) → `composables/useSidebarPublishForm.ts` (148; return-интерфейс `IUseSidebarPublishFormReturn` + `IPublishFormInitialValues` в `types/composables.d.ts`); в SFC — emits-форвардеры (`close`/`openMediaGallery`/`importSchema`), `defineExpose(handleMediaSelect)`, шаблон и стили. Общий `usePublishForm` с DetailsPanel не заводился — модели форм разные (сайдбар: store `currentFormState` + vee-validate `Form`; дашборд: локальный form-state с dirty/cancel). README composables обновлён. Верификация: vue-tsc 0, oxlint чисто, stylelint чисто, depcruise 0 (389/1351), vitest 46/46, Playwright-смоук (редактор `/bricks/test` → Settings: все поля заполнены из стора, ввод URL Prefix «blog» → превью `/blog/test`, закрытие панели — ошибок консоли в сессии 0).
    - **Все 9 god-файлов декомпозированы ✅.**
9. ✅ (2026-07-07) Зачистка типов: `Record<string, any>` → `unknown` в `responsiveVars.ts` (6 мест), всех 7 `block*.definition.ts`, `TheRenderer.vue`; `as unknown as` убраны все 3 (`getValueByPath` принимает `object | null` — cast не нужен; в `resizableImage.ts` — интерфейс `IResizableNodeViewInternals` + нормализация `getNodeViewInternals`); `validatePropertyValue` — `unknown`. Заодно switch→map: `getSelectorType` (`SELECTOR_TYPE_BY_PROPERTY`), `mapFlexJustify`/`mapFlexAlign` (из п.20). Остались осознанно: `props: Record<string, any>` в `common/types/brick.ts` (ядро типа, отдельная волна) и generic в `cloneComponentProps` (P3).
10. ✅ (2026-07-07) Route-scope плагинов: общий гейт `plugins/utils/builderRouteScope.ts` (`runOnBuilderRoute` — await'ится в async-плагине на начальном builder-URL через `useRequestURL`, SPA-переход покрыт `router.beforeResolve`). vue-icons: реестр разделён — ядро `plugins/icons/systemIconsRegistry.ts` (shallowReactive; photo/video/x/device-\* — нужны published/preview) + lazy `plugins/icons/builderIcons.ts` на `/bricks`; vee-validate и text-editor-toolbar перенесены в `plugins/builder/*Setup.ts` за `import()`. Проверено Playwright: дашборд/редактор/настройки — иконки и формы ок, консоль чистая (после фикса гонки гидрации); превью и published — работают, lazy-чанки не запрашиваются, Swiper JS на published без слайдера не грузится. Заодно удалена мёртвая иконка `ta:outline-adjustments-horizontal` (из п.17); обновлены CLAUDE.md и `/add-icon`.
11. ✅ (2026-07-07) `usePreviewSync`: deep-watch схемы заменён на `componentsStore.$onAction` (after-хук, чёрный список немутирующих actions `NON_SCHEMA_ACTIONS`); прямые мутации вне actions (useDraggableComponent) покрыты — завершаются `saveToHistory`.
12. ✅ (2026-07-07) Общий `IApiError` в `common/types/bricks-api.d.ts` + `getBricksErrorMessage` в `common/utils/main.ts` (`data.message` → `statusMessage` → `message` → fallback); все 5 inline-кастов переведены (media store, MediaGalleryModal, postgres client, s3-image, s3-delete); заодно закрыт P2 §6 — postgres client в production логирует только `code`/`message` без `query`/`params`.
13. ✅ (2026-07-07) Тулинг: oxlint — `max-lines: 500` (все файлы проходят), `eqeqeq: error`, `typescript/no-explicit-any: warn`, `no-console: warn` (allow warn/error; override off для build-time/CLI: `module.ts`, `src/cli`, `common/utils/routing`) — итог 0 ошибок / ~40 warnings (все `any`/console — известные из §4); knip добавлен в devDependencies + `knip.ts` (persistence registry — entry как публичный API), скрипт `knip:check` включён в `lint:check`; создан CI `.github/workflows/ci.yml` (npm ci → dev:prepare → lint:check → vue-tsc → vitest). Заодно из п.17: убраны экспорты `isBricksSchema` (CLAUDE.md обновлён) и `ISpacingMirrorSlot`, плюс новый неиспользуемый экспорт `IPreviewDeviceBreakpoint` (useRendererPreviewSync). Верификация: lint:check exit 0 (depcruise 389/1351, knip чисто), vue-tsc 0, vitest 46/46.
14. ✅ (2026-07-07) Тесты: +38 (46→84, 13 файлов) — `test/commonCaseTransform.spec.ts` (рекурсивные/shallow конверсии, иммутабельность, примитивы), `test/commonPublishedPage.spec.ts` (preserveSchema, normalizePublishedPage: snake_case→camelCase без трансформации schema, дефолты, невалидная schema, updatedAt→createdAt fallback), `test/commonDeviceVisibility.spec.ts` (normalize/классы/aria-hidden по desktop), `test/coreHistory.spec.ts` (clampHistory: лимит/сдвиг индекса/иммутабельность; serialize/deserialize round-trip с разрывом ссылок и Windows-путями; useHistoryStore через setActivePinia: undo/redo без off-by-one, отрезание redo-ветки, лимит 50, reset). Верификация: vitest 84/84, vue-tsc 0, oxlint чисто, knip чисто.
15. ✅ (2026-07-07) `data-tiptap-content` добавлен на `v-html`-контент в `BlockAccordion.vue`.
16. ✅ (2026-07-07) Починены 7 baseline-ошибок vue-tsc: в `common/types/global.d.ts` добавлены шимы `definePageMeta` (в `#imports`), `NuxtLayouts`/`LayoutKey` (открытый словарь в `nuxt/app` — имена layout'ов потребителя неизвестны в module-окружении) и `ComposerCustom.setLocale` (в `vue-i18n`). vue-tsc — 0 ошибок.

### P3 — косметика

17. ✅ (2026-07-07) Мёртвое: удалены `--rgb-layout-svg` и все объявления `--bricks-primary-200` (включая light-reset в `…SidebarComponentCard.vue`), ключи `bricks.common.save`/`close` из обеих локалей, peer deps `@vee-validate/yup` (и из `VITE_OPTIMIZE_INCLUDE` в `module.ts`) и `upath`, lockfile пересобран. (Иконка `ta:outline-adjustments-horizontal` удалена в п.10; экспорты `isBricksSchema`/`ISpacingMirrorSlot` убраны в п.13.) Верификация: lint:check exit 0, vue-tsc 0, vitest 84/84.
18. Стили: px→rem (2px-бордеры, 999px→`--border-radius-pill`), rem кратные 0.2, `#fff`→`var(--bricks-base-0)`, em→rem в letter-spacing, transitions → `transitions.scss`; узаконить px-брейкпоинты media-query в правилах.
19. ❌ (2026-07-07, отклонено) `structuredClone` вместо `JSON.parse(JSON.stringify())` (×5): все 5 мест клонируют props из реактивного стора — `structuredClone` бросает `DataCloneError` на Vue-Proxy (а `toRaw` разворачивает только верхний уровень), JSON-клон прокси-безопасен. Объекты маленькие, выигрыша нет, риск рантайм-падения в drag&drop есть — оставляем как было.
20. ✅ (2026-07-07) `withDefaults` в `BuilderCanvasBottomBar.vue` (sidebarOffset/rightSidebarOffset/isFigmaMode); порядок `#region` в PropertyEditors (Data перед Computed); `await nextTick()` в `useCanvasWheel.zoomAtPoint` (стал async, call-sites — fire-and-forget); switch→map в `BricksActionButton.vue` (`ACTION_EMITTERS: Record<string, () => void>` — union event-имён не проходит через overload'ы emit); модалки Documentation/MediaGallery в `[pagename].vue` — `defineAsyncComponent` (отдельные чанки). Осталось «при касании файлов»: 11 компонентов с только-обязательными пропсами без `withDefaults`, типы возврата ~30 композаблов. Верификация: vue-tsc 0, oxlint чисто, vitest 84/84, Playwright-смоук (редактор `/bricks/test`: кнопочный зум 85%→95% с transform, lazy-модалка документации открылась и отрендерилась; консоль без ошибок — единственный warning это существовавший ранее Reka a11y про Description у DialogContent).
21. ✅ (2026-07-07) stylelint-ошибка в `BricksButton.vue:191` устранена в рамках коммита декомпозиций — `sl:check` чист.

### Не подтверждено / не трогать

- Блок `--base-0…900` + `--background-color` в `_variables.scss` — grep показывает 0 использований, но это намеренный reset внешних переменных для канваса. Удалять только после проверки в playground с реальным проектом-потребителем.
- `database/init.sql` в git — вероятно намеренно (схема без секретов).
- `%` в стилях (`100%`/`50%` для позиционирования) — массово и практически неизбежно; предлагается узаконить как исключение в `styles.md`, а не чинить.

---

## Чистые категории (проверено, нарушений нет)

Границы доменов (depcruise + grep) · нейминг компонентов/композаблов · README-навигация (22/22, актуальны) · composables в pages · `==`/`!=` · cleanup таймеров/слушателей/observers · debounce · TipTap-паттерны (shallowRef, destroy, isInternalUpdate, mousedown.prevent) · bundle firewall контейнерных блоков · render purity (без Pinia, SSR-safe) · `!important`/`backdrop-filter`/SCSS-переменные · git-гигиена · `Promise.all` · `withDefaults` в ui/ · type-шимы `types.d.ts` · oxlint/depcruise — зелёные.
