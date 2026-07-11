# render/composables

Композаблы рендера опубликованной страницы (только common + layouts-blocks, без stores).

| Файл                        | Назначение                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `useRendererLayouts.ts`     | Рендеринг layout-блоков через registry: каждый блок несёт свой `renderPublished` в definition                            |
| `useRendererBricks.ts`      | Извлечение Vue-компонента из загруженного brick-модуля                                                                   |
| `useDataSourceClient.ts`    | Выделенный публичный HTTP-клиент data sources: без cookie/identity/CSRF/401-редиректа, таймаут, конфиг политики          |
| `usePublicPageClient.ts`    | Публичный HTTP-клиент lookup'а published-страницы (live-путь middleware): та же политика, что у data sources             |
| `useBricksDataSources.ts`   | Выполнение data source: резолв params/URL, политика (GET/HEAD, allow-list хостов), dedup запросов, redacted-логи         |
| `useRendererDataSources.ts` | Оркестрация data sources страницы: загрузка объявлений из brick-файлов (кеш), useAsyncData, пул с лимитом, мердж props   |
| `useRendererPreviewSync.ts` | Live-синк превью с builder-вкладкой: localStorage-снапшот, BroadcastChannel, visibilitychange, баннер (device/резолюция) |
