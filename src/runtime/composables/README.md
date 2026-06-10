# Composables

Директория содержит Vue Composition API composables для логики landing builder.

## Список composables

### Конфигурация и настройки

| Composable         | Описание                                                                 | Использование                          |
| ------------------ | ------------------------------------------------------------------------ | -------------------------------------- |
| `useLandingConfig` | Конфигурация лендинга с дефолтными значениями. Читает из `app.config.ts` | `pages/builder.vue`, компоненты canvas |
| `useApiClient`     | Работа с API через прокси или напрямую                                   | Stores, middleware, plugins            |

### Canvas и отображение

| Composable              | Описание                                                 | Использование                         |
| ----------------------- | -------------------------------------------------------- | ------------------------------------- |
| `useLandingCanvas`      | Управление viewport, масштабированием и размерами canvas | `components/canvas/BricksCanvas.vue` |
| `useLandingCanvasPan`   | Панорамирование (перетаскивание) canvas                  | `components/canvas/BricksCanvas.vue` |
| `useLandingCanvasDrops` | Обработка drop событий на canvas                         | `components/canvas/BricksCanvas.vue` |
| `useLandingStyles`      | Инъекция динамических стилей лендинга в `<head>`         | `pages/builder.vue`, рендерер         |

### Drag & Drop

| Composable              | Описание                                           | Использование                                 |
| ----------------------- | -------------------------------------------------- | --------------------------------------------- |
| `useDraggableComponent` | Перетаскивание компонентов из библиотеки на canvas | `components/sidebar/SidebarComponentItem.vue` |
| `useSlotDragDrop`       | Drag-and-drop для слотов компонентов               | `components/canvas/CanvasItem.vue`            |

### Свойства и редактирование

| Composable                  | Описание                                                          | Использование                                   |
| --------------------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| `useComponentProperties`    | Работа со свойствами компонентов (конвертация story → properties) | `components/sidebar/SidebarPropertiesPanel.vue` |
| `usePropertyVariants`       | Варианты свойств для разных типов редакторов                      | `components/sidebar/SidebarPropertiesPanel.vue` |
| `useSidebarPropertiesPanel` | Логика панели свойств в сайдбаре                                  | `components/sidebar/SidebarPropertiesPanel.vue` |

### Слоты компонентов

| Composable          | Описание                                               | Использование                      |
| ------------------- | ------------------------------------------------------ | ---------------------------------- |
| `useComponentSlots` | Управление слотами компонента (загрузка, нормализация) | `components/canvas/CanvasItem.vue` |

### Stories и модули

| Composable        | Описание                                           | Использование             |
| ----------------- | -------------------------------------------------- | ------------------------- |
| `useStoryImports` | Динамический импорт story-файлов компонентов       | Builder, sidebar          |
| `useModals`       | Работа с модальными окнами (загрузка, кеширование) | Builder, property editors |

### Рендеринг

| Composable                  | Описание                             | Использование                           |
| --------------------------- | ------------------------------------ | --------------------------------------- |
| `useLandingRendererLayouts` | Рендеринг layout-компонентов         | `components/render/BricksRenderer.vue` |
| `useLandingRendererStories` | Рендеринг story-компонентов          | `components/render/BricksRenderer.vue` |
| `useLandingDataSources`     | Работа с data sources в landing page | Компоненты с динамическими данными      |

### Валидация

| Composable                   | Описание                                              | Использование                               |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `usePublishValidationSchema` | Validation schema для формы публикации (vee-validate) | `components/sidebar/SidebarPublishView.vue` |

### Устройства

| Composable          | Описание                                   | Использование         |
| ------------------- | ------------------------------------------ | --------------------- |
| `useDeviceCallback` | Callback при изменении устройства/viewport | Адаптивные компоненты |

### Страница билдера

| Composable              | Описание                                                                   | Использование       |
| ----------------------- | -------------------------------------------------------------------------- | ------------------- |
| `useLandingBuilderPage` | Вся бизнес-логика страницы билдера (состояния, экшены, keyboard shortcuts) | `pages/builder.vue` |

## Типы

Все интерфейсы для composables находятся в `types/composables.d.ts`:

- `ISlotRenderData` — данные для рендеринга слота
- `IUseComponentSlotsReturn` — возврат `useComponentSlots`
- `IBuilderToastState` — состояние toast-уведомления
- `IUseLandingBuilderPageReturn` — возврат `useLandingBuilderPage`
- `ISelectedComponentData` — данные выбранного компонента
- `IUsePropertyVariantsReturn` — возврат `usePropertyVariants`
- `ISlotState` — состояние drag-and-drop для слота
- `IUseSlotDragDropReturn` — возврат `useSlotDragDrop`

## Правила

1. **Интерфейсы** хранятся в `types/composables.d.ts`, не инлайн в файлах
2. **Комментарии** на русском языке
3. **JSDoc** обязателен для всех публичных функций
4. **#region** комментарии для группировки кода
