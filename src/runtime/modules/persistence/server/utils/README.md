# persistence/server/utils

Общая серверная логика Nitro-ручек `/api/bricks/**`.

| Файл                        | Назначение                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `handlerHelpers.ts`         | Общие помощники ручек (parse → adapter → return); `requireNumericId`, маппер доменных конфликтов `toPageHttpError` (409 + `data.code`)  |
| `payloadPrimitives.ts`      | Базовые примитивы валидации DTO: `invalid`, `assertKnownKeys`, строковые/boolean-проверки                                               |
| `payloadValidation.ts`      | Server-first валидация DTO страниц: reject unknown keys, типы/границы, `expectedRevision`                                               |
| `schemaPayloadValidation.ts` | Итеративный (без рекурсии) depth/node/type guard для `schema` до `JSON.stringify` (R0.2): `assertSchemaComplexity` + лимиты глубины/узлов/байт |
| `mediaPayloadValidation.ts` | Server-first валидация DTO медиа (create/update, категория, размер)                                                                     |
| `storageErrors.ts`          | Доменные ошибки конфликтов storage-слоя (pagename occupied, revision mismatch) — контракт для кастомных адаптеров                       |
| `pageUpdate.ts`             | Общая реализация PUT/PATCH `/api/bricks/:id` (обновление только переданных полей)                                                       |
| `pageVersionRestore.ts`     | Оркестрация POST `.../versions/:versionId/restore`: version lookup + updatePage с обязательным `expectedRevision` (optimistic locking)  |
| `requestBodyLimits.ts`      | Лимитированное чтение тела: Content-Length pre-check + стрим-лимит, JSON/multipart-читатели (парсинг — Response.formData)               |
| `fileSignatures.ts`         | Сниффинг формата по magic bytes: `sniffImageFormat`/`sniffVideoFormat`/`looksLikeSvgMarkup` — MIME и расширению не доверяем             |
| `concurrencyGate.ts`        | Семафор тяжёлых операций (sharp): лимит одновременности + ограниченная очередь, переполнение → 503                                      |
| `imageProcessing.ts`        | Обработка изображений: `optimizeToWebp` (sharp c `limitInputPixels` под общим семафором), расширения/MIME-хелперы, `resolveMediaConfig` |
| `mediaProcessing.ts`        | Валидация загрузок (тип/размер/сигнатура) и оптимизация; `fetchSvgContent` с таймаутом и лимитом                                        |
| `mediaImport.ts`            | Импорт файлов из хранилища публикации в БД медиа (fallback при пустой таблице `bricks_media`)                                           |
| `mediaOrchestration.ts`     | Атомарные пары «файл хранилища + запись БД»: upload с компенсацией, file-first delete, best-effort чистка превью удалённой страницы     |
| `publicProjection.ts`       | Публичная проекция published-страницы для public read-model (без editor-полей, включая `revision`)                                      |
