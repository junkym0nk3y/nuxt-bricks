# builder/shell/sidebar/composables

Композаблы сайдбара: панель свойств, форма публикации, импорт/экспорт схемы.

| Файл                            | Назначение                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `useSidebarPropertiesPanel.ts`  | Фасад панели свойств: responsive scope + выбор медиа + описание brick, готовые обработчики |
| `useSidebarResponsiveScope.ts`  | Responsive-scope панели: device-табы, merge overrides в props, синк с viewport канваса     |
| `useSidebarMediaSelection.ts`   | Выбор медиа из галереи: контекст запроса (свойство / inline-content / image-gallery)       |
| `usePropertyVariants.ts`        | Преобразование определений свойств в варианты для разных типов редакторов                  |
| `useSpacingEditor.ts`           | Box-model редактор spacing-группы: слоты сторон (степперы/зеркала), шаг, инлайн-ввод       |
| `useComponentCardPreview.ts`    | Превью карточки библиотеки: lazy-загрузка brick-компонента, contain-масштаб, ResizeObserver |
| `useComponentCardDrag.ts`       | Dragstart карточки через инжектированный drag-композабл (`dragComposable`)                 |
| `useSidebarBrickDescription.ts` | Описание выбранного компонента из brick-файла (или layout-конфига)                         |
| `useSidebarPublishForm.ts`      | Форма публикации сайдбара: state из publish-стора, layout-опции, превью URL, обработчики   |
| `usePublishValidationSchema.ts` | Обёртка над `publish/utils/validationSchema` (store + i18n, исключение `editingPageId`)    |
| `useSchemaFileTransfer.ts`      | Экспорт схемы в JSON-файл и импорт из файла с валидацией структуры                         |
