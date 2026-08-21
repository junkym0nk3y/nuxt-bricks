# Спринт: комментарии на английский, чистка template/style

## Контекст

Комментарии в кодовой базе написаны по-русски: **21 599 строк** в `.ts`/`.vue`/`.scss`/`.sql`/`.mjs`
плюс **437 строк** русских HTML-комментариев. Проект готовится к публикации как npm-пакет, и
комментарии — тот слой, который уедет к внешнему разработчику нечитаемым. Самый наглядный
случай уже в проде: `src/module-scss.ts:58` пишет **русскую шапку комментария в SCSS-файл
внутри проекта потребителя**.

Комментарии при этом высокого качества: они объясняют **почему** принято решение и называют
дефект, который к нему привёл (`common/utils/apiRequestPolicy.ts` — почему повторы запрещены;
`builder/publish/utils/currentPageWrite.ts` — почему освежение списка не входит в результат
операции). Это не шум и не текст, который переводится регекспом: перевод обязан сохранить
нюанс, а по ходу чтения файла — проверить, что комментарий всё ещё верен. Точечная проверка
уже нашла пять разъехавшихся с кодом (раздел «Известные находки»).

Решения владельца, принятые при планировании:

- **Границы**: комментарии + имена кейсов в тестах (~2 000 русских `describe`/`it`) +
  dev-сообщения (`throw`/`console`) + локальные `README.md` в `composables/`/`utils/` (34 файла).
- **Ревью по KISS/DRY, оптимизации и доменам — только список находок, без правок.** Находки
  пишутся в `docs/comments-sprint-findings.md`, правки логики — отдельный спринт после.
  Причина: перевод не должен прятаться внутри рефакторинга, иначе находку ревью не отличить
  от опечатки перевода, а `git bisect` бесполезен.
- **template/style**: секции чистятся полностью, но ~110 строк рационала (записанные дефекты,
  замеры контраста, node-id макета) **сначала переезжают в `<script>`**, потом удаляются.
- **SassDoc `assets/scss/public/**`** — переносится в `README.md`, из `.scss` удаляется.
- **Приёмка** — скрипт `scripts/comment-language-check.mjs`. В `lint:check` не встраивать;
  штатные проверки и `sl:fix` владелец прогоняет сам.

---

## Границы

### Что переводим

`//`, `/* */`, `<!-- -->`, `--` (SQL), `#` (yml) комментарии в: `src/**` (включая **88 `.d.ts`**
— 2 232 строки, легко потерять, если глобить только `*.ts`), `test/**`, `scripts/**`, `e2e/**`,
`playground/**` (13 строк), корневые конфиги (67 строк). Плюс имена кейсов в тестах,
dev-сообщения и 34 локальных `README.md`.

### Никогда не трогать

| Что                        | Где                                                                                                                         | Почему                                                                                                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Локали                     | `src/runtime/locales/{ru,en}.json` (861 ключ, паритет чистый)                                                               | продуктовый текст                                                                                                                                                       |
| Статьи документации        | `builder/documentation/docs/guide/ru/**` (8 файлов, 551 стр.)                                                               | продуктовый контент в бандле                                                                                                                                            |
| **Таблицы транслитерации** | `builder/publish/utils/slugify.ts:8-40`, `common/utils/slug.ts:14-46`                                                       | **66 голых кириллических ключей**; любая замена по диапазону молча ломает slug'и. Таблицы намеренно различаются (`ц: 'ts'` vs `ц: 'c'`) — не «унифицировать»            |
| Хардкод UI-текста          | 10 строк в `<template>`, 12 фраз `app/constants/loaderPhrases.ts`, 4 дефолта блоков, 4 плейсхолдера рендера, 2 i18n-фолбэка | i18n-долг, отдельная тема                                                                                                                                               |
| Фикстуры и ожидания тестов | ~502 строки, из них **68 точных ассертов**                                                                                  | контрактные: `test/publish/slugify.spec.ts:11-13`, `documentationArticles.spec.ts:33` (`'Начало работы'` — H1 статьи), `authProfileMenu.spec.ts` (`'Сергей Воронежев'`) |
| Owner-документация         | `README.md`, `AGENTS.md`, `docs/**`, `.claude/**`, `PAPERCUTS.md`                                                           | не в границах спринта                                                                                                                                                   |

### Ловушки инструментов

1. **`<!--[\s\S]*?-->` внутри регекспа.** `persistence/server/utils/fileSignatures.ts:29` — это
   **не комментарий**, а литерал регекспа для проверки SVG. Репо-широкий strip `<!--…-->` ломает
   валидацию загрузки SVG. Удаление HTML-комментариев вести только по секции `<template>`.
2. **Русские комментарии внутри template-литералов — 3 файла.** Лексер их пропустит (это
   содержимое строки), регексп попадёт и может испортить литерал:
   `common/utils/bricks/containerCss.ts:74+` и `layouts-blocks/utils/deviceVisibilityCss.ts:46+`
   (генерируемый CSS), `persistence/server/postgres/postgresAuthAdapter.ts:67-70`
   (4 строки SQL `--` внутри tagged-литерала). Править вручную.
3. **`^\s*(//|/\*|\*)` теряет ~470 строк** — продолжения многострочных `<!-- -->` и `/* */` не
   несут префикса. Счётчик и гейт делать состояние-машиной, не регекспом по началу строки.
4. **`migrations/0001_init.sql` под checksum-контролем.** `src/cli/bricks-migrate.mjs:243-244`
   валит правку («Выпущенные миграции не редактируются»), `scripts/integration-smoke.mjs:189`
   ассертит отсутствие дрейфа. Порядок из `AGENTS.md` обязателен: правка → пересчёт строки в
   `bricks_schema_migrations` (`src/cli/bricks-migrate-checksum.mjs`) → 0 pending. DDL не меняется.
5. **Prettier комментарии не переносит** (`printWidth: 100`, `tabWidth: 4`) и не жалуется.
   Перенос строк — руками. `oxlint max-lines: 500` — удаление и перевод только укорачивают.

---

## Целевой стиль

Англоязычного прецедента в репозитории **нет**: три «английских» файла содержат только
`// #region` и тривиальный JSDoc. Эталон регистра — `common/utils/apiRequestPolicy.ts`
(шапка) и `persistence/server/utils/requestBodyLimits.ts` (шапка плюс блок над
`INFLIGHT_MULTIPART_BUDGET_BYTES`); что именно им зафиксировано — в
`comments-sprint-log.md`.

- Одна строка JSDoc: глагол в 3-м лице, без точки — `/** Toggles checkbox on Enter key (parity with native behavior) */`
  (`ui/base/checkbox/BricksCheckbox.vue:56`).
- Длинные блоки: сохранять структуру «решение → отброшенная альтернатива → дефект, который
  к этому привёл». Нормативные формулировки оставлять нормативными:
  `common/utils/bricks/routePaths.ts` запрещает хардкод `/bricks` — в переводе это должно
  остаться запретом, а не описанием.
- Орфография: **американская** (`behavior`, не `behaviour` — единственный существующий пример
  использует британскую, её и переписать).
- `// #region` уже английские везде (~1 630 маркеров), кроме **9 в `src/module.ts`**
  (:99, :130, :146, :152, :165, :182, :203, :344, :351). У `:344` метка вдобавок обрезана —
  открытая скобка не закрыта.
- **Убирать по ходу перевода** (это работа с комментарием, а не правка кода):
  10 приписок `(находка ревью)` — процессная метаинформация, читателю не говорит ничего
  (`builder/app/composables/usePageThumbnail.ts:112,130,180`, `useBuilderSession.ts:401`,
  `useBuilderSessionAddressSync.ts:68`, `publish/utils/currentPageWrite.ts:141,207`,
  `publish/stores/publish.ts:179,273`, `app/composables/useComponentLibrary.ts:53`);
  висячую ссылку `(см. modules-restructure.md)` на несуществующий файл
  (`builder/shell/sidebar/types/composables.d.ts:23`) — `AGENTS.md` прямо требует такие убирать;
  закомментированный мёртвый код `shell/toolbar/components/TheBuilderShellToolbar.vue:47-69`
  (там же живой JSDoc над мёртвой функцией — читается как рабочий код).

---

## Правила для template и style

Секции `<template>` и `<style>` остаются без комментариев. **1 498 строк** к удалению
(596 template в 73 файлах, 567 `<style>` в 93, 335 `.scss` в 8).

**Шаг 1 — перенести, потом удалять.** ~110 строк несут знание, которого больше нигде нет.
Переезжают в `<script setup>` (JSDoc на соответствующий `computed`/prop или блок в шапке
файла), сразу по-английски. Обязательные к переносу:

- `ui/base/modal/BricksModal.vue:120,135,143` — зачем `appear` у `<Transition>` для ленивых
  модалок; почему `DialogContent` не вкладывается в `DialogOverlay`; почему
  `bricks-modal-window` — глобальный класс.
- `ui/inputs/BricksSelect.vue:112` и `render/pages/[pagename].vue:225` — **рационал, на
  который опирается `test/module/accessibleNameUsages.spec.ts:73-75,84-86`**.
- `render/components/RendererCloseButton.vue:61` — почему дубль `BricksCloseButton` законен
  (граница `render-lean`); это единственное объяснение того, что ассертит
  `test/render/rendererCloseButtonParity.spec.ts`.
- `ui/base/tooltip/BricksTooltip.vue:141-143` и `ui/feedback/BricksToast.vue:340-342` — почему
  keyframes живут в module-блоке (иначе Reka зависает на `closed`).
- Замеры контраста: `ui/inputs/BricksTagsEditor.vue:337-339`, `ui/base/badge/BricksBadge.vue:95`.
- `ui/base/modal/BricksCloseButton.vue:65-66` — единственная в коде ссылка на node макета `174:190`.
- `layouts-blocks/components/BlockText.vue:108-111` — почему `@container` убраны;
  `BlockMedia.vue:84`, `BlockSlider.vue:288`, `ui/base/image/BricksImage.vue:348,362`,
  `BricksModalHeader.vue:69`, `BricksActionButton.vue:101`, `BricksSwitch.vue:132-136`,
  `ui/base/surface/BricksSurfaceCard.vue:78,98,104`, `ui/base/tabs/BricksTabBar*.vue`.

**Шаг 2 — удалить всё остальное**, кроме жёсткого allow-list:

| Оставить дословно                                      | Причина                                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `layouts-blocks/components/BlockSvg.vue:110,117`       | `eslint-disable`/`enable vue/no-v-html`                                                                             |
| `layouts-blocks/components/BlockAccordion.vue:116,140` | `eslint-disable-next-line vue/no-v-html`                                                                            |
| `ui/base/checkbox/BricksCheckbox.vue:151,154`          | `stylelint-disable`/`enable` — иначе `-webkit-mask-image` валит `property-no-vendor-prefix`                         |
| `assets/scss/common/_normalize.scss:16,191`            | `stylelint-disable`/`enable` — прикрывает **175 строк вендоренного normalize.css**; удаление зальёт сборку ошибками |
| `assets/scss/common/_normalize.scss:1-13`              | атрибуция MIT для вендоренного кода                                                                                 |

`BricksCheckbox.vue:152` `/* postcss-ignore-line */` — в этой цепочке инструментов директивы
нет ни у stylelint, ни у postcss. Проверить `sl:check` до/после; если инертна — удалить,
пару `stylelint-disable` оставить.

**Шаг 3 — SCSS `public/**` → README.** 94 строки SassDoc (`mixins.scss:1-15`,
`public/\_devices.scss:1-27,32-34,41-48`и 9 блоков с`@param`/`@return`для`device-width`,
`next-device`, `from`, `below`, `between`, `only`, `hide-from`, `hide-below`, `hide-only`)
переезжают в README, раздел **«Адаптивные стили brick-компонентов»** (`README.md:201`) — он
уже документирует эти миксины и уже содержит объяснение guard'а по атрибуту. После переноса
`.scss`чистится. Заодно перенести три ловушки-предупреждения, иначе их удаление приглашает
«причесать» пакет и сломать его:`bundle.scss:1-4`(почему`fonts`намеренно не`@use`'ится —
sass не ребейзит `url()`, `woff2`ломается в`dist`), `common/fonts.scss:1-3`(почему`'Inter'`— строковый литерал для`useBricksConfig.defaultFont`), `default.scss:26-27`(порядок`@layer`; это же ассертит `test/module/styleIsolation.spec.ts:147`).
Запись об узаконенном исключении по SCSS-переменным дублируется в
`.claude/rules/styles.md` — там она сохранится.

**После удаления stylelint закономерно краснеет**: `rule-empty-line-before` и
`at-rule-empty-line-before` настроены с `ignore: ["after-comment"]`, и правило, стоявшее
прямо под комментарием, теперь требует пустой строки. Правится `npm run sl:fix` — прогоняет
владелец. Без этого хук `.lintstagedrc.cjs` заблокирует коммит: stylelint там без `--fix`.
Тесты, читающие CSS, комментарии сами вырезают (`styleIsolation.spec.ts:73`,
`rendererCloseButtonParity.spec.ts:79`) — удаление им безразлично.

---

## Этапы

Порядок — снизу вверх по слоям `.dependency-cruiser.cjs`: когда комментарий ссылается на
нижний слой, тот уже нормализован. Числа — строки русских комментариев (`js` + `html`).

### Фаза A — фундамент

| №   | Область          | Объём     | Заметки                                                                                                                                                                                                                                              |
| --- | ---------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `common`         | 2001, 66ф | ⚠️ Самая плотная проза в репозитории: `utils/apiRequestPolicy.ts` 118, `utils/bricks/routePaths.ts` 117 (нормативный запрет хардкода путей), `composables/useApiClient.ts` 84, `utils/bricks/devices.ts` 70. Здесь же ловушка №2 (`containerCss.ts`) |
| 2   | `ui`             | 882 + 39  | Полная чистка template/style + перенос рационала (список выше). `BricksImage.vue` — 105-строчный `@description` о трёхстадийной загрузке. Фактчек: `ui/base/button/BricksButton.vue:246` `// Modifiers from new_ui` — `new_ui` в репозитории нет     |
| 3   | `layouts-blocks` | 602 + 5   | Inline-тяжёлый (100 строк `//`), много CSS-рационала. allow-list `BlockSvg`/`BlockAccordion`. Ловушка №2 (`deviceVisibilityCss.ts`)                                                                                                                  |
| 4   | `text-editor`    | 361 + 2   | Короткие тактические заметки об обходах TipTap                                                                                                                                                                                                       |
| 5   | `render`         | 566 + 2   | ⚠️ Инверсия формы: 163 строки inline `//` против 27 JSDoc — пошаговые комментарии внутри функций дрейфуют быстрее всего, самый урожайный фактчек. `useRendererDataSources.ts` 92, `useBricksDataSources.ts` 75                                       |

### Фаза B — сервер и сборка

| №   | Область                              | Объём     | Заметки                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6   | `persistence`                        | 2464, 51ф | ⚠️ Самый крупный домен. Контракты на `.d.ts`: `types/adapters.d.ts` 149, `types/authAdapters.d.ts` 146; `postgresAuthUserMethods.ts` 114, `server/utils/requestBodyLimits.ts` 96 (три барьера против буферизации тела). Ловушка №2 (`postgresAuthAdapter.ts`)           |
| 7   | `server`                             | 1142, 60ф | ⚠️ `middleware/auth.ts:1-32` — 32-строчная матрица безопасности (что защищено, что намеренно нет, basic vs database, лимиты). Самый дорогой в ошибке комментарий репозитория, переводить отдельным заходом. Плюс `utils/auth/userManagement.ts` 101, `rolePolicy.ts` 90 |
| 8   | `plugins` + `middleware` + `src/cli` | 227, 13ф  | Дешёвый. `src/cli/bricks-migrate.mjs` — `--help` и ошибки видит интегрирующий разработчик                                                                                                                                                                               |
| 9   | build-time `src/*.ts` + `src/types`  | 758, 16ф  | 9 русских `#region` в `module.ts` (метка `:344` обрезана). **`src/module-scss.ts:58` — русская шапка, уезжающая в проект потребителя, приоритет.** `src/types/module.d.ts` 127 — публичный контракт опции `bricks` в `nuxt.config`                                      |
| 10  | `assets/scss`                        | 243, 8ф   | Удаление + SassDoc → README (шаг 3 выше)                                                                                                                                                                                                                                |

### Фаза C — builder

| №   | Область                                       | Объём      | Заметки                                                                                                                                                                                                                         |
| --- | --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11  | `builder/core`                                | 659 + 2    | Ядро состояния; `core/utils/ids.ts:7` — проверить утверждение про `useId` (Vue 3.5 / deprecated ре-экспорт в Nuxt)                                                                                                              |
| 12  | `builder/canvas`                              | 620 + 14   | `viewport/composables/useCanvasRemBase.ts:16` — блок на 22 строки                                                                                                                                                               |
| 13  | `builder/shell`                               | 754 + 54   | Мёртвый блок `TheBuilderShellToolbar.vue:47-69`; висячая ссылка `modules-restructure.md`                                                                                                                                        |
| 14  | `builder/auth`                                | 564 + 23   |                                                                                                                                                                                                                                 |
| 15  | `builder/users`                               | 736 + 24   | Длинные блоки: `useUsersCreateForm.ts:126` (29 строк), `useUsersActions.ts:28` (27)                                                                                                                                             |
| 16  | `builder/media`                               | 1250 + 115 |                                                                                                                                                                                                                                 |
| 17  | `builder/templates` + `builder/documentation` | 428, 20ф   | Статьи `docs/guide/ru/**` не трогать                                                                                                                                                                                            |
| 18  | `builder/publish`                             | 2004 + 119 | ⚠️ Крупнейший поддомен. `utils/currentPageWrite.ts:46` (31 строка, порядок гарантий), `composables/usePublishSchemaImport.ts:28`, `utils/requestErrors.ts` 96, `stores/publish.ts` 102. `utils/slugify.ts` — таблицу не трогать |
| 19  | `builder/app`                                 | 1297 + 28  | Composition root, последним. `useBuilderSession.ts` 163, `useComponentLibrary.ts` 126, `pages/[pagename].vue` 101. `constants/loaderPhrases.ts` не трогать                                                                      |

### Фаза D — периферия

| №   | Область                                    | Объём      | Заметки                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20  | Локальные `README.md`                      | 34ф, ~330  | `common/utils` 30, `persistence/server/utils` 26, `publish/composables` 19, `server/utils/auth` 18. `common/composables/README.md:22` описывает конвенцию `#region`                                                                                                                                                         |
| 21  | Комментарии в `test/**`                    | 3630, 216ф | Только комментарии. Хелперы и стабы тоже: `test/helpers/`, `test/stubs/`. Фикстуры не трогать                                                                                                                                                                                                                               |
| 22  | Имена кейсов в `test/**`                   | ~2 000     | Отдельным этапом от 21: `describe`/`it` — строковые литералы, и диф лучше держать раздельно. Ни один из 224 спеков не имеет английских имён. `e2e/` уже английский. **68 точных ассертов с русскими значениями не переписывать**                                                                                            |
| 23  | `scripts` + конфиги + `e2e` + `playground` | ~355       | `scripts/**` 259 (+115 строк сообщений), `.dependency-cruiser.cjs` 42, `vitest.config.ts` 17, `ci.yml` 9, `docker-compose.yml` 6, `playground/nuxt.config.ts` 6, `build.config.ts` 5, `knip.ts` 3, `.gitattributes` 2, `dependabot.yml` 2. `stylelint-margin-rules.mjs:5-6` — это шаблоны сообщений линтера, не комментарии |
| 24  | `migrations/0001_init.sql`                 | 152        | Только по процедуре из `AGENTS.md` с пересчётом checksum (ловушка №4). DDL не меняется. Если владелец решит, что 152 строки комментариев того не стоят — этап снимается                                                                                                                                                     |
| 25  | Правило в `.claude/rules`                  | —          | Такого правила сейчас нет вовсе: ни в `.oxlintrc.json`, ни в `.claude/rules/*`. Без записи долг вернётся с первым же новым файлом. Внести в `typescript.md` и `vue-sfc.md`: комментарии по-английски, `<template>`/`<style>` без комментариев, allow-list lint-директив                                                     |

### dev-сообщения (сквозь этапы)

Русских `throw`/`console` в `src/runtime` почти нет — правится в этапе своего домена:
`server/middleware/auth.ts:109,242`, `server/utils/bricksComponents.ts:24`,
`common/composables/useBricksDevices.ts:62`, `render/composables/useRendererDataSources.ts:303,313,323`.
Build-time — этап 9: `brick-literals.ts` 13, `brick-metadata.ts` 13,
`module-backend-config.ts` 14, `module-runtime-config.ts:78`, `module.ts:230,257,328`.
В `src/runtime` **нет** русских `statusMessage` (все 124 `createError` английские) и нет
русских тостов.

**Исключение:** `server/utils/bricksComponents.ts:67` — русский текст в
`createError({ data: { description } })` **пересекает HTTP-границу** и может отрендериться в
интерфейсе. Не переводить, записать в находки как i18n-долг.

---

## Приёмка

`npm run comments:check` (устройство и решения — `comments-sprint-log.md`):

```
npm run comments:check                                    # отчёт по всем областям
npm run comments:check -- --area=<id>                     # закрытие этапа: падает при любом остатке
npm run comments:check -- --area=<id> --metric=comments   # закрытие по одному счётчику (этапы 21 и 22)
npm run comments:check -- --list                          # каждая строка-нарушитель
npm run comments:check -- --diff                          # рабочее дерево против HEAD: только комментарии
```

Порядок закрытия этапа: `--area=<id>` даёт ноль → `done: true` у этой области в
`scripts/comment-sprint-areas.mjs`. После этого вернувшийся русский комментарий валит
обычный прогон без флагов. В `lint:check` гейт **не** встраивается — по решению владельца.

**Верификация «код не менялся»** обязательна для всех этапов, кроме 10, 22 и 24:
`npm run comments:check -- --diff`. Это сильнее линтеров — доказывает отсутствие правки
логики, а не её безвредность. Колонка `literals` информационная: кириллица внутри
шаблонных литералов (ловушка №2) гейт не валит, её правят руками — кроме четырёх
файлов генерируемого вывода в колонке `gated`. Колонка `ru msgs` покрывает
dev-сообщения (`throw`/`console`) из раздела ниже.

Штатные проверки (`type-check`, `oxlint`, `sl:fix`, `stylelint`, `vitest`, `deps:check`) и
`npm run format` прогоняет владелец. Единственное место, где линтер закономерно краснеет
сам по себе, — этапы 2, 3 и 10 (удаление CSS-комментариев, см. выше).

---

## Ревью: только список

По каждому этапу — раздел в `docs/comments-sprint-findings.md`: файл, строка, что не так,
почему это находка. Правки логики в этом спринте не делаются. Категории:
разъехавшийся с кодом комментарий (правится текст — это и есть работа с комментарием),
нарушение KISS/DRY, мёртвый код, нарушение границ домена, кандидат на оптимизацию.

Ground truth для утверждений о границах — `.dependency-cruiser.cjs` (19 правил:
`common-is-bottom`, `ui-is-bottom`, `render-lean`, `layouts-blocks-deps`, `text-editor-deps`,
`persistence-is-server-only` и прочие).

### Известные находки

Список находок переехал в `comments-sprint-findings.md` — там же затравка из
планирования (5 расхождений комментария с кодом) и находки этапов. Правятся текстом
по ходу своего этапа.

Хорошая новость по долгу процесса: `TODO`/`FIXME`/`HACK`/`XXX` — **ноль**, ссылок на ID
спринтов (`BM-27` и подобные) — **ноль**, паритет локалей чистый, ни один тест не ассертит
содержимое комментариев.
