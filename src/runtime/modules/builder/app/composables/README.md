# builder/app/composables

Композаблы composition root'а билдера (собираются страницами `builder.vue` / `[pagename].vue`).

| Файл                            | Назначение                                                                                                                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useBuilderPage.ts`             | Фасад страницы билдера: собирает бизнес-логику, отдаёт компоненту только нужные состояния                                                                                                                |
| `useBuilderPageWrite.ts`        | Запись открытой страницы: сохранение (черновик/публикация) и Save as Copy — переход сессии, снимок превью, тосты исхода с контекстом страницы                                                            |
| `useBuilderPagename.ts`         | Владелец pagename: `routePagename` (URL) + `sessionPagename` (ключ черновиков), `renameSession` (миграция + router.replace)                                                                              |
| `useBuilderSession.ts`          | Сессия: открытие страницы по pagename, обнаружение черновика, модалка восстановления, `isSessionReady` для автосейва; rename не переоткрывает сессию                                                     |
| `useBuilderSessionToken.ts`     | Токен сессии: операция снимает его на старте и сверяет перед записью результата; инкрементами владеет `useBuilderSession` (открытие + dispose)                                                           |
| `useBuilderDraftPersistence.ts` | Автосохранение черновика в localStorage (debounce 800ms) по ключу `sessionPagename`, сброс на `pagehide` и остановке scope, удаление при отсутствии изменений                                            |
| `useBuilderPagenameSync.ts`     | Синхронизация URL с pagename формы публикации (debounce 600ms → `renameSession`; guards: reserved/занятые pagename)                                                                                      |
| `useBuilderShortcuts.ts`        | Горячие клавиши: Delete/Backspace, Ctrl/Cmd+C/V, undo/redo, Escape (сброс выбора)                                                                                                                        |
| `useComponentLibrary.ts`        | Загрузка библиотеки компонентов: bricks с бэкенда + метаданные `.brick.ts` + layout-блоки; тем же ответом наполняется кеш модалок (`core/composables/useModalOptions`), признак отказа и повтор — наружу |
| `useDraggableComponent.ts`      | Drag-and-drop компонентов из библиотеки на канвас                                                                                                                                                        |
| `usePageThumbnail.ts`           | Превью страницы для дашборда: снапшот канваса (modern-screenshot, lazy) → S3 → PATCH `thumbnailUrl`; fire-and-forget                                                                                     |
| `usePreviewSync.ts`             | Синхронизация схемы с preview-вкладкой через BroadcastChannel (debounce 300ms)                                                                                                                           |
