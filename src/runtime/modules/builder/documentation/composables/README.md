# builder/documentation/composables

| File                          | Purpose                                                                                                                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useDocumentationArticles.ts` | Loading the markdown articles out of `docs/guide/<locale>/` (`import.meta.glob`); a locale with no folder of its own gets no articles, and the modal shows the coming-soon placeholder |
| `useMarkdownRenderer.ts`      | Rendering markdown through markdown-it (loaded lazily on the first call)                                                                                                               |
