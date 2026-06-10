# Рефакторинг ida-landing → nuxt-bricks

## Контекст

`@idaproject/ida-landing` — визуальный drag-and-drop билдер лендингов на Nuxt 3,
который сейчас распространяется как **Nuxt layer** (`package.json:main → ./nuxt.config.ts`,
сырые исходники без сборки, потребитель подключает через `extends`).

Автор ушёл из компании и хочет:

- убрать любое упоминание `idaproject` (имя пакета, бренд, CSS-префиксы, story-расширение, registry);
- заменить весь самописный UI-кит на headless-примитивы **Reka UI** (Vue-порт Radix Primitives), на которые натягиваются текущие стили;
- почистить зависимости, оставив только нужные;
- превратить проект в самостоятельный **Nuxt Module** (`modules: ['nuxt-bricks']`, **без nuxt-layers**) с реальной сборкой;
- вшить серверные ручки прямо в модуль через абстракцию хранилища (дефолт Postgres+S3, заменяемый);
- организовать **модульную архитектуру** (модульный монолит, самодостаточные домены в `src/runtime/modules/`), опубликовать в GitHub и npm.

**Ключевой факт из анализа:** основной код билдера (`components/`, `composables/`, `store/`, `pages/`,
`plugins/`, `utils/`, `types/`) **почти не содержит** импортов `@idaproject/*`. Все 6 пакетов
(`core`, `filter`, `ymaps3`, `form`, `seo`, `device`) используются **только в `.playground/`**,
который не публикуется и **в новый модуль не переносится**. Поэтому «отвязка от компании» в коде —
это в основном дебрендинг (строки/префиксы/имена), а не переписывание логики.

## Принятые решения

| Вопрос                 | Решение                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| Формат пакета          | **Nuxt Module** на `@nuxt/module-builder` + `@nuxt/kit` (не layer)                                    |
| Имя пакета / репо      | **`nuxt-bricks`**                                                                                     |
| UI-кит                 | **Reka UI** (headless), поверх — текущие SCSS-стили                                                   |
| Серверная часть        | Ручки вшиты в модуль через **абстракцию storage/publish**, дефолтный адаптер Postgres+S3 (заменяемый) |
| `.playground` (старый) | **Не переносим**. Новый минимальный `playground/` + тесты                                             |
| Тестирование           | `playground/` (demo Nuxt-app с `modules: ['../src/module']`) + `vitest` + `@nuxt/test-utils`          |
| Архитектура            | **Modular** — домены в `src/runtime/modules/`                                                         |

## Целевая структура каталогов

```
nuxt-bricks/
├── src/
│   ├── module.ts                 # defineNuxtModule — регистрирует всё
│   └── runtime/
│       ├── modules/              # домены (модульный монолит)
│       │   ├── ui/               # headless UI-кит на Reka UI (base/inputs/feedback/tooltip)
│       │   ├── builder/          # редактор: components/{canvas,sidebar,toolbar,modal},
│       │   │                     #   composables/, stores/ (canvas, components+actions, sidebar,
│       │   │                     #   history, navigation, publish), pages/, utils/, constants/, types/
│       │   ├── render/           # рендер опубликованной страницы: components/, composables/, pages/, types/
│       │   ├── layouts-blocks/   # landing-блоки (Grid/Flex/Section/Slider/...): components/, composables/, utils/, types/
│       │   ├── editor/           # tiptap rich-text: components/, composables/, stores/(inlineEditing),
│       │   │                     #   tiptap/(расширения), utils/, types/
│       │   ├── media/            # галерея/медиа-пикеры: components/, composables/, stores/, utils/, types/
│       │   ├── persistence/      # (Шаг 6, не создан) storage/publish-абстракция + адаптеры
│       │   └── common/           # ТОЛЬКО общее (2+ доменов): composables/ (useLandingConfig,
│       │                         #   useStoryImports, useApiClient, useLandingStyles),
│       │                         #   utils/landing/{paths,components,deviceVisibility},
│       │                         #   utils/routing/ (build-time), types/ (landing, config, global, landing-api)
│       ├── plugins/              # nuxt-плагины (тонкие entry-points, импортируют из доменов)
│       ├── server/               # api-ручки + utils/db (→ persistence на Шаге 6)
│       └── assets/scss/          # стили, токены
├── playground/                   # demo Nuxt-app для разработки/проверки
├── test/                         # vitest + @nuxt/test-utils
├── build.config.ts               # unbuild config (module-builder)
├── package.json                  # exports/files/bin, scripts prepack/dev
└── README.md
```

> Деление на домены = **Modular Approach**: каждый домен держит свои компоненты/композаблы/типы рядом.
> `builder` может зависеть от любого домена; `render` самодостаточен (только shared + layouts-blocks);
> `layouts-blocks` → `stores`, `editor`; `ui` → `editor` только lazy.

### Зафиксированные кросс-доменные связки (tech-debt)

- `layouts-blocks/BricksSlider.vue` статически импортирует `builder/stores/canvas` (viewport на канвасе) — развязать через provide/inject.
- `editor/composables/useLandingInlineEditor.ts` импортирует `builder/stores/components` — рассмотреть инверсию через параметры/inject.
- `ui/inputs/BricksTextArea.vue` лениво (`import()`) тянет `editor/` (TheTextEditorModal, tiptap-расширения) — кандидат на развязку.
- `middleware/landing-page-layout.global.ts` нигде не регистрируется (`module.ts` без `addRouteMiddleware`) — pre-existing gap.
- Будущие md-статьи документации класть в `runtime/modules/builder/docs/guide/` (glob `../docs/guide/**/*.md` в `useDocumentationArticles`).

## Статус выполнения (обновлено 2026-06-10)

| Шаг                         | Статус       | Комментарий                                                                                                                                                                                                                                                             |
| --------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Scaffold модуля          | ✅ Готово    | `src/module.ts`, `build.config.ts`, `playground/`, пакет `nuxt-bricks@0.1.0` на `@nuxt/module-builder`                                                                                                                                                                  |
| 1. Перенос в `src/runtime/` | ✅ Готово    | Доменное деление выполнено (2026-06-10): домены ui/builder/render/layouts-blocks/editor/media + общие stores/composables/utils/types. Перенос — одноразовым codemod (git mv + переписывание ~600 относительных импортов), скрипт удалён после миграции. Затем все домены собраны в `src/runtime/modules/` (импорты между доменами не менялись — переезжали вместе) |
| 2. `module.ts` регистрация  | ✅ Готово    | —                                                                                                                                                                                                                                                                       |
| 3. Дебрендинг               | ✅ Готово    | Компоненты `Landing*` → `Bricks*` (20 файлов), `IIda*` → `IBricks*`, `BricksClodeModal` → `BricksCloseButton`, удалены пустые `types/shims-idaproject-*`. Композаблы `useLanding*` и типы `ILanding*` оставлены — «landing» доменное имя, не бренд                       |
| 4. UI → Reka UI             | ✅ Готово    | См. таблицу маппинга ниже — у каждой строки проставлен статус                                                                                                                                                                                                           |
| 5. Чистка зависимостей      | ✅ Готово    | `@idaproject/*` из `package.json` убраны. `tiny-sha256` **оставлен** (добавлен в `dependencies` + shim `types/shims-tiny-sha256.d.ts`): решение — выпиливаем только идевские зависимости; `crypto.randomUUID` не годится (в браузере доступен только в secure context)   |
| 6. Persistence-абстракция   | ❌ Не начато | `StorageAdapter`/`PublishAdapter` нет; серверная часть — `server/routes/mock-api/*` + `server/middleware/`                                                                                                                                                              |
| 7. Playground + тесты       | 🟡 Частично  | `playground/` есть; `test/` (vitest + @nuxt/test-utils) отсутствует                                                                                                                                                                                                     |
| 8. Сборка и публикация      | ❌ Не начато | В репо ещё нет ни одного коммита; README/LICENSE/bin `bricks-gen` не сделаны                                                                                                                                                                                            |

### Известные доработки (pre-existing, не блокируют)

`npx vue-tsc --noEmit` падает в файлах, не связанных с Reka-миграцией (18 ошибок):

- `builder/components/canvas/BricksCanvas.vue`, `layouts-blocks/components/BricksGrid.vue`, `BricksSpace.vue` — TS2769 (computed возвращает union с `undefined`-полями, не совместим с `Record<string, string>`)
- `composables/useApiClient.ts`, `plugins/landing-dynamic-routes.ts` — TS2304: nuxt auto-imports (`useRuntimeConfig`, `useCookie`, `useRouter`, `useState`) не резолвятся при standalone `vue-tsc` — нужно явное импортирование из `#imports` (кросс-композабл импорты в `useModals`/`useLandingBuilderPage` починены явными импортами при доменной миграции)
- `render/composables/useLandingRendererLayouts.ts` — oxlint `max-lines` (1021 строка при лимите 1000) — нужно разнести на части
- `builder/composables/useDocumentationArticles.ts` — `import.meta.glob` с `query` не типизируется
- `render/pages/[pagename].vue` — типизация `useAsyncData`-обёртки
- `middleware/landing-page-layout.global.ts` — `LayoutKey` из `#build/types/layouts`
- `server/middleware/proxy.client.ts` — TS2345

## Этапы (по шагам)

### Шаг 0. Scaffold Nuxt-модуля в `bricks/`

- Инициализировать структуру `@nuxt/module-builder` (`src/module.ts`, `src/runtime/`, `playground/`, `build.config.ts`).
- `package.json`: `name: "nuxt-bricks"`, `build: "nuxt-module-build build"`, `dev`/`dev:prepare`, `exports`, `files: ["dist"]`, удалить `private`.
- Базовый `src/module.ts` с `defineNuxtModule({ meta: { name: 'nuxt-bricks', configKey: 'bricks' } })`.

### Шаг 1. Перенос исходников в `src/runtime/` с модульным делением

Копируем из эталона `/Users/saintfr3ak/Documents/Projects/front-lib/ida-landing` (без `.playground`, `.nuxt`, `node_modules`, `.playwright-mcp`):

- `components/{canvas,sidebar,toolbar,modal}` → `runtime/builder/`
- `components/{render}` → `runtime/render/`; `components/layouts` → `runtime/layouts-blocks/`
- `components/ui` → `runtime/ui/`; `components/tiptap` → `runtime/editor/`
- `composables/` → распределить по доменам + общий `runtime/composables/`
- `store/landing/` → `runtime/stores/`
- `pages/`, `plugins/`, `server/`, `utils/`, `types/`, `assets/`, `constants/`, `database/` → одноимённые в `runtime/`
- `app.vue`, `layouts/` — перенести логику в модуль (`extendPages` / `addLayout`), сам `app.vue` остаётся только в `playground/`.

### Шаг 2. `src/module.ts` — регистрация вместо layer

Layer-инъекция (`extends`) заменяется явной регистрацией через `@nuxt/kit`:

- `addComponentsDir` для `runtime/ui`, `runtime/builder`, `runtime/render`, `runtime/layouts-blocks` (с префиксом, напр. `Bricks`, вместо `Ida`);
- `addImportsDir` для `runtime/composables` и `runtime/utils`;
- `addPlugin` для каждого из `runtime/plugins/*` (vee-validate, json-editor, icons, styles);
- `extendPages` — добавить builder/landing маршруты; `addLayout` для landing-layout;
- `addServerHandler` для `runtime/server/api/*`;
- `installModule('@pinia/nuxt')` (и `@nuxt/icon`, если нужен) — то, что раньше тянул playground;
- `nuxt.options.css.push(...)` для SCSS-бандла + `swiper/css`;
- перенести `runtimeConfig` (basic-auth и пр.) и `vite.optimizeDeps`/кастомный watch-плагин story-файлов в `module.ts` (`addVitePlugin`).
- `defu`-мердж опций модуля (`bricks: { ... }`) в `runtimeConfig`.

### Шаг 3. Дебрендинг (idaproject → bricks) — см. чеклист ниже

Сквозная замена строк/префиксов/имён по всему `src/`.

### Шаг 4. UI → Reka UI (headless)

Устанавливаем `reka-ui`. Переписываем самописные `Ida*`-компоненты на примитивы Reka,
**сохраняя текущие SCSS-классы и разметку стилей** (меняем только внутренний механизм на headless).
Маппинг — см. таблицу ниже.

### Шаг 5. Чистка зависимостей

Все `@idaproject/*` уходят вместе с `.playground`. `peerDependencies`/`devDependencies` пересобираем —
см. таблицу «Зависимости».

### Шаг 6. Серверная часть: абстракция хранилища

- Ввести интерфейсы `StorageAdapter` (CRUD лендингов) и `PublishAdapter` (публикация/медиа в S3) в `runtime/persistence/`.
- Перенести текущую реализацию (Postgres из `database/` + `@aws-sdk` S3) как **дефолтный адаптер**.
- Ручки `runtime/server/api/*` работают через адаптер; адаптер выбирается из опций модуля/`runtimeConfig`.
- Разработчик задаёт `bricks: { database: {...}, s3: {...}, fields: {...} }` в `nuxt.config` (+ `.env`); опционально передаёт свой адаптер.
- В README — описать необходимые поля/таблицы (SQL-инициализация из `database/`).

### Шаг 7. Playground + тесты

- `playground/` — минимальный Nuxt-app: `modules: ['../src/module']`, `bricks: {...}` с тестовым конфигом, страница с билдером и страница-рендер.
- `test/` — `vitest` + `@nuxt/test-utils`: smoke-тест загрузки модуля, рендер landing-блоков, генерация story-манифеста.
- Скрипты: `npm run dev` (playground), `npm run test`.

### Шаг 8. Сборка и публикация

- `npm run build` (`nuxt-module-build`) → `dist/` (ESM + типы + `runtime/`).
- `package.json`: корректные `exports` (`.` → module, `./runtime/*` при необходимости), `prepack`, `files`.
- Заменить bin `idalanding-gen` → `bricks-gen` (story-генератор), обновить glob-паттерны (убрать `@idaproject/**`).
- `.npmrc`: убрать приватный `@idaproject:registry`. Публичный npm.
- `git init`, новый README (установка `npm i nuxt-bricks` + `modules: ['nuxt-bricks']`), LICENSE, удалить `CLAUDE.md`/внутренние доки эталона.
- `npm publish` (проверить занятость имени `nuxt-bricks`), пуш в GitHub.

## Маппинг UI: `Ida*` → Reka UI

| Текущий                                                                 | Reka UI                                                                                                                                                                                                                                                                                              | Статус              |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `BricksButton`                                                          | `Primitive` (`as="button"`) + свои стили                                                                                                                                                                                                                                                             | ✅                  |
| `BricksActionButton`                                                    | `DropdownMenuRoot/Trigger/Portal/Content/Item` (это кнопка с выпадающим меню, не plain button)                                                                                                                                                                                                       | ✅                  |
| Модальная система (6 модалок в `components/modal/`)                     | Базовый `ui/base/modal/BricksModal.vue` на `DialogRoot/Portal/Overlay/Content` + `VisuallyHidden DialogTitle`; все модалки пересажены на него. Esc/click-outside/focus-trap — от Reka (ручные keydown-листенеры удалены). `escapeKeyDown` пробрасывается наружу (нужно для lightbox в медиа-галерее) | ✅                  |
| `BricksClodeModal`                                                      | Кнопка закрытия (не модалка) — `BricksButton`, Reka не нужен                                                                                                                                                                                                                                         | ✅                  |
| `BricksSelect` + `BricksSelectOption`                                   | `SelectRoot/Trigger/Portal/Content/Item`                                                                                                                                                                                                                                                             | ✅                  |
| `BricksToolbarEditableSelect`                                           | `ComboboxRoot/Anchor/Trigger/Portal/Content/Item`; кастомный ввод `%`/`rem` остался нативным инпутом, `@mousedown.prevent` сохранены (TipTap-фокус)                                                                                                                                                  | ✅                  |
| `BricksSwitch`                                                          | `SwitchRoot/Thumb`                                                                                                                                                                                                                                                                                   | ✅                  |
| `BricksCheckbox`                                                        | `CheckboxRoot/Indicator`                                                                                                                                                                                                                                                                             | ✅                  |
| `BricksTooltip`                                                         | `TooltipProvider/Root/Trigger/Content`                                                                                                                                                                                                                                                               | ✅                  |
| `BricksTooltipHint`                                                     | Чистая презентация (контент тултипа) — Reka не нужен                                                                                                                                                                                                                                                 | ✅                  |
| `BricksToast`                                                           | `ToastProvider/Root/Title/Description/Viewport`                                                                                                                                                                                                                                                      | ✅                  |
| `LandingAccordion`                                                      | `AccordionRoot/Item/Header/Trigger/Content`, анимация через `--reka-accordion-content-height`; single-режим эмулируется поверх `type="multiple"`                                                                                                                                                     | ✅                  |
| `BricksInput`, `BricksTextArea`, `BricksHexInput`                       | Уже нативные; `NumberField` не уместен (мультирежимный инпут со строковым контрактом + vee-validate)                                                                                                                                                                                                 | ✅ без изменений    |
| `BricksToolbarColorPicker`, `BricksTableGridPicker`, `BricksTagsEditor` | Свои (нет прямого примитива) — оставить, причесать                                                                                                                                                                                                                                                   | ⏸ по плану остаются |
| `LandingSlider`                                                         | оставить `swiper` (headless-карусели в Reka нет)                                                                                                                                                                                                                                                     | ⏸ по плану остаётся |

> ⚠️ Reka-миграция модалок/комбобокса/аккордеона проверена только типами и линтом —
> нужна ручная регрессия в `/builder` (открытие/закрытие модалок, Esc в медиа-галерее
> с открытым превью, тулбар TipTap, аккордеон на канвасе и published-странице).

## Чеклист дебрендинга

| Что                         | Из                                           | В                                            |
| --------------------------- | -------------------------------------------- | -------------------------------------------- |
| npm-имя / author / registry | `@idaproject/ida-landing`, `npm.idacloud.ru` | `nuxt-bricks`, публичный npm                 |
| Префикс компонентов         | `Ida*` / `Landing*`                          | `Bricks*`                                    |
| CSS body-класс              | `.ida-landing-page`                          | `.bricks-page`                               |
| data-атрибуты               | `data-ida-container`, `data-ida-layout`      | `data-bricks-*`                              |
| CSS-переменные              | `--ida-*`, `--land-*`                        | `--bricks-*`                                 |
| visibility-классы           | `.ida-hide--mobile/tablet/desktop`           | `.bricks-hide--*`                            |
| story-файлы                 | `*.idaland.ts`                               | `*.brick.ts`                                 |
| манифест                    | `public/ida-lands.json`                      | `public/bricks.json`                         |
| bin / скрипт                | `idalanding-gen`, `idalanding:gen`           | `bricks-gen`, `bricks:gen`                   |
| basic-auth дефолт           | `admin/ida112233`                            | нейтральный дефолт + предупреждение в README |
| глобы story-генератора      | включают `@idaproject/**`                    | убрать                                       |
| README / CLAUDE.md / docs   | бренд idaproject                             | переписать под nuxt-bricks                   |

> Поиск остатков: `grep -ri "idaproject\|ida-land\|idaland\|--ida-\|idacloud\|ida112233" src/`.

## Зависимости

**Оставить (нужное ядро):** `vue`, `nuxt`/`@nuxt/kit`, `@pinia/nuxt`+`pinia`, `@vueuse/core`,
`vee-validate`+`@vee-validate/{rules,yup}`+`yup`, `@tiptap/*`, `swiper`, `vanilla-jsoneditor`+`json-editor-vue`,
`gsap` (если используется в анимациях), `scroll-lock`, `normalize.css`.
**Добавить:** `reka-ui`, иконки (`@iconify`/оставить `@kalimahapps/vue-icons` — проверить лицензию/бренд).
**Серверные (в зависимости от дефолтного адаптера):** `@aws-sdk/client-s3`, `sharp`, драйвер Postgres, `upath`.
**Удалить:** все `@idaproject/*` (core/device/filter/form/seo/ymaps3), приватный registry. `tiny-sha256` оставляем (не идевская зависимость; `crypto.randomUUID` в браузере работает только в secure context).
**Dev/сборка:** `@nuxt/module-builder`, `@nuxt/test-utils`, `vitest`, `oxlint`, `prettier`, `stylelint*`, `sass`, `typescript`, `vue-tsc`. Привести в порядок `patch-package` (патч `vite-plugin-checker` не idaproject-специфичен — оставить при необходимости).

## Верификация

1. `npm run dev:prepare && npm run dev` — playground поднимается, билдер открывается, landing-блоки рендерятся.
2. Создать лендинг в билдере → проверить сохранение/публикацию через дефолтный адаптер (или мок в тестах).
3. `npm run bricks:gen` — манифест `bricks.json` генерируется без `@idaproject`-глобов.
4. `npm run test` (vitest + @nuxt/test-utils) — smoke загрузки модуля, рендер блоков, генерация манифеста.
5. `grep -ri "idaproject\|idaland\|--ida-\|idacloud" src/ playground/` → пусто.
6. `npm run build` → `dist/` собирается; `npm pack` — в тарболе только `dist/` (+ README/LICENSE), без `.playground`, без приватного кода.
7. Линт/типы: `oxlint`, `vue-tsc --noEmit`, `stylelint`.

## Объём и порядок

Это крупный многоэтапный рефактор. Рекомендуемый порядок коммитов: 0→1→2 (модуль заводится как layer-эквивалент) → 3 (дебрендинг) → 4 (Reka UI, можно по компонентам) → 6 (persistence) → 5 (финальная чистка deps) → 7 (playground/тесты) → 8 (публикация). Шаги 1–2 — фундамент; до них модуль не запустится.
