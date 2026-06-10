# План переименований (нейминг-консолидация)

Выполняется по правилам из `refactor.md` → «Свод правил нейминга и структуры внутри доменов».
**По одному шагу за сессию.** После выполнения шага — отметить чекбокс и закоммитить.

Все пути — от `src/runtime/` (домены — в `src/runtime/modules/`).

## Чеклист каждого шага

1. `git mv` файлов по таблице шага.
2. Обновить импорты/теги в перечисленных файлах (импортёры найдены заранее, см. шаг).
3. **Корневой CSS-класс** корневого элемента переименовать в новое имя компонента
   (PascalCase), обновить все `$style.<старый>` внутри файла.
4. Зачистить упоминания старого имени в логах/комментариях (`console.warn('[BricksCanvas]...')`).
5. Проверки:
    ```bash
    npx vue-tsc --noEmit 2>&1 | grep -iE "<новые-имена>"
    npx oxlint <изменённые-файлы>
    grep -rn "<СтароеИмя>" src/   # → пусто (кроме ожидаемых упоминаний в documents/, они правятся в шаге 13)
    ```
6. Коммит: `refactor(naming): <шаг>`.

> ⚠️ Pre-existing ошибки vue-tsc (TS2769) живут в `BricksCanvas.vue`, `BricksGrid.vue`,
> `BricksSpace.vue` — после переименования они останутся под новыми именами. Не чинить
> в рамках шага, не считать регрессией.

---

## Шаг 1. canvas — контейнер ✅ (2026-06-11)

| git mv (в `modules/builder/components/canvas/`) | Новый корневой класс |
| ----------------------------------------------- | -------------------- |
| `BricksCanvas.vue` → `TheCanvas.vue`             | `.LandingCanvasContainer` → `.TheCanvas` |
| `BricksCanvasEmptyState.vue` → `CanvasEmptyState.vue` | `.emptyState` → `.CanvasEmptyState` |
| `BricksCanvasToolbar.vue` → `CanvasToolbar.vue`  | `.BricksCanvasToolbar` → `.CanvasToolbar` |
| `BricksCanvasViewport.vue` → `CanvasViewport.vue`| `.BricksCanvasViewport` → `.CanvasViewport` |

Где обновить ссылки:

- `TheCanvas.vue` — импорты `BricksCanvasToolbar`, `BricksCanvasEmptyState`, `BricksCanvasViewport` (строки ~29–32) + теги в шаблоне. Импорт `BricksCanvasItem` НЕ трогать (шаг 2).
- `builder/pages/[pagename].vue:33` — `import BricksCanvas from '../components/canvas/BricksCanvas.vue'` → `TheCanvas`.
- Комментарии/логи: `builder/composables/useLandingCanvasDrops.ts` (3 × `console.warn('[BricksCanvas]...')`), упоминания `BricksCanvasViewport`/`BricksCanvas` в комментариях `useCanvasItemLayout.ts`, `useLandingCanvas.ts`.

## Шаг 2. canvas — items ✅ (2026-06-11)

> Примечание: `.slotContainer` в `CanvasItemComponent.vue` оказался **не** корневым классом
> (корень — динамический `component`/`CanvasConditionalContainer`, а `slotContainer` — внутренняя
> slot drop-zone), поэтому оставлен как есть.

| git mv (в `modules/builder/components/canvas/`) | Новый корневой класс |
| ----------------------------------------------- | -------------------- |
| `BricksCanvasItem.vue` → `CanvasItem.vue`        | `.canvasItem` → `.CanvasItem` |
| `BricksCanvasItemComponent.vue` → `CanvasItemComponent.vue` | `.slotContainer` → `.CanvasItemComponent` (проверить по шаблону, что корневой именно он) |
| `BricksCanvasItemLayout.vue` → `CanvasItemLayout.vue` | нет style-блока |
| `ConditionalContainer.vue` → `CanvasConditionalContainer.vue` | нет style-блока |

Где обновить ссылки:

- `TheCanvas.vue` — `import BricksCanvasItem from './BricksCanvasItem.vue'` + тег.
- `CanvasViewport.vue:23` — импорт `BricksCanvasItem` + тег.
- `CanvasItem.vue` — импорты `BricksCanvasItemLayout`, `BricksCanvasItemComponent` (~27–28).
- `CanvasItemComponent.vue` — импорты `BricksCanvasItem` (рекурсия), `ConditionalContainer` (~12–13).
- `CanvasItemLayout.vue` — импорты `BricksCanvasItem`, `ConditionalContainer` (~29–30). Импорты `Bricks*`-блоков из layouts-blocks НЕ трогать (шаги 8–9).
- Комментарии/логи: `useCanvasItemActions.ts:169` (`[BricksCanvasItem]`), `editor/composables/useLandingInlineEditor.ts:282` (коммент про Escape).

## Шаг 3. sidebar — корень и дети ✅ (2026-06-11)

> Примечание: корневым классом `ComponentCard.vue` оказался `.cardWrapper` → переименован
> в `.SidebarComponentCard`; внутренний `.ComponentCard` → `.cardInner`. Заодно зачищены
> старые имена в типах: `IBuilderSidebarExpose` → `ISidebarExpose`,
> `IComponentCardProps` → `ISidebarComponentCardProps`, `ISchemaTreeItemProps` →
> `ISidebarSchemaTreeItemProps`, реф `builderSidebarRef` → `sidebarRef`.
> Рекурсивный self-тег в `SidebarSchemaTreeItem.vue` обновлён (резолвится по имени файла).

| git mv (в `modules/builder/components/sidebar/`) | Новый корневой класс |
| ------------------------------------------------ | -------------------- |
| `BuilderSidebar.vue` → `TheSidebar.vue`           | `.Sidebar` → `.TheSidebar` |
| `ComponentCard.vue` → `SidebarComponentCard.vue`  | корневой (`.cardWrapper`/`.ComponentCard` — проверить по шаблону) → `.SidebarComponentCard` |
| `SchemaTreeItem.vue` → `SidebarSchemaTreeItem.vue`| `.SchemaTreeItem` → `.SidebarSchemaTreeItem` |

Где обновить ссылки:

- `builder/pages/[pagename].vue:32` — импорт `BuilderSidebar` + тег.
- `SidebarComponentsView.vue:13` — импорт `ComponentCard` + тег.
- `SidebarSchemaTreeView.vue:26` — импорт `SchemaTreeItem` + тег (внимание: рекурсивный? проверить self-импорт в `SidebarSchemaTreeItem.vue`).
- Типы/комментарии: `builder/types/builder.d.ts`, `builder/types/composables.d.ts`, `builder/components/sidebar/types.d.ts`, `builder/composables/useLandingBuilderPage.ts` — упоминания `BuilderSidebar`/`ComponentCard` (текстовые, проверить grep'ом).

## Шаг 4. LogoLand → BuilderLogo (уровень домена) ✅ (2026-06-11)

> Примечание: alt/aria-label в компоненте не оказалось; дебрендинг — убран брендовый
> дефолт пропа `text` (`'От Иды, <br /> С любовью'` → `''`, оба использования и так
> передают `text=""`), заодно удалён дефолт несуществующего пропа `color`.

| git mv | Новый корневой класс |
| ------ | -------------------- |
| `modules/builder/components/sidebar/LogoLand.vue` → `modules/builder/components/BuilderLogo.vue` | `.LogoLand` → `.BuilderLogo` |

Где обновить ссылки (пути меняются — файл переехал из `sidebar/`):

- `builder/components/BuilderLoader.vue:7` — `'./sidebar/LogoLand.vue'` → `'./BuilderLogo.vue'`.
- `builder/components/toolbar/BricksBuilderToolbar.vue:15` — `'../sidebar/LogoLand.vue'` → `'../BuilderLogo.vue'`.

Заодно дебрендинг: внутри компонента проверить упоминания «Land»/«ida» (alt, aria-label).

## Шаг 5. property-editors (папка + 5 компонентов) ✅ (2026-06-11)

> Примечание: в `properties.types.ts` есть рантайм-код (`PROPERTY_EDITOR_ORDER`), поэтому
> файл стал `property-editors/types.ts` (не `.d.ts`). Его внутренний импорт
> `common/types/landing` углублён на один уровень (`../../../../`). Заодно переименованы
> интерфейсы редакторов: `IAccordionItemsEditor*`/`IImageGalleryEditor*`/`IInlineContentEditor*`/
> `IJsonEditor*` → `IProperty<Имя>Editor*`, `IBricksMediaPicker*` → `IPropertyMediaPicker*`.

Папка: `modules/builder/components/sidebar/properties-types/` → `property-editors/`.

| git mv (внутри папки) | Новый корневой класс |
| ---------------------- | -------------------- |
| `BricksAccordionItemsEditor.vue` → `PropertyAccordionItemsEditor.vue` | `.AccordionItemsEditor` → `.PropertyAccordionItemsEditor` |
| `BricksImageGalleryEditor.vue` → `PropertyImageGalleryEditor.vue`     | `.ImageGalleryEditor` → `.PropertyImageGalleryEditor` |
| `BricksInlineContentEditor.vue` → `PropertyInlineContentEditor.vue`   | `.InlineContentEditor` → `.PropertyInlineContentEditor` |
| `BricksJsonEditor.vue` → `PropertyJsonEditor.vue`                     | `.JsonEditor` → `.PropertyJsonEditor` |
| `BricksMediaPicker.vue` → `PropertyMediaPicker.vue`                   | `.BricksMediaPicker` → `.PropertyMediaPicker` |

Файл типов: `sidebar/properties.types.ts` → `sidebar/property-editors/types.d.ts`
(перед переносом — `grep -rn "properties.types"` и проверить, что в нём только типы, без рантайм-кода; если есть рантайм — оставить `.ts`, имя `types.ts`).

Где обновить ссылки:

- `builder/composables/useSidebarPropertiesPanel.ts` — 6 lazy-импортов `import('../components/sidebar/properties-types/...')` (строки ~67–84, `BricksMediaPicker` встречается дважды: `image` и `video`).
- Импортёры `properties.types.ts` — найти grep'ом, поправить пути.
- Внутренние импорты самих редакторов (относительные `../`, после смены папки глубина не меняется — но проверить).

## Шаг 6. toolbar + loader ✅ (2026-06-11)

> Примечание: заодно переименованы интерфейсы `IBuilderVerticalNavProps`/`IBuilderVerticalNavEmits`
> → `IToolbarVerticalNav*`. Pre-existing ошибки vue-tsc в `render/pages/[pagename].vue`
> (TS2554/TS2339, useAsyncData) не связаны с шагом — проверено на чистом дереве.

| git mv | Новый корневой класс |
| ------ | -------------------- |
| `toolbar/BricksBuilderToolbar.vue` → `toolbar/TheToolbar.vue` | `.BricksBuilderToolbar` → `.TheToolbar` |
| `toolbar/BuilderVerticalNav.vue` → `toolbar/ToolbarVerticalNav.vue` | `.BuilderVerticalNav` → `.ToolbarVerticalNav` |
| `builder/components/BuilderLoader.vue` → `TheBuilderLoader.vue` | `.BuilderLoader` → `.TheBuilderLoader` |

Где обновить ссылки:

- `builder/pages/[pagename].vue:30,31,34` — импорты всех трёх + теги.

## Шаг 7. render ✅/❌

| git mv (в `modules/render/components/`) | Новый корневой класс |
| ---------------------------------------- | -------------------- |
| `BricksRenderer.vue` → `TheRenderer.vue`  | ⚠️ корневой `.container` **НЕ трогать** (конвенция published-страницы + `data-ida-container`) |
| `BricksRendererPlaceholder.vue` → `RendererPlaceholder.vue` | `.BricksRendererPlaceholder` → `.RendererPlaceholder` |

Где обновить ссылки:

- `render/pages/[pagename].vue:20` — импорт `BricksRenderer` + тег.
- `TheRenderer.vue:17` — импорт `BricksRendererPlaceholder` + тег.
- `render/composables/useLandingRendererStories.ts` — текстовое упоминание `BricksRenderer` (grep).

## Шаг 8. layouts-blocks, часть 1: Grid/Flex/Section/Space/Media ✅/❌

Логические имена (`'Grid'`, `'Flex'`...) в данных/stories/`layoutComponents.ts` **не меняются** —
переименовываются только файлы/импорты/классы.

| git mv (в `modules/layouts-blocks/components/`) | Новый корневой класс |
| ------------------------------------------------ | -------------------- |
| `BricksGrid.vue` → `BlockGrid.vue`       | `.gridLayout` → `.BlockGrid` |
| `BricksFlex.vue` → `BlockFlex.vue`       | `.flexLayout` → `.BlockFlex` |
| `BricksSection.vue` → `BlockSection.vue` | `.sectionLayout` → `.BlockSection` |
| `BricksSpace.vue` → `BlockSpace.vue`     | `.space` → `.BlockSpace` |
| `BricksMedia.vue` → `BlockMedia.vue`     | `.BricksMedia` → `.BlockMedia` |

⚠️ Перед переименованием классов: `grep -rn "gridLayout\|flexLayout\|sectionLayout" src/` —
убедиться, что классы не используются снаружи компонента (CSS Modules — не должны, но проверить).

Где обновить ссылки:

- `builder/components/canvas/CanvasItemLayout.vue` — импорты (~19–27) + теги `<BricksGrid>` и т.д.
- `render/composables/useLandingRendererLayouts.ts:21` — импорт `BricksMedia` + использование в `h()`.

## Шаг 9. layouts-blocks, часть 2: Svg/Slider/Text/Title/Accordion ✅/❌

| git mv (в `modules/layouts-blocks/components/`) | Новый корневой класс |
| ------------------------------------------------ | -------------------- |
| `BricksSvg.vue` → `BlockSvg.vue`             | `.BricksSvg` → `.BlockSvg` |
| `BricksSlider.vue` → `BlockSlider.vue`       | `.BricksSlider` → `.BlockSlider` |
| `BricksText.vue` → `BlockText.vue`           | `.BricksText` → `.BlockText` |
| `BricksTitle.vue` → `BlockTitle.vue`         | `.BricksTitle` → `.BlockTitle` |
| `BricksAccordion.vue` → `BlockAccordion.vue` | `.BricksAccordion` → `.BlockAccordion` |

Где обновить ссылки:

- `builder/components/canvas/CanvasItemLayout.vue` — импорты + теги.
- `render/composables/useLandingRendererLayouts.ts:19–24` — импорты `BricksText/Title/Svg/Slider/Accordion` + использования в `h()` (в т.ч. `h(BricksAccordion, ...)` ~строка 937).
- `builder/composables/useCanvasItemInlineEditing.ts` — текстовые упоминания `BricksText`/`BricksTitle` (grep).

## Шаг 10. composables builder: убрать `Landing`-шум ✅/❌

Переименовываются файл **и** экспортируемая функция.

| git mv (в `modules/builder/composables/`) | Функция |
| ------------------------------------------ | ------- |
| `useLandingBuilderPage.ts` → `useBuilderPage.ts` | `useLandingBuilderPage` → `useBuilderPage` |
| `useLandingCanvas.ts` → `useCanvas.ts`           | `useLandingCanvas` → `useCanvas` |
| `useLandingCanvasDrops.ts` → `useCanvasDrops.ts` | `useLandingCanvasDrops` → `useCanvasDrops` |
| `useLandingCanvasPan.ts` → `useCanvasPan.ts`     | `useLandingCanvasPan` → `useCanvasPan` |

Где обновить ссылки:

- `useBuilderPage`: `builder/pages/[pagename].vue`, `builder/stores/publish.ts`, `builder/types/composables.d.ts` (+ проверить имена типов вида `ILandingBuilderPage*` — переименовать в `IBuilderPage*`).
- `useCanvas`, `useCanvasPan`: `canvas/TheCanvas.vue`.
- `useCanvasDrops`: `canvas/TheCanvas.vue`, `canvas/CanvasViewport.vue`.

## Шаг 11. composables editor + layouts-blocks ✅/❌

| git mv | Функция |
| ------ | ------- |
| `editor/composables/useLandingInlineEditor.ts` → `useInlineEditor.ts` | `useLandingInlineEditor` → `useInlineEditor` |
| `layouts-blocks/composables/useLandingResponsiveLayoutStyles.ts` → `useResponsiveLayoutStyles.ts` | аналогично |
| `layouts-blocks/composables/useLandingResponsiveVisibilityStyles.ts` → `useResponsiveVisibilityStyles.ts` | аналогично |

Где обновить ссылки:

- `useInlineEditor`: `editor/stores/inlineEditing.ts`, `layouts-blocks/components/BlockText.vue`, `BlockTitle.vue`.
- `useResponsive*Styles`: `plugins/landing-styles.ts` (вне `modules/`, путь `src/runtime/plugins/`).

## Шаг 12. composables render ✅/❌

| git mv (в `modules/render/composables/`) | Функция |
| ------------------------------------------ | ------- |
| `useLandingRendererLayouts.ts` → `useRendererLayouts.ts` | `useLandingRendererLayouts` → `useRendererLayouts` |
| `useLandingRendererStories.ts` → `useRendererStories.ts` | `useLandingRendererStories` → `useRendererStories` |

Где обновить ссылки:

- `render/components/TheRenderer.vue` — оба импорта.
- `render/pages/[pagename].vue` — `useRendererStories`.

> Напоминание: `useRendererLayouts.ts` — 1021 строка при лимите oxlint `max-lines: 1000`
> (pre-existing). Переименование не чинит — не считать регрессией.

## Шаг 13. Документация ✅/❌

Обновить пути/имена после всех шагов:

- `CLAUDE.md` — упоминания: `BricksCanvas.vue`, `BricksGrid.vue`/`BricksSpace.vue`,
  `BricksRenderer.vue`, `BricksSlider`, `useLandingResponsiveLayoutStyles.ts`,
  `useLandingRendererLayouts.ts`, `useLandingCanvas.ts`, `SidebarPropertyEditors.vue` (не переименовывался — проверить).
- `documents/refactor.md` — секция «Известные доработки» (пути файлов), «Зафиксированные
  кросс-доменные связки» (`BricksSlider.vue` → `BlockSlider.vue`, `useLandingInlineEditor.ts` → `useInlineEditor.ts`),
  таблица маппинга Reka UI (имена в колонке «Текущий» — пометить новые имена), отметить
  переименования выполненными в этом файле.
- README композаблов (`grep -rln "useLanding" --include="*.md" .`) и прочие md в `documents/`.
- Финальная проверка: `grep -rnE "BricksCanvas|BuilderSidebar|LogoLand|properties-types|BricksRenderer|BricksGrid|useLandingCanvas|useLandingRenderer|useLandingInline|useLandingResponsive|useLandingBuilderPage" src/ documents/ CLAUDE.md` → пусто.
