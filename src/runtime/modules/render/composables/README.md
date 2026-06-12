# render/composables

Композаблы рендера опубликованной страницы (только common + layouts-blocks, без stores).

| Файл                      | Назначение                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| `useRendererLayouts.ts`   | Рендеринг layout-блоков через registry: каждый блок несёт свой `renderPublished` в definition |
| `useRendererBricks.ts`    | Извлечение Vue-компонента из загруженного brick-модуля                                        |
| `useBricksDataSources.ts` | Выполнение data sources опубликованной страницы (через useApiClient: SSR-заголовки, CSRF)     |
