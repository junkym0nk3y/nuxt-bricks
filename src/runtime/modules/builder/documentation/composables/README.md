# builder/documentation/composables

| Файл                          | Назначение                                                             |
| ----------------------------- | ---------------------------------------------------------------------- |
| `useDocumentationArticles.ts` | Загрузка markdown-статей из `docs/guide/` (`import.meta.glob`)         |
| `useMarkdownRenderer.ts`      | Рендеринг markdown через markdown-it (lazy-загрузка при первом вызове) |
