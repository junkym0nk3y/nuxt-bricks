# text-editor/composables

| Файл                     | Назначение                                                                                                                                                                              |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useInlineEditor.ts`     | TipTap inline-editor на канвасе: lazy-загрузка, lifecycle, конвертация segments/HTML ↔ TipTap, публикация editor в inlineEditingStore. Доступ к схеме — через порт `IInlineEditorHost` (inject) |
| `useTextEditorArea.ts`   | Логика TextEditorArea: lazy-инициализация/destroy TipTap, синхронизация props (value/disabled/placeholder), тогглы code-view и тёмного фона, обработчики контента и вставки медиа       |
| `useToolbarStateSync.ts` | Синхронизация состояния toolbar с транзакциями редактора (счётчик транзакций + watchEffect)                                                                                             |
