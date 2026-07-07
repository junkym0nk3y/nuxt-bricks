# render/composables

Композаблы рендера опубликованной страницы (только common + layouts-blocks, без stores).

| Файл                        | Назначение                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `useRendererLayouts.ts`     | Рендеринг layout-блоков через registry: каждый блок несёт свой `renderPublished` в definition                            |
| `useRendererBricks.ts`      | Извлечение Vue-компонента из загруженного brick-модуля                                                                   |
| `useBricksDataSources.ts`   | Выполнение data sources опубликованной страницы (через useApiClient: SSR-заголовки, CSRF)                                |
| `useRendererDataSources.ts` | Оркестрация data sources страницы: загрузка объявлений из brick-файлов (кеш), useAsyncData, мердж props, dev-логи        |
| `useRendererPreviewSync.ts` | Live-синк превью с builder-вкладкой: localStorage-снапшот, BroadcastChannel, visibilitychange, баннер (device/резолюция) |
