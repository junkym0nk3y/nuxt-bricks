# Реструктуризация `src/runtime/modules/`: смысловая группировка + модульный нейминг

Статус: **в работе**. Выполняем поэтапно, каждый этап — отдельный коммит, в конце этапа зелёный `npx vue-tsc --noEmit` + `npx oxlint src/`.

## Мотивация

Плоская структура из 11 доменов в целом устраивает, но сущности слишком абстрактны: вне контекста непонятно, что `canvas`, `sidebar`, `toolbar`, `media` — части билдера, а `builder/` стал свалкой (ядро состояния + composition root + документация + publish, 43 файла / ~7.5k строк). Решения:

1. **Двухуровневая группировка по смыслу продукта** — части редактора уезжают под `builder/`; внутри — смысловые группы (`shell/` для sidebar+toolbar, нарезка canvas на viewport/item/editing); TipTap-домен переименовывается в `text-editor/`.
2. **Нейминг компонентов отражает модульную цепочку**: `TheBuilderShellSidebar`, `BuilderCanvasItem` и т.п. `The` — только для синглтонов. Корневой CSS-класс (`$style`) переименовывается вслед за компонентом.
3. **Ревизия типов**: устранить дубли, разнести по новым модулям, исправить нарушения нейминга (`T*` у интерфейсов).

## Целевая структура

```
src/runtime/modules/
├── builder/                       # редактор целиком
│   ├── app/                       # composition root
│   │   ├── pages/                 # builder.vue, [pagename].vue
│   │   ├── components/            # BuilderLogo.vue, TheBuilderLoader.vue
│   │   ├── composables/           # useBuilderPage, useModals, useComponentProperties, useDraggableComponent
│   │   └── types/                 # builder.d.ts, composables.d.ts, modals.d.ts, draggable.d.ts
│   ├── core/                      # ядро состояния (общее для canvas/shell — перенос в фичи дал бы цикл)
│   │   ├── stores/                # components, componentActions, actions/*, history, canvas, sidebar, navigation, types.ts
│   │   ├── utils/                 # history, inlineEditableProp, layoutProperties, scrollToComponent, slots
│   │   └── constants/             # layoutComponents.ts
│   ├── shell/                     # рамка редактора вокруг канваса
│   │   ├── sidebar/               # бывший modules/sidebar (внутренняя структура как есть)
│   │   └── toolbar/               # бывший modules/toolbar
│   ├── canvas/                    # бывший modules/canvas; внутри каждого слайса — components/ + composables/
│   │   ├── viewport/              # components/: TheBuilderCanvas, BuilderCanvasViewport, BuilderCanvasToolbar,
│   │   │                          #   BuilderCanvasEmptyState, BuilderCanvasConditionalContainer
│   │   │                          # composables/: useCanvas, useCanvasPan, useCanvasRemBase, useCanvasDrops
│   │   ├── item/                  # components/: BuilderCanvasItem*; composables/: useCanvasItem*, useComponentSlots, useSlotDragDrop
│   │   ├── editing/               # components/: BuilderCanvasInlineEditingOverlay; composables/: useCanvasItemInlineEditing
│   │   └── types/                 # canvas.d.ts, composables.d.ts (+ влит components/types.d.ts)
│   ├── publish/                   # управление страницами / публикация
│   │   ├── pages/                 # index.vue (дашборд)
│   │   ├── components/            # TheBuilderPublishPagesModal, BuilderPublishPageCard
│   │   ├── stores/                # publish.ts (зависит только от common)
│   │   └── types/                 # builderDrafts.d.ts + модальные типы
│   ├── documentation/
│   │   ├── components/            # TheBuilderDocumentationModal
│   │   ├── composables/           # useDocumentationArticles, useMarkdownRenderer
│   │   ├── docs/guide/            # 8 markdown-статей
│   │   └── types/                 # documentation.d.ts
│   └── media/                     # бывший modules/media (используется только билдером)
├── text-editor/                   # бывший modules/editor (TipTap) — общий: используют builder И layouts-blocks
├── layouts-blocks/                # без изменений
├── render/                        # без изменений
├── persistence/                   # без изменений
├── ui/                            # без изменений
└── common/                        # без изменений
```

### Направления зависимостей

- `builder/app` (composition root) → все поддомены builder + text-editor + ui
- `builder/canvas` / `builder/shell` → `builder/core`, `builder/publish`, text-editor, layouts-blocks, ui, common
- `builder/core` НЕ импортирует canvas/shell (обратных импортов из ядра в фичи быть не должно)
- `render` → common + layouts-blocks
- `layouts-blocks` → text-editor (+ tech-debt: BlockSlider → builder/core/stores/canvas)
- `text-editor`, `ui`, `common` от builder не зависят

## Нейминг компонентов

**Правило:** имя = цепочка модульных сегментов пути (Builder → Shell → Sidebar → …) + роль; `The` — только синглтоны; корневой CSS-класс в `$style` = имя компонента. Технические сегменты (`components/`, `property-editors/`) в имя не входят. `Bricks*` (ui-кит), `Block*` (layouts-blocks), `Renderer*` (render) уже несут модульный префикс — не трогаем.

| Было | Станет |
|---|---|
| sidebar/TheSidebar | TheBuilderShellSidebar |
| sidebar/Sidebar* (ComponentsView, ComponentCard, NavigationEditor, PropertiesView, PropertyEditors, PropertyEditorRow, PublishView, SchemaTreeView, SchemaTreeItem) | BuilderShellSidebar* (тот же хвост) |
| sidebar/property-editors/Property* (AccordionItemsEditor, ImageGalleryEditor, InlineContentEditor, JsonEditor, MediaPicker) | BuilderShellSidebarProperty* (тот же хвост) |
| toolbar/TheToolbar | TheBuilderShellToolbar |
| toolbar/ToolbarVerticalNav | BuilderShellToolbarVerticalNav |
| canvas/TheCanvas | TheBuilderCanvas |
| canvas/Canvas* (Viewport, Toolbar, EmptyState, ConditionalContainer, Item, ItemComponent, ItemLayout, ItemToolbar, InlineEditingOverlay) | BuilderCanvas* (тот же хвост) |
| builder/modal/ThePublishedPagesModal | TheBuilderPublishPagesModal |
| builder/modal/PublishedPageCard | BuilderPublishPageCard |
| builder/modal/TheDocumentationModal | TheBuilderDocumentationModal |
| media/TheMediaGalleryModal | TheBuilderMediaGalleryModal |
| media/TheImageResolverModal | TheBuilderMediaImageResolverModal |
| media/ImageResolverItem | BuilderMediaImageResolverItem |
| editor/TiptapImageFloatPopover | TextEditorImageFloatPopover |
| editor/TextEditorArea, TheTextEditorModal | без изменений |
| builder/BuilderLogo, TheBuilderLoader | без изменений (сегмент `app` в имя не включаем) |

Каждое переименование = имя файла + все импорты + использования в `<template>` + корневой `$style`-класс (+ ссылки на класс в SCSS). Композаблы не переименовываем (вне скоупа).

## Ревизия типов

- Дубль `ISelectedComponentData`: `sidebar/types/composables.d.ts` ↔ `builder/stores/types.ts` → одно определение в `builder/core/stores/types.ts`, sidebar импортирует (сверить поля).
- Дубль `IBrickUiCommonProp`: `ui/base/action-button/types.d.ts` ↔ `ui/inputs/types.d.ts` → общий файл в `ui/`.
- `TMediaOptimization`, `TResolvedMediaConfig` в `media/types/media.d.ts` — это `interface` → `IMediaOptimization`, `IResolvedMediaConfig`.
- `builder/types/*` разнести: composables/modals/draggable/builder → `app/types/`; documentation → `documentation/types/`; builder-drafts → `publish/types/builderDrafts.d.ts`; `components/modal/types.d.ts` разнести между publish и documentation.
- `canvas/components/types.d.ts` влить в `builder/canvas/types/`.
- Удалять орфанные типы по ходу переноса.

## Этапы

- [x] **Этап 0.** Создать этот файл.
- [x] **Этап 1.** toolbar, sidebar → `builder/shell/` — `git mv` целиком + правка относительных импортов (глубина +2). Без переименований компонентов. _(коммит dbd9bf5)_
- [x] **Этап 2.** canvas → `builder/canvas/` с нарезкой на `viewport/`, `item/`, `editing/` (файлы плоско), `components/types.d.ts` → `types/components.d.ts`. _(коммит f758769)_
- [x] **Этап 3.** media → `builder/media/` — `git mv`, правка импортов. Дополнительно: серверные media-типы (`TFormData`, `TMediaOptimization`, `TResolvedMediaConfig`, `IValidated*`, `IBuildUploadedItemParams`) вынесены из `media/types/media.d.ts` в `persistence/types/media.d.ts` — их использовал только persistence, иначе persistence зависел бы от builder. _(коммит 4ce4c41)_
- [x] **Этап 4.** Разрез корня builder на `app/`, `core/`, `publish/`, `documentation/` + разнос `builder/types/*`. Обновить `src/module.ts` (`extendPages`): `modules/builder/app/pages/builder.vue`, `modules/builder/publish/pages/index.vue`, `modules/builder/app/pages/[pagename].vue`. `stores/navigation.ts` остаётся в `core/`.
  Уточнения по результатам разведки (этапы 1–3):
  - `composables/useComponentProperties.ts` → **`core/composables/`** (не app: его импортируют canvas/item/useCanvasItemActions и shell/sidebar/SidebarSchemaTreeView).
  - `components/BuilderLogo.vue` → **`core/components/`** (не app: его импортирует shell/toolbar/TheToolbar). `TheBuilderLoader.vue` → `app/components/` (только app).
  - `components/modal/types.d.ts` разрезать: `IPublishModal*`, `IPublishedPagesModal*`, `IPublishedPageCard*` → `publish/types/`; `IDocumentationModal*` → `documentation/types/`.
  - `types/builder-drafts.d.ts` → `publish/types/builderDrafts.d.ts` (camelCase по naming.md).
  - Tech-debt (не чинить, обновить путь): `editor/composables/useInlineEditor.ts` импортирует `builder/stores/components` → станет `builder/core/stores/components`. text-editor не должен зависеть от builder — кандидат на DI из composition root, отдельной задачей.
  - Взаимные ссылки `stores/ ↔ utils/ ↔ constants/` сохраняют форму `../X/`, т.к. все едут в `core/` вместе. Аналогично `publish/stores ↔ publish/types` и `documentation/composables ↔ documentation/types`. _(коммит d56d612)_
  Заметка по факту: `core/composables/useComponentProperties.ts` импортирует `getModalOptions` из `app/composables/useModals` — обратная зависимость core → app, кандидат на вынос `getModalOptions` отдельной задачей (вместе с tech-debt editor → builder/core).
- [x] **Этап 5.** editor → `text-editor/` — `git mv` + правка импортёров + grep по `src/runtime/plugins/`, `src/module.ts`, `src/runtime/server/`. Импортёров оказалось 7 (builder/app, builder/canvas/editing ×2, builder/shell/sidebar ×2, layouts-blocks ×2); plugins/module.ts/server на модуль не ссылаются (`text-editor-toolbar.ts` и `json-editor-vue` — ложные срабатывания grep по слову editor). Smoke: dev-сервер поднялся, `/builder` — 200, ошибок резолва нет (500 от `/api/bricks/published/` — не поднят локальный Postgres, к переносу не относится). Заметка: `npx vue-tsc --noEmit` даёт 16 унаследованных ошибок (render/[pagename].vue, documentation/useDocumentationArticles, BlockGrid/BlockSpace) — воспроизводятся на HEAD до этапа, этапом не добавлены.
- [x] **Этап 6.** Переименование компонентов по таблице (под-этапы: shell → canvas → модалки/media → text-editor). Файл + импорты + template + `$style`-классы. Заметки по факту:
  - Замены — `perl -pi` с `\b`-границами по всему `src/runtime`, поэтому composables (`useCanvasItem*`) и типы (`ISidebarPropertyEditorsProps`, `IPublishedPagesModal*` — этап 7) не задеты; обновились и комментарии/`console.warn`-префиксы со старыми именами.
  - Три компонента имели корневой `$style`-класс ≠ имени компонента, приведены к правилу: `.NavigationEditor`, `.PropertyEditors`, `.row` (SidebarPropertyEditorRow) → имя компонента.
  - Без корневого класса остались wrapper'ы: `BuilderCanvasItemComponent`/`BuilderCanvasConditionalContainer`/`BuilderCanvasItemLayout` (корень — чужой компонент/рендер-функция), медиа-модалки (корень — `BricksModal`) — переименовывать нечего.
  - Verification: vue-tsc — те же унаследованные ошибки (12, см. этап 5), oxlint чисто, grep по старым именам/классам пуст, smoke `/builder` — 200 (500 от `/api/bricks/published/` — локальный Postgres не поднят).
- [x] **Этап 6б.** По фидбеку: внутри canvas-слайсов (`viewport/`, `item/`, `editing/`) плоская смесь файлов разведена на `components/` + `composables/` (`types/` без изменений). `git mv` + сдвиг относительных импортов на уровень глубже; кросс-слайсовые ссылки — через подпапки (`../../item/components/...`). Внешний импортёр один — `app/pages/[pagename].vue`. Stores остаются в `core/stores/` (решение подтверждено).
- [ ] **Этап 7.** Ревизия типов (дубли, `T*`-интерфейсы, орфаны).
- [ ] **Этап 8.** Обновить `CLAUDE.md` (Architecture, «Ключевые файлы»), `.claude/rules/naming.md` (правило модульной цепочки; modal-исключение отменяется).

## Verification (после каждого этапа)

```bash
npx vue-tsc --noEmit
npx oxlint src/
```

После этапов 5 и 6 дополнительно:

```bash
grep -rn "modules/editor\|modules/canvas\|modules/sidebar\|modules/toolbar\|modules/media" src/ playground/
grep -rn "TheSidebar\|TheToolbar\|TheCanvas[^I]\|PublishedPagesModal" src/
npm run dev   # smoke: /builder — создать блок, свойства, модалка страниц, документация, медиа-галерея
```

`$style`-классы vue-tsc не проверяет — после этапа 6 grep по старым именам классов.

## Что НЕ меняется

- Pinia store id (`bricksPublish` и т.д.) и публичное API сторов.
- `layouts-blocks`, `render`, `persistence`, `ui`, `common` — не двигаются; `Bricks*`/`Block*`/`Renderer*` не переименовываются.
- Композаблы — имена не меняются, только пути.
- Bundle firewall `layouts-blocks/canvasBlockComponents.ts`.
- Глобальные классы-конвенции (`.bricks-container`, `.bricks-canvas`, `.bricks-dark`).
