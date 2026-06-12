# text-editor/composables

| Файл                     | Назначение                                                                                                                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useInlineEditor.ts`     | TipTap inline-editor на канвасе: lazy-загрузка, lifecycle, конвертация segments/HTML ↔ TipTap, публикация editor в inlineEditingStore. Tech-debt: импортирует builder/core/stores/components — кандидат на DI |
| `useToolbarStateSync.ts` | Синхронизация состояния toolbar с транзакциями редактора (счётчик транзакций + watchEffect)                                                                                                                   |
