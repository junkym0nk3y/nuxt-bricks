# builder/app/composables

Композаблы composition root'а билдера (собираются страницами `builder.vue` / `[pagename].vue`).

| Файл                            | Назначение                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `useBuilderPage.ts`             | Фасад страницы билдера: собирает бизнес-логику, отдаёт компоненту только нужные состояния                                   |
| `useBuilderPagename.ts`         | Владелец pagename: `routePagename` (URL) + `sessionPagename` (ключ черновиков), `renameSession` (миграция + router.replace) |
| `useBuilderSession.ts`          | Сессия: открытие страницы по pagename, обнаружение черновика, модалка восстановления; rename не переоткрывает сессию        |
| `useBuilderDraftPersistence.ts` | Автосохранение черновика в localStorage (debounce 800ms) по ключу `sessionPagename`, удаление при отсутствии изменений      |
| `useBuilderPagenameSync.ts`     | Синхронизация URL с pagename формы публикации (debounce 600ms → `renameSession`; guards: reserved/занятые pagename)         |
| `useBuilderShortcuts.ts`        | Горячие клавиши: Delete/Backspace, Ctrl/Cmd+C/V, undo/redo, Escape (сброс выбора)                                           |
| `useComponentLibrary.ts`        | Загрузка библиотеки компонентов: bricks с бэкенда + метаданные `.brick.ts` + layout-блоки                                   |
| `useDraggableComponent.ts`      | Drag-and-drop компонентов из библиотеки на канвас                                                                           |
| `useModals.ts`                  | Фасад модалок: загрузка компонента по имени (`getModalComponentLazy`); кеш и опции — в `core/composables/useModalOptions`   |
| `usePageThumbnail.ts`           | Превью страницы для дашборда: снапшот канваса (modern-screenshot, lazy) → S3 → PATCH `thumbnailUrl`; fire-and-forget        |
| `usePreviewSync.ts`             | Синхронизация схемы с preview-вкладкой через BroadcastChannel (debounce 300ms)                                              |
