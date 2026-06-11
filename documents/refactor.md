# Рефакторинг ida-landing → nuxt-bricks

## Контекст

`@idaproject/ida-landing` (визуальный drag-and-drop билдер лендингов, Nuxt layer) мигрирует
в самостоятельный **Nuxt Module** `nuxt-bricks` — без бренда idaproject, на Reka UI,
с модульной архитектурой и реальной сборкой/публикацией.

## Принятые решения

| Вопрос                 | Решение                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Формат пакета          | **Nuxt Module** на `@nuxt/module-builder` + `@nuxt/kit` (не layer)                                    |
| Имя пакета / репо      | **`nuxt-bricks`**                                                                                     |
| UI-кит                 | **Reka UI** (headless), поверх — текущие SCSS-стили                                                   |
| Серверная часть        | Ручки вшиты в модуль через **абстракцию storage/publish**, дефолтный адаптер Postgres+S3 (заменяемый) |
| Старый `.playground`   | **Не переносим**. Новый минимальный `playground/` + тесты                                             |
| Тестирование           | `playground/` (demo Nuxt-app с `modules: ['../src/module']`) + `vitest` + `@nuxt/test-utils`          |
| Архитектура            | **Modular** — домены в `src/runtime/modules/`                                                         |

## Структура каталогов (текущая)

```
nuxt-bricks/
├── src/
│   ├── module.ts                 # defineNuxtModule — регистрирует всё
│   ├── cli/                      # bricks-gen (story-генератор)
│   └── runtime/
│       ├── modules/              # домены (модульный монолит)
│       │   ├── ui/               # headless UI-кит на Reka UI (base/inputs/feedback/tooltip)
│       │   ├── builder/          # ядро редактора: stores/, pages/ (composition root),
│       │   │                     #   components/modal/, общие composables/, utils/, constants/, types/
│       │   ├── canvas/           # канвас редактора: components/, composables/ (useCanvas*), types/
│       │   ├── sidebar/          # сайдбар: components/ (+property-editors/), composables/, utils/, types/
│       │   ├── toolbar/          # тулбар: чисто презентационные components/
│       │   ├── render/           # рендер опубликованной страницы (самодостаточен)
│       │   ├── layouts-blocks/   # блоки лендинга (Grid/Flex/Section/Slider/...)
│       │   ├── editor/           # tiptap rich-text + inline editing
│       │   ├── media/            # галерея/медиа-пикеры
│       │   ├── persistence/      # ❌ не создан — Шаг 6: storage/publish-абстракция + адаптеры
│       │   └── common/           # ТОЛЬКО общее (2+ доменов): composables/, utils/, types/
│       ├── plugins/              # nuxt-плагины (тонкие entry-points, импортируют из доменов)
│       ├── server/               # api-ручки + utils/db (→ persistence на Шаге 6)
│       └── assets/scss/          # стили, токены
├── playground/                   # demo Nuxt-app
├── test/                         # ❌ не создан — Шаг 7: vitest + @nuxt/test-utils
└── build.config.ts
```

Направления зависимостей: `builder` → любой домен; `render` — только common + layouts-blocks;
`layouts-blocks` → `editor`. Импорты — явные относительные.

## Статус

| Шаг                            | Статус       | Комментарий                                                                                      |
| ------------------------------ | ------------ | ------------------------------------------------------------------------------------------------ |
| 0–2. Scaffold, перенос, module | ✅ Готово    | Домены в `src/runtime/modules/`, регистрация через `@nuxt/kit`                                   |
| 3. Дебрендинг                  | ✅ Готово    | Добиты хвосты (2026-06-11): pinia ids → `bricks*`, `ILand*` → `IBrick*`, `--land-*` → `--bricks-*`, `.land-dark` → `.bricks-dark`, `BricksLandIcon` → `BricksIcon`; CLAUDE.md/rules актуализированы |
| 4. UI → Reka UI                | ✅ Готово    | Осталась только ручная регрессия (см. «Известные доработки»)                                     |
| 5. Чистка зависимостей         | ✅ Готово    | `@idaproject/*` убраны; `tiny-sha256` оставлен осознанно                                         |
| Нейминг-консолидация           | ✅ Готово    | Все 15 шагов выполнены, план (`rename-plan.md`) удалён; правила — `.claude/rules/naming.md`      |
| Ребрендинг landing → bricks    | ✅ Готово    | Полный (2026-06-11): идентификаторы/файлы `*Landing*` → `*Bricks*`, `/api/landing` → `/api/bricks`, URL `/landing/:pagename` → `/bricks/:pagename`, `appConfig.landing` → `appConfig.bricks`, layout `landing` → `bricks` (+legacy-маппинг в `normalizePublishedPage`), `ida-tiptap-table` → `bricks-tiptap-table` |
| 6. Persistence-абстракция      | ❌ Не начато | `StorageAdapter`/`PublishAdapter` нет; сейчас — `server/routes/mock-api/*` + `server/middleware/` |
| 7. Playground + тесты          | 🟡 Частично  | `playground/` есть; `test/` отсутствует                                                          |
| 8. Сборка и публикация         | ❌ Не начато | README/LICENSE нет, `npm pack`/`publish` не проверялись                                          |

---

## Оставшиеся шаги

> Решение «слово landing — сущность, не переименовывается» отменено 2026-06-11:
> ребрендинг выполнен полностью, слово `landing` в идентификаторах/путях/ключах запрещено
> (см. `.claude/rules/naming.md`). ⚠️ Пути `/api/bricks/*` требуют синхронного обновления
> роутов на Python-бэкенде (он будет переписан на Node — принято осознанно).

### Шаг 6. Серверная часть: абстракция хранилища

- Ввести интерфейсы `StorageAdapter` (CRUD лендингов) и `PublishAdapter` (публикация/медиа в S3)
  в `runtime/modules/persistence/`.
- Перенести текущую реализацию (Postgres из `server/utils/db` + `@aws-sdk` S3) как **дефолтный адаптер**.
- Ручки `runtime/server/*` работают через адаптер; адаптер выбирается из опций модуля/`runtimeConfig`.
- Разработчик задаёт `bricks: { database: {...}, s3: {...}, fields: {...} }` в `nuxt.config` (+ `.env`);
  опционально передаёт свой адаптер.
- В README — описать необходимые поля/таблицы (SQL-инициализация).
- Серверные зависимости (по дефолтному адаптеру): `@aws-sdk/client-s3`, `sharp`, драйвер Postgres, `upath`.

### Шаг 7. Тесты

- `test/` — `vitest` + `@nuxt/test-utils`: smoke-тест загрузки модуля, рендер блоков лендинга,
  генерация story-манифеста (`bricks:gen`).
- Скрипт `npm run test`.

### Шаг 8. Сборка и публикация

- `npm run build` (`nuxt-module-build`) → `dist/` (ESM + типы + `runtime/`); проверить `exports`/`files`/`prepack`.
- README (установка `npm i nuxt-bricks` + `modules: ['nuxt-bricks']`, конфиг `bricks: {...}`,
  предупреждение про дефолты basic-auth), LICENSE.
- `npm pack` — в тарболе только `dist/` (+ README/LICENSE).
- `npm publish` (проверить занятость имени `nuxt-bricks`), пуш в GitHub.

---

## Известные доработки (pre-existing, не блокируют)

### Ручная регрессия Reka-миграции

Миграция модалок/комбобокса/аккордеона проверена только типами и линтом — нужна ручная
проверка в `/builder`: открытие/закрытие модалок, Esc в медиа-галерее с открытым превью,
тулбар TipTap, аккордеон на канвасе и published-странице.

Осознанно оставлены свои (без Reka): `BricksToolbarColorPicker`, `BricksTableGridPicker`,
`BricksTagsEditor`, `BlockSlider` (swiper), `BricksInput`/`BricksTextArea`/`BricksHexInput` (нативные).

### Кросс-доменные связки (tech-debt)

- `layouts-blocks/BlockSlider.vue` статически импортирует `builder/stores/canvas` — развязать через provide/inject.
- `editor/composables/useInlineEditor.ts` импортирует `builder/stores/components` — рассмотреть инверсию через параметры/inject.
- `ui/inputs/BricksTextArea.vue` лениво (`import()`) тянет `editor/` — кандидат на развязку.
- `middleware/bricks-page-layout.global.ts` нигде не регистрируется (`module.ts` без `addRouteMiddleware`) — pre-existing gap.
- Будущие md-статьи документации класть в `runtime/modules/builder/docs/guide/`
  (glob `../docs/guide/**/*.md` в `useDocumentationArticles`).

### Ошибки vue-tsc / oxlint (18 шт., не связаны с миграцией)

- `canvas/components/TheCanvas.vue`, `layouts-blocks/components/BlockGrid.vue`, `BlockSpace.vue` —
  TS2769 (computed возвращает union с `undefined`-полями, не совместим с `Record<string, string>`)
- `common/composables/useApiClient.ts`, `plugins/bricks-dynamic-routes.ts` — TS2304: nuxt auto-imports
  не резолвятся при standalone `vue-tsc` — нужен явный импорт из `#imports`
- `render/composables/useRendererLayouts.ts` — oxlint `max-lines` (1021/1000) — разнести на части
- `builder/composables/useDocumentationArticles.ts` — `import.meta.glob` с `query` не типизируется
- `render/pages/[pagename].vue` — типизация `useAsyncData`-обёртки
- `middleware/bricks-page-layout.global.ts` — `LayoutKey` из `#build/types/layouts`
- `server/middleware/proxy.client.ts` — TS2345

## Верификация (финальная)

1. `npm run dev:prepare && npm run dev` — playground поднимается, билдер открывается, блоки рендерятся.
2. Создать лендинг в билдере → проверить сохранение/публикацию через дефолтный адаптер (или мок в тестах).
3. `npm run bricks:gen` — манифест `bricks.json` генерируется.
4. `npm run test` — smoke загрузки модуля, рендер блоков, генерация манифеста.
5. `grep -rniE "idaproject|idaland|idacloud|--ida-|--land-|landing" src/ playground/` → пусто (кроме legacy-маппинга `layout === 'landing'` в `normalizePublishedPage`).
6. `npm run build` → `dist/`; `npm pack` — в тарболе только `dist/` (+ README/LICENSE).
7. Линт/типы: `oxlint`, `vue-tsc --noEmit`, `stylelint`.

## Порядок

6 (persistence) → 7 (тесты) → 8 (публикация).
