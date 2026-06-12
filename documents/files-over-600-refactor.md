# Отчёт: файлы >600 строк и план их разбиения

## Контекст

По правилам проекта SFC не должен превышать 300–500 строк, сложная логика выносится в composables, чистые функции — в utils. После реструктуризации (этапы 1–8) осталось 12 файлов длиннее 600 строк. Цель — разбить их на компоненты/composables/utils и устранить дублирование по DRY. Ниже — анализ фактического содержимого каждого файла и план рефакторинга.

**Найденные файлы** (пути от `src/runtime/modules/`):

| Строк | Файл | Script / Template / Style |
|---|---|---|
| 1017 | `builder/media/components/TheBuilderMediaGalleryModal.vue` | 374 / 262 / 380 |
| 887 | `builder/publish/stores/publish.ts` | — |
| 850 | `builder/canvas/editing/components/BuilderCanvasInlineEditingOverlay.vue` | 582 / 110 / 156 |
| 802 | `builder/app/composables/useBuilderPage.ts` | — |
| 776 | `text-editor/components/TextEditorImageFloatPopover.vue` | 475 / 150 / 150 |
| 698 | `text-editor/components/TextEditorArea.vue` | 403 / 120 / 174 |
| 688 | `layouts-blocks/components/BlockGrid.vue` | 519 / 85 / 83 |
| 685 | `builder/shell/sidebar/components/BuilderShellSidebarPublishView.vue` | 240 / 256 / 188 |
| 665 | `layouts-blocks/components/BlockSlider.vue` | 414 / 97 / 153 |
| 651 | `builder/app/pages/[pagename].vue` | 527 / 98 / 24 |
| 649 | `builder/canvas/viewport/components/TheBuilderCanvas.vue` | 492 / 86 / 69 |
| 637 | `builder/shell/sidebar/composables/useSidebarPropertiesPanel.ts` | — |

---

## Часть 1. Сквозное дублирование (DRY) — делать в первую очередь

Эти вынесения сокращают сразу несколько файлов и убирают «обновлять в N местах».

### D1. Фабрика TipTap-редактора (×4 файла) — самый большой выигрыш

Список dynamic-imports + конфигурация extensions (StarterKit, BoldOverride, Underline, TextStyle, Color, FontFamily, FontSize, FontWeight, LineHeight, LetterSpacing, Table×4, ResizableImage/Video, TextAlign) продублирован в:

- `text-editor/components/TextEditorArea.vue` → `initEditor()` (строки 270–365)
- `text-editor/components/TheTextEditorModal.vue`
- `text-editor/composables/useInlineEditor.ts`
- `builder/canvas/editing/components/BuilderCanvasInlineEditingOverlay.vue` → `initFallbackTiptapEditor()` (строки 378–466)

**План:** создать `text-editor/utils/createTiptapEditor.ts`:
- `loadTiptapModules()` — единый `Promise.all` dynamic-imports (сохраняет lazy-loading);
- `createTiptapEditor(options: { content, editable?, editorProps?, onUpdate })` — собирает Editor с полным списком extensions; возвращает `{ editor, EditorContent }`.

Каждое из 4 мест сжимается с ~90 строк до ~10.

### D2. Синхронизация toolbar-состояния с транзакциями TipTap (×2–3 файла)

Шесть refs (`currentFontSize/FontWeight/Color/FontFamily/LineHeight/LetterSpacing`) + `editorTransactionCount` + `watchEffect` с `editor.on('transaction', …)` + вызовы `$textEditorToolbar.syncToolbarState`/`createToolbarConfig` дублируются в `TextEditorArea.vue` (59–141, 371–393) и `BuilderCanvasInlineEditingOverlay.vue` (71–82, 157–177, 316–338).

**План:** `text-editor/composables/useToolbarStateSync.ts` — принимает `editorRef` (`MaybeRef<Editor|null>`), возвращает `{ toolbarState, transactionCount, toolbarGroups }`. Убирает ~80 строк из каждого файла.

### D3. Вставка медиа в редактор (×2, дословный дубль)

`handleRequestImage()` (запрос через `inlineEditingStore.requestMedia` + ветвление image/video → `setVideo`/`setImage`) дословно совпадает в `TextEditorArea.vue:246–265` и `BuilderCanvasInlineEditingOverlay.vue:561–580`.

**План:** util `text-editor/utils/insertMediaIntoEditor.ts` — `insertMediaIntoEditor(editor, item)`; запрос медиа оставить на месте (одна строка-обёртка).

### D4. Drop-zone логика layout-блоков (×4 компонента)

`updateDropEffect()` (дословный дубль), `handleDragEnter/Over/Leave/Drop` и dispatch `CustomEvent('layout-drop')` повторяются в `BlockGrid.vue` (328–500), `BlockFlex.vue`, `BlockSection.vue`, `BlockSlider.vue` (245–359).

**План:** `layouts-blocks/composables/useLayoutDropZone.ts`:
- база: `isDragOver`, `updateDropEffect`, обработчики enter/over/leave, `dispatchLayoutDrop(el, detail)`;
- опции-хуки для специфики (`canAcceptDrop` для проверки ёмкости грида, `onDragMove` для drop-индикатора слайдера, `dragDepth` для вложенных enter/leave).

Каждый блок худеет на 80–150 строк, специфика (расчёт ячейки в гриде, индикатор в слайдере) остаётся локально.

### D5. `normalizePublishedPage` — задокументированный дубль

CLAUDE.md фиксирует: функция дублируется в `builder/publish/stores/publish.ts:145–177` и `middleware/bricks-page-layout.global.ts`, «обновлять обе копии».

**План:** вынести в `common/utils/bricks/publishedPage.ts` (вместе с `isBricksSchema`, `preserveSchema`) и импортировать из обоих мест. Ловушка «обновить обе копии» исчезает; обновить упоминание в CLAUDE.md.

### D6. Мелкие дубли

- `useBuilderPage.ts`: `showToast` (303–312) и `showToastWithDuration` (321–334) идентичны кроме параметра → одна функция `showToast(message, variant?, duration = 4000)`.
- `BlockSlider.vue`: блок captions продублирован в template для `top`/`bottom` (435–452 и 484–501) → дочерний `BlockSliderCaptions.vue` (один экземпляр + проп `position`).
- `TextEditorArea.vue`: кнопка «Развернуть» с тултипом повторена дважды в template (455–467 и 481–493) → мини-компонент или вынос из веток `v-if`.
- **Мёртвый код:** `convertBetweenUnits()` в `TextEditorImageFloatPopover.vue:193–202` нигде не вызывается — удалить.

---

## Часть 2. Пофайловый план разбиения

### 1. `TheBuilderMediaGalleryModal.vue` (1017 → ~350)

Script всего 374 строки — файл огромен из-за template (262) и стилей (380). Разбивать на дочерние компоненты (каждый забирает свой кусок template + стилей + локальное состояние):

- `BuilderMediaGalleryFilters.vue` — чипы категорий + поиск (`categoryFilter`, `searchQuery` через `v-model`);
- `BuilderMediaGalleryUploadArea.vue` — drop-зона + file input + хинты лимитов (`dragOver`, `handleFileChange/Drop`);
- `BuilderMediaGalleryGrid.vue` — грид элементов (item-карточка, выбор, превью-кнопка);
- `BuilderMediaGalleryMetaPanel.vue` — футер с filename/alt/категорией (`editableFilename/Alt`, `handleMetaBlur`);
- `BuilderMediaGalleryPreviewLightbox.vue` — полноэкранное превью.

Логику загрузки — в `builder/media/composables/useMediaUpload.ts` (`isSupportedMediaFile`, `validateFileSize`, `uploadFiles`, лимиты из конфига). `formatFileSize` → `builder/media/utils/formatFileSize.ts`. Родитель остаётся контроллером: store, выбранный элемент, confirm-удаление, toast.

### 2. `builder/publish/stores/publish.ts` (887 → ~450)

Module-level хелперы (строки 14–211, ~200 строк чистых функций) — вынести:

- `common/utils/bricks/publishedPage.ts` — `isBricksSchema`, `preserveSchema`, `normalizePublishedPage` (см. D5);
- `builder/publish/utils/formState.ts` — `buildDefaultFormState`, `normalizeFormState`, кэш `setPublishStoreBackgroundColor`;
- `builder/publish/utils/requestErrors.ts` — `formatRequestError`, `toRequestError`;
- `builder/publish/utils/draftStorage.ts` — `buildBuilderDraftKey` + тела `getBuilderDraft/setBuilderDraft/removeBuilderDraft/migrateBuilderDraft` (252–354) как чистые функции над localStorage; actions в сторе становятся однострочными обёртками (или вызывающие переходят на utils напрямую).

Внутри actions: тела `publishPage` и `updatePage` строят одинаковый snake_case payload (379–391 и 426–437) → util `buildPagePayload(schema, formState)`.

### 3. `BuilderCanvasInlineEditingOverlay.vue` (850 → ~300)

- D1 убирает ~90 строк `initFallbackTiptapEditor`;
- D2 убирает ~80 строк toolbar-синка; D3 — ещё ~20;
- `builder/canvas/editing/composables/useInlineEditingFallback.ts` — весь lifecycle fallback-редактора: `isFallbackMode`, `fallbackEditor`, `fallbackInitTimer` (watch на `isEditing` с таймером 300ms), `saveFallbackToStore`, `getCurrentPropValue`, `destroyFallbackEditor`, переинициализация при смене `propName`;
- `builder/canvas/editing/composables/useDraggableOverlay.ts` — `dragOffset`, `isDragging`, `onDragHandleMousedown` (521–548) + позиционирование `overlayStyle` с clamp к viewport (184–210);
- дочерний `BuilderCanvasInlineEditingHeader.vue` — заголовок + prop-switcher с инлайновыми SVG (template 605–658).

### 4. `useBuilderPage.ts` (802 → ~350)

Файл — composition root, должен остаться фасадом-сборщиком:

- `app/composables/usePreviewSync.ts` — BroadcastChannel, debounce-watch, `sendPreviewSchemaUpdate`, `startPreviewSync`, cleanup (67–150);
- `app/composables/useBuilderShortcuts.ts` — `shouldIgnoreKeyEvent` + handle Delete/Copy/Paste/UndoRedo + `handleKeyDown` (347–451);
- `app/composables/useComponentLibrary.ts` — `useAsyncData('bricks-components')` + `componentLibraryList` (230–294); `extractStorySlots` (166–228, чистая) → `app/utils/storySlots.ts`;
- `app/composables/useBuilderToast.ts` — состояние toast + единый `showToast` (см. D6).

Обработчики publish/media/sidebar (по 3–7 строк) остаются в фасаде — их вынос только размажет контекст.

### 5. `TextEditorImageFloatPopover.vue` (776 → ~400)

- `text-editor/utils/sizeUnits.ts` — чистые конверсии: `parseCustomDimension`, `convertToPx`, `convertFromPx`, `roundDecimal` (em-пиксели передавать параметром); удалить мёртвый `convertBetweenUnits` (D6);
- дочерний `TextEditorImageSizePanel.vue` — вся size-панель: state (`sizeWidth/Height/Unit`, `lockAspectRatio`), `applySize/Width/Height`, `cycleUnit`, `readCurrentSize`, `handleSizeInput` + template 561–621 + стили панели (~250 строк суммарно). Попавер передаёт ему `editor` и `activeNodeType`.

Float/valign-кнопки и позиционирование остаются в попавере.

### 6. `TextEditorArea.vue` (698 → ~430)

- D1 (`initEditor` → ~15 строк), D2 (toolbar-синк), D3 (`handleRequestImage`), D6 (дубль expand-кнопки). После этого script ~230 строк, остальное — template и CSS; дальше дробить не нужно.

### 7. `BlockGrid.vue` (688 → ~350)

- D4 (`useLayoutDropZone`) — enter/over/leave/drop + `updateDropEffect` + dispatch;
- `layouts-blocks/utils/gridOverlayGeometry.ts` — чистая геометрия: `columnBoundaries`, `gapRects`, `rowBoundaries`, `horizontalGapRects` (141–250) как функции от `{ width, columns, gap, rowSizes }`;
- дочерний `BlockGridOverlay.vue` — SVG-визуализация сетки (template 542–596) + geometry-utils + props `containerSize/columns/gap/rowSizes`;
- `calculateDropTargetIndex` (407–452, чистая математика по rect/scale/gap) → `layouts-blocks/utils/gridDropPlacement.ts`.

В компоненте остаются: grid-стили, нормализация props, ёмкость грида, ResizeObserver.

### 8. `BuilderShellSidebarPublishView.vue` (685 → ~450)

- Экспорт/импорт схемы (`handleExportSchema`, `handleImportClick`, `handleFileSelect`, `fileInputRef`, `importError` — 157–223) → `shell/sidebar/composables/useSchemaFileTransfer.ts` + дочерний `BuilderShellSidebarPublishSchemaActions.vue` (кнопки + hidden input + error);
- Блок OG/Twitter image (template 406–440 + media-стили) → дочерний `BuilderShellSidebarPublishSocialImage.vue`.

С publish-store пересечений нет (view — корректный потребитель стора), форма vee-validate остаётся.

### 9. `BlockSlider.vue` (665 → ~400)

- D4: база drop-zone из `useLayoutDropZone` (вариант с `dragDepth`); `updateDropIndicator` + `getDraggableSlides` (222–238, 366–412) → локальный `layouts-blocks/composables/useSliderDropIndicator.ts`;
- D6: `BlockSliderCaptions.vue` убирает дубль template;
- `parsedCaptions` (151–181, чистый парсинг JSON/массива) → `layouts-blocks/utils/sliderCaptions.ts`.

### 10. `builder/app/pages/[pagename].vue` (651 → ~300)

По правилу проекта composables в `pages/` запрещены — вся логика уходит в `app/composables/`:

- `app/composables/useBuilderSession.ts` — `openBuilderSession`, `pendingDraft`, `isRestoreDraftModalOpen`, `handleRestoreDraft/DiscardDraft`, `savedSnapshot`, watch на `routePagename` и `lastSuccessfulSaveAt` (282–367, 410–421, 478–489);
- `app/composables/useBuilderDraftPersistence.ts` — `buildCurrentSnapshot`, `persistDraftNow`, `scheduleDraftPersist` + debounce-таймер + watch history/formState (199–275, 470–476);
- `app/composables/useBuilderPagenameSync.ts` — debounce-watch синхронизации URL c `pagename` + миграция черновика (423–468);
- чистые `pickComparableFormState`, `isSnapshotEqual`, `isValidPagename` → `builder/publish/utils/draftSnapshots.ts`.

Страница остаётся: meta, dark mode cookie, деструктуризация `useBuilderPage`, template.

### 11. `TheBuilderCanvas.vue` (649 → ~350)

Рядом уже есть `useCanvas`, `useCanvasDrops`, `useCanvasPan`, `useCanvasRemBase` — продолжить паттерн:

- `viewport/composables/useCanvasCentering.ts` — `centerCanvasHorizontally`, `scheduleCanvasCenter`, `pendingCenterBehavior`, rAF-cleanup + 3 watcher'а центрирования (164–227, 315–333, 357–362);
- `viewport/composables/useCanvasContainerMetrics.ts` — `updateContainerMetrics`, `containerResizeObserver` (+ переподключение при смене `containerRef`), watcher'ы на components/viewport/figmaMode (96, 305–309, 343–400, 405–416);
- `viewport/composables/useInteractivePreviewDismiss.ts` — capture-обработчик `handleInteractivePreviewOutsideClick` + add/removeEventListener (245–264).

`onMounted/onBeforeUnmount` сожмутся до вызовов init/cleanup композаблов.

### 12. `useSidebarPropertiesPanel.ts` (637 → ~250)

Монолит с 25+ возвращаемыми значениями. Разрезать по зонам ответственности (фасад сохраняет текущий API — компоненты не трогаем):

- `shell/sidebar/utils/propertyEditorComponents.ts` — мапа `componentEditors` из `defineAsyncComponent` (59–87);
- `shell/sidebar/composables/useSidebarResponsiveScope.ts` — `isResponsiveLayout`, `hasResponsiveStoryValues`, `isResponsiveComponent`, `layoutDeviceScope`, overrides/merge (`selectedComponentDataForVariants`), `handleSetLayoutDeviceScope`, `handleResetLayoutDeviceScopeOverrides`, watcher'ы синка с viewport (91–179, 305–323, 587–606);
- `shell/sidebar/composables/useSidebarMediaSelection.ts` — `currentMediaContext`, `handleOpenMediaGallery`, `handleMediaSelect`, `handleImageGalleryMediaSelect` (433–567);
- `shell/sidebar/composables/useStoryDescription.ts` — `storyDescription` + `loadStoryDescription` + watcher (270–303).

`handleChangeValues` остаётся в фасаде (зависит и от scope, и от coercion).

---

## Часть 3. Приоритеты

| Приоритет | Шаг | Эффект |
|---|---|---|
| 1 | D1 фабрика TipTap | −300 строк в 4 файлах, единая точка extensions |
| 2 | D4 `useLayoutDropZone` | −400 строк в 4 блоках |
| 3 | D5 `normalizePublishedPage` → common | убирает задокументированную ловушку |
| 4 | D2+D3 toolbar-sync + insertMedia | −180 строк в 2 файлах |
| 5 | publish.ts utils (п.2) | store −400 строк |
| 6 | [pagename].vue + useBuilderPage (п.4, 10) | composition root в норму |
| 7 | Покомпонентные разбиения (п.1, 3, 5, 7–9, 11–12) | независимые задачи |

Шаги независимы и коммитятся отдельно (паттерн «stage N» как в истории репо). Поведенческих изменений нет — только перенос кода.

## Верификация

После каждого шага:
- `npx vue-tsc --noEmit 2>&1 | grep <изменённые-файлы>` и `npx oxlint <изменённые-файлы>` (правило CLAUDE.md);
- `npm run dev` + ручная проверка затронутой зоны: inline editing (dblclick на канвасе, fallback-редактор story-компонентов), drag&drop в Grid/Flex/Section/Slider, медиа-галерея (загрузка/фильтры/превью/meta), публикация (валидация, draft restore при перезагрузке, preview-вкладка с live-синком), переключение viewport/Figma mode (центрирование канваса), панель свойств (responsive-табы, выбор медиа для image/inline-content/gallery);
- финально: `npm run build`.

---

## Журнал выполнения

### ✅ Шаг 1 (D1) — фабрика TipTap-редактора — 2026-06-12

Создан `text-editor/utils/createTiptapEditor.ts` (`loadTiptapModules` + `createTiptapEditor`).
Переведены: `TextEditorArea.vue`, `TheTextEditorModal.vue`, `useInlineEditor.ts`,
`BuilderCanvasInlineEditingOverlay.vue`. Не закоммичено (в рабочем дереве вместе с шагом 2).

### ✅ Шаг 2 (D4) — `useLayoutDropZone` — 2026-06-12

Создан `layouts-blocks/composables/useLayoutDropZone.ts` (210 строк) + типы
`layouts-blocks/types/dropZone.d.ts`. База: `isDragOver`, `updateDropEffect`,
enter/over/leave/drop, self-drop guard, `dispatchLayoutDrop()`. Хуки специфики:
`canAcceptDragOver`/`canAcceptDrop` (ёмкость грида), `onDragMove` (drop-индикаторы),
`useDragDepth`, `isEnabled` (слайдер — только редактор), `extraDropDetail` (`{ swap: true }`).

Блоки: BlockGrid 688→626, BlockSlider 665→569, BlockFlex 412→336, BlockSection 335→259
(−407 строк). Специфика осталась локально: грид — расчёт ячейки + ёмкость;
flex/section/slider — свои `updateDropIndicator`.

**Сознательные унификации (поведение на канвасе не меняется):**
- self-drop guard теперь общий — у слайдера его не было, но на published обработчики
  отключены через `isEditor`;
- guard слайдера `if (!props.layoutId)` убран — канвас всегда передаёт `layoutId`
  (`registry.ts:218`), flex/section и раньше диспатчили без проверки.

Верификация: oxlint чисто, vue-tsc без новых ошибок. Ручная проверка drag&drop — TODO
перед коммитом.

### ✅ Шаг 3 (D5) — `normalizePublishedPage` → common — 2026-06-12

Создан `common/utils/bricks/publishedPage.ts`: `isBricksSchema`, `preserveSchema`,
`normalizePublishedPage(rawPage, defaultBackgroundColor?)` + экспорт констант
`DEFAULT_BACKGROUND_COLOR`/`DEFAULT_LAYOUT`. Обе копии удалены; store и middleware
импортируют util. CLAUDE.md обновлён (ловушка «обновлять обе копии» снята).

**Сознательные унификации при слиянии копий (расхождения версий):**
- вход — `unknown` с проверкой record (строгая версия из middleware); store раньше
  принимал `Partial<IPublishedPage>` — вызовы совместимы;
- дефолтный фон — параметром: store передаёт `resolveDefaultBackgroundColor()`
  (кэш app config), middleware использует дефолт `#FFFFFF` — поведение обоих сохранено;
- `isPreview` теперь прокидывается и в store-пути (раньше только в middleware) —
  поле опциональное, `TPublishFormState` его исключает, на формы не влияет.

publish.ts 887→818, middleware 205→123. Верификация: oxlint чисто; vue-tsc — без новых ошибок
(`LayoutKey` из `#build/types/layouts` в middleware — pre-existing, есть на чистом дереве).

### ✅ Шаг 4 (D2+D3) — toolbar-sync + insertMedia — 2026-06-12

Созданы:
- `text-editor/composables/useToolbarStateSync.ts` (138 строк) — шесть refs состояния
  + `editorTransactionCount` + watchEffect-подписка на `transaction` + computed
  `toolbarGroups` (`createToolbarConfig`); `useBricksConfig`/`useNuxtApp` вызываются
  внутри. Принимает `MaybeRefOrGetter<Editor | null>` (shallowRef компонента или getter
  store), опция `isEnabled` — внешний guard видимости; экспортирует `resetToolbarState()`;
- `text-editor/utils/insertMediaIntoEditor.ts` — ветвление image/video → `setImage`/`setVideo`.

Переведены **3** файла (план обещал 2–3 — модалка тоже дублировала оба блока):
TextEditorArea.vue 698→552, TheTextEditorModal.vue 457→374,
BuilderCanvasInlineEditingOverlay.vue 850→693 (−386 строк суммарно).
Из всех трёх ушли `$textEditorToolbar`/`useBricksConfig`/`availableFonts`; сброс
toolbar state в overlay при смене `propName` — через `resetToolbarState()`.

Верификация: oxlint чисто, vue-tsc — 0 ошибок по изменённым файлам. Ручная проверка
toolbar (выделение/курсор-синк selects, вставка медиа в трёх редакторах) — TODO перед коммитом.

### ✅ Шаг 5 — publish.ts → utils (п.2) — 2026-06-12

Созданы `builder/publish/utils/`:
- `formState.ts` — кэш `cachedBackgroundColor` + `setPublishStoreBackgroundColor` (импорт
  в `useBuilderPage.ts` обновлён на utils), `resolveDefaultBackgroundColor`,
  `buildDefaultFormState`, `normalizeFormState`;
- `requestErrors.ts` — `formatRequestError`, `toRequestError`;
- `draftStorage.ts` — `buildBuilderDraftKey` (приватный) + `get/set/remove/migrateBuilderDraft`
  как чистые функции над localStorage; actions стора — однострочные обёртки
  (API стора сохранён, вызывающие не тронуты — [pagename].vue перейдёт на utils в шаге 6);
- `pagePayload.ts` — `buildPagePayload(schema, formState): ICreatePagePayload` (camelCase),
  store шлёт `toSnakeCaseShallow(buildPagePayload(...))` — снят snake_case-дубль
  publishPage/updatePage и переиспользован существующий `case-transform`.

**Сознательная правка типов:** `ICreatePagePayload.title/description/keywords` расширены до
`string | null` — старый inline-body уже отправлял null (`TPublishFormState` наследует
null от `IPublishedPage`), сервер делает `payload.title ?? null`; тип приведён к реальности.

publish.ts 818→614 (до ~450 не дошёл: в сторе остались обёртки c JSDoc и настоящая
логика — валидация, copy, preview; module-level хелперов больше нет).
Верификация: oxlint чисто, vue-tsc — 0 ошибок по изменённым файлам (остались только
pre-existing из «Заметок»). Ручная проверка публикации/черновиков — TODO перед коммитом.

### Заметки / всплывшее по ходу

- **Pre-existing ошибки vue-tsc на main** (не из рефакторинга, починить отдельно):
    - `BlockGrid.vue` → `overlayStyle`: computed возвращает union с `{}`,
      несовместимо с `Record<string, string>` (TS2769);
    - `BlockSpace.vue:82` → `spaceStyle`: тот же паттерн union с optional-полями (TS2769);
    - `render/pages/[pagename].vue:94,154,328` — TS2554/TS2339 вокруг `useAsyncData`-обёртки.
- Шаг 9 (BlockSlider) сможет переиспользовать `useLayoutDropZone`: останется вынести
  `updateDropIndicator` + `getDraggableSlides` в `useSliderDropIndicator` и captions
  в `BlockSliderCaptions.vue`.
