# render/utils

Чистые утилиты рендера опубликованной страницы (изоморфные, без Nuxt-контекста).

| Файл                           | Назначение                                                                                               |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `dataSourceLogging.ts`         | Redaction prod-логов data sources: URL → цель (`local`/origin), ошибка → allow-list `{name, statusCode}` |
| `dataSourcePolicy.ts`          | Политика data sources: allow-list методов (GET/HEAD) и URL (относительные / разрешённые хосты)           |
| `dataSourceResponseReading.ts` | `readResponseWithinByteBudget` — потоковое чтение ответа с байтовым бюджетом ДО JSON.parse               |
| `requestPool.ts`               | `runWithConcurrencyLimit` — пул промисов с лимитом одновременности (SSR-запросы data sources)            |
