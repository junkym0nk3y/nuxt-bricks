# builder/publish/utils

| Файл                  | Назначение                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `dates.ts`            | Формат дат дашборда (`formatPageDate` → DD.MM.YYYY)                                              |
| `draftSnapshots.ts`   | Валидация pagename (`isValidPagename`), сравнение снапшотов черновика (`isSnapshotEqual`)        |
| `draftStorage.ts`     | Ключи localStorage для черновиков билдера                                                        |
| `formState.ts`        | Дефолтное/нормализованное состояние формы публикации, кэш цвета фона из app config               |
| `formValidation.ts`   | Валидация формы публикации (`validatePublishFormState`) — обязательные поля, форматы, роутинг    |
| `pagePayload.ts`      | Сборка payload создания/обновления/PATCH meta страницы (camelCase, snake_case — на вызове)       |
| `publishApi.ts`       | API-слой publish-стора: CRUD-запросы `/api/bricks` + нормализация ответов и ошибок               |
| `requestErrors.ts`    | Форматирование ошибок запросов в человекочитаемые сообщения                                      |
| `slugify.ts`          | Генерация pagename из названия страницы (`slugifyPageTitle`) — транслитерация, `[a-z0-9-]`       |
| `validationSchema.ts` | Чистая фабрика yup-схемы meta-полей (`createPublishValidationSchema`) — сайдбар + панель деталей |
