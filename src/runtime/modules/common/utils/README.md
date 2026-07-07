# common/utils

Общие утилиты (используются 2+ доменами).

| Файл / папка                 | Назначение                                                                                                                                                |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main.ts`                    | px ↔ rem конверсии, hex-валидация/нормализация, `normalizeBricksError` (debounce — `useDebounceFn` из `@vueuse/core`)                                     |
| `case-transform.ts`          | Конвертация snake_case ↔ camelCase (нормализация ответов Django backend)                                                                                  |
| `i18nLabels.ts`              | `resolveBricksLabel` — перевод ключей `bricks.*` из definitions, кастомные строки потребителя проходят как есть                                           |
| `bricks/paths.ts`            | Нормализация путей brick-файлов (POSIX-слэши)                                                                                                             |
| `bricks/components.ts`       | Глубокие копии пропсов для истории/drag&drop                                                                                                              |
| `bricks/deviceVisibility.ts` | Нормализация конфигурации видимости по устройствам                                                                                                        |
| `bricks/publishedPage.ts`    | `normalizePublishedPage` (+ `isBricksSchema`, `preserveSchema`) — единая копия для store и middleware; новые поля `IPublishedPage` добавлять только здесь |
| `routing/`                   | Build-time/CLI: `generate-bricks-json.mjs` (bricks.json), `vite-brick-watch.ts` (HMR `.brick.ts`), `bricks-api.ts` (чтение bricks.json по категориям)     |
