# builder/shell/sidebar/composables

Композаблы сайдбара: панель свойств, форма публикации, импорт/экспорт схемы.

| Файл                            | Назначение                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `useSidebarPropertiesPanel.ts`  | Фасад панели свойств: responsive scope + выбор медиа + описание brick, готовые обработчики |
| `useSidebarResponsiveScope.ts`  | Responsive-scope панели: device-табы, merge overrides в props, синк с viewport канваса     |
| `useSidebarMediaSelection.ts`   | Выбор медиа из галереи: контекст запроса (свойство / inline-content / image-gallery)       |
| `usePropertyVariants.ts`        | Преобразование определений свойств в варианты для разных типов редакторов                  |
| `useSidebarBrickDescription.ts` | Описание выбранного компонента из brick-файла (или layout-конфига)                         |
| `usePublishValidationSchema.ts` | Validation schema формы публикации (уникальность pagename в режиме редактирования)         |
| `useSchemaFileTransfer.ts`      | Экспорт схемы в JSON-файл и импорт из файла с валидацией структуры                         |
