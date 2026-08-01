# builder/shell/sidebar/composables

Композаблы сайдбара: панель свойств и форма публикации.

| Файл                            | Назначение                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `useSidebarPropertiesPanel.ts`  | Фасад панели свойств: responsive scope + выбор медиа + i18n-резолв описания из стора        |
| `useSidebarResponsiveScope.ts`  | Responsive-scope панели: device-табы, merge overrides в props, синк с viewport канваса      |
| `useSidebarMediaSelection.ts`   | Выбор медиа из галереи: контекст запроса (свойство / inline-content / image-gallery)        |
| `usePropertyVariants.ts`        | Преобразование определений свойств в варианты для разных типов редакторов                   |
| `useSpacingEditor.ts`           | Box-model редактор spacing-группы: слоты сторон (степперы/зеркала), шаг, инлайн-ввод        |
| `useComponentCardPreview.ts`    | Превью карточки библиотеки: lazy-загрузка brick-компонента, contain-масштаб, ResizeObserver |
| `useComponentCardDrag.ts`       | Dragstart карточки через инжектированный drag-композабл (`dragComposable`)                  |
| `useSidebarPublishForm.ts`      | Форма публикации сайдбара: state из publish-стора, layout-опции, превью URL, обработчики    |
| `usePublishValidationSchema.ts` | Обёртка над `publish/utils/validationSchema` (store + i18n, исключение `editingPageId`)     |
