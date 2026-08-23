# builder/documentation/composables

| File                          | Purpose                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------ |
| `useDocumentationArticles.ts` | Loading the markdown articles out of `docs/guide/<locale>/` (`import.meta.glob`, falling back to `ru`) |
| `useMarkdownRenderer.ts`      | Rendering markdown through markdown-it (loaded lazily on the first call)                               |
