# builder/documentation/composables

| Файл                          | Назначение                                                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `useDocumentationArticles.ts` | Загрузка markdown-статей из `docs/guide/<locale>/` (`import.meta.glob`, fallback на `ru`) |
| `useMarkdownRenderer.ts`      | Рендеринг markdown через markdown-it (lazy-загрузка при первом вызове)                    |
