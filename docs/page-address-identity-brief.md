# Бриф: адресная идентичность страницы вместо идентичности по имени

## Зачем

Сейчас `pagename` уникален глобально (`uq_bricks_pages_pagename`), поэтому
саб-страницы через `urlPrefix` работают только с уникальным последним сегментом:
`/blog/post` и `/news/post` одновременно невозможны. Цель — разрешить их, то есть
сделать уникальным полный адрес страницы, а не её имя.

Схему в БД поменять недостаточно: пара `(pagename, url_prefix)` делает базу шире,
чем код умеет адресовать. Проверено — страницу опознают по одному `pagename` сразу
три места, и две страницы с одинаковым именем в них столкнутся.

## Что придётся перевести на адрес

1. **URL редактора.** Сейчас `<builderPrefix>/:pagename`
   (`module-setup.ts` → `BRICKS_ROUTE_NAMES.builderPage`). Обе страницы с именем
   `post` претендуют на `/bricks/post`. Нужен адресный маршрут вида
   `<builderPrefix>/:urlPrefix*/:pagename` — с оглядкой на ранжирование
   vue-router: статические дети префикса (страница логина) должны продолжать
   выигрывать, а `isEditorAddressTaken` — проверять новый адрес.
2. **Идентичность сессии билдера.** `openBuilderSession(pagename)` /
   `bootstrapSession(pagename)` и `publishStore.getPageByPagename(pagename)`
   (`useBuilderSession.ts`, `stores/publish.ts`) выбирают произвольную из
   одноимённых. Плюс `renameSession` и синхронизация URL
   (`useBuilderPagenameSync`) работают по имени.
3. **Ключи черновиков localStorage.** `bricks-builder:draft:<pagename>`
   (`publish/utils/draftStorage.ts`). Одноимённые страницы делят один черновик —
   ключ должен включать префикс. Миграция старых ключей не нужна: черновики
   одноразовые, но перенос при rename (`renameSession`) обязан работать с новым
   ключом.
4. **Публичный lookup.** `GET /api/bricks/public/pages/:pagename` ищет по имени, а
   префикс сверяется уже после (`matchesPageUrlPrefix` в middleware
   `bricks-page-layout`). Ручка должна принимать префикс и искать по паре:
   в Postgres — `WHERE pagename = $1 AND url_prefix IS NOT DISTINCT FROM $2`
   (обычное `=` не сматчит NULL). Для http-адаптера это изменение внешнего
   контракта — префикс придётся передавать в запрос.
5. **Контракт адаптеров.** `getPageByPagename(pagename)` в
   `persistence/types/adapters.d.ts` и обе реализации (postgres, http) становятся
   адресными. Ломает кастомные адаптеры — по правилам проекта это допустимо.
6. **Клиентская уникальность.** `publishStore.isPagenameAvailable(pagename, excludeId)`
   сравнивает имена; должна сравнивать пару. Ripple: опции yup-схемы
   (`IPublishValidationSchemaOptions`), `validatePublishFormState`,
   `useBuilderPagenameSync`.
7. **Сообщение о конфликте.** `BricksPagenameConflictError` → 409
   `PAGENAME_CONFLICT`: детект по SQLSTATE 23505, менять не нужно, но текст и
   локализованное сообщение станут про адрес, а не про имя.

## Схема

```sql
CONSTRAINT uq_bricks_pages_address UNIQUE NULLS NOT DISTINCT (pagename, url_prefix)
```

`NULLS NOT DISTINCT` обязателен (проверено на PG 16): по умолчанию Postgres
считает NULL'ы различными, и две страницы без префикса с одинаковым именем прошли
бы constraint, заняв один корневой URL `/pagename`.

Порядок правки: `migrations/0001_init.sql` → тот же DDL руками в живую БД →
пересчёт checksum строки `0001_init.sql` в `bricks_schema_migrations` (иначе
drift-контроль валит migrate) → `bricks-migrate status` показывает 0 pending.

## Проверки

Различающие кейсы, которых сейчас нет:

- `/blog/post` и `/news/post` живут одновременно, каждая открывается по своему
  адресу и в своём редакторе;
- у них независимые черновики localStorage;
- rename одной не задевает вторую;
- страница без префикса и страница с префиксом не конфликтуют, а две без
  префикса с одним именем — конфликтуют (это и проверяет `NULLS NOT DISTINCT`);
- `urlPrefix`, уводящий адрес под поверхность билдера, по-прежнему отклоняется.

Живая верификация — playground: создать `/blog/post` и `/news/post`, открыть
редакторы обеих, убедиться, что автосейв пишет по разным ключам.
