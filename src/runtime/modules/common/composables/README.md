# common/composables

Общие композаблы (используются 2+ доменами). Доменные композаблы живут рядом со своим кодом —
в каждой папке `composables/`/`utils/` есть свой README с таблицей файлов.

| Файл                     | Назначение                                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useBricksConfig.ts`     | Конфигурация билдера с дефолтными значениями. Читает из `app.config.ts`                                                                                                    |
| `useApiClient.ts`        | Работа с API: пути `/api/bricks/**` всегда локальны (`utils/localApiPaths.ts`), остальные /api/\* — на API host-проекта (SSR-заголовки, CSRF, 401 → login в database-auth) |
| `useBrickImports.ts`     | Динамический импорт brick-файлов компонентов: lookup лоадера по `brickPath` из схемы (ключи glob'а = записи манифеста, см. `src/bricks-manifest.ts`)                       |
| `useBricksStyles.ts`     | Генерация и инъекция стилей `.bricks-container` в `<head>` (канвас + published media queries)                                                                              |
| `useBricksRoutePaths.ts` | Пути поверхностей bricks (`bricks.routes` + `app.baseURL`) для `window.location`/`window.open`/`<a href>`; внутри Vue Router — именованные роуты                           |
| `useBricksAssetUrl.ts`   | URL публичных ассетов модуля (`/_bricks/` + `app.baseURL`) — обёртка над `resolveBricksAssetUrl` для setup-контекста                                                       |

## Правила

1. **Интерфейсы** хранятся в `types/` домена (`*.d.ts`), не инлайн в файлах
2. **Комментарии** на русском языке
3. **JSDoc** обязателен для всех публичных функций
4. **#region** комментарии для группировки кода
5. Новый композабл кладётся в домен-потребитель; в `common/` — только при использовании из 2+ доменов
