# План: редизайн nuxt-bricks (dark-accent) + i18n (ru/en)

> **Как пользоваться:** каждая фаза выполняется отдельной сессией с чистым контекстом
> («выполни фазу N из docs/redesign-i18n-plan.md»). После завершения фазы — обновить
> журнал прогресса ниже (статус, дата, заметки о нюансах/отклонениях для следующих фаз).
> Фазы строго последовательные, не начинать фазу при незавершённой предыдущей.

## Журнал прогресса

| Фаза                       | Статус | Дата       | Заметки                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Подготовка              | ✅     | 2026-07-02 | «тз» убран; baseline (type-check + lint:check) зелёный                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 1. Токены и палитра        | ✅     | 2026-07-02 | Всё по плану, кроме shell-токенов (откачены ревизией, см. фазу 2). Отклонения: `--rgb-indigo` удалён полностью (все 9 usages → `--rgb-primary`); `#212226` (\_darkPreview в text-editor/overlay) → `var(--bricks-dark-surface)`; canvas-reset дополнен `--bricks-base-400`/`--bricks-primary-600`/`--rgb-primary` (инвариант «канвас всегда светлый»); фикс несуществующей `--bricks-base-700` → `--bricks-base-800` в searchClear                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2. Темозависимый интерфейс | ✅     | 2026-07-02 | Первая реализация (всегда-тёмный shell по решению 1) **откачена по решению пользователя**: интерфейс следует теме, канвас статично светлый. Shell-токены/`.bricks-shell` удалены, остался `--bricks-dark-surface` для `_darkPreview`. Сохранены: расширенный light-reset превью в карточке, фиксы hover/empty-state/`base-700`, новые активные состояния навигации на primary. Тултипы и dropdown — темозависимые. Верифицировано в браузере в обеих темах                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 3. Рестайлинг UI-кита      | ✅     | 2026-07-02 | Бокс-инпуты (BricksInput: флекс-раскладка вместо абсолютов, степпер 1.8rem, hover base-400, focus-ring), BricksSelect/Option (бокс-триггер, дропдаун r-sm + border base-200, selected → primary-50/primary), BricksButton (1px, primary/danger без рамки + shadow-sm, hover primary-600). Тулбарные контролы/Toast/ConfirmModal уже были на токенах — только фиксы некратных размеров (1.1/1.3 → 1.2rem); BricksModal панелей не рендерит (display:contents) — нечего стилизовать. Property-editors: радиусы → var(--border-radius-xs), MediaPicker border 0.2rem → 1px. Сверх плана: у PublishView textarea удалён light-пин (наследие тёмного shell) — теперь темозависимая. **Синк в Figma выполнен**: Input (+2 Focus-варианта 61:315/61:320), Select, Button (30 вар.), Tags Editor, Hex Input; лог — в `/tmp/dsb-state-bricks-ds-001.json` → `componentSync`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 4. Inter                   | ✅     | 2026-07-03 | Inter v4.1 (InterVariable.woff2, 352 КБ, weight 100–900) + `LICENSE-Inter.txt` (OFL) в `assets/fonts/`, Onest-\*.woff2 удалены. `fonts.scss` — один `@font-face` (`woff2-variations`), `--bricks-font-family-base` — Inter-стек из плана. Верифицировано в playground: шрифт загружается (document.fonts, кириллица ок), обе темы; переполнений текста нет (программный скан) — вертикальная навигация, библиотека, панель свойств, тулбар TipTap (compact 460px, без overflow). Захардкоженных font-family не осталось (кроме намеренных monospace)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 5. Инфраструктура i18n     | ✅     | 2026-07-03 | `@nuxtjs/i18n@^10.4` в deps; module.ts — хук `i18n:registerModule` + условный installModule + warn в `modules:done` + side-effect type import для augmentation. locales ru/en: скелет неймспейсов + `common` и **весь** `validation` (нужен vee-validate). `i18nLabels.ts` + README utils. Отклонения: yup/vee-validate — **функции-сообщения с `t()`** вместо watch-подхода (резолв в момент валидации, реактивность бесплатно); правила decimal/slug возвращают `false` вместо строк (сообщение отдаёт generateMessage); `$i18n` в плагине резолвится **лениво** (при обратном порядке модулей плагин bricks выполняется раньше i18n); README в репо нет — примечание о порядке модулей ушло в CLAUDE.md (новый раздел «i18n (ru/en)»); vue-i18n `fallbackLocale` не задавали (эвристика `startsWith('bricks.')` уже покрывает). Smoke в playground: детект браузера (en у Playwright), cookie `bricks-locale` ставится/переживает reload, `setLocale` мгновенный; vee-validate (slug/required/decimal/max) и yup (required/min) проверены программно в обеих локалях. type-check/lint:check/test — зелёные                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 6. Извлечение строк        | ✅     | 2026-07-03 | Все 6 батчей выполнены; словари ru/en — по 454 ключа, паритет проверен скриптом. Сверх плана: неймспейс **`bricks.canvas`** (тулбар канвас-айтема + empty state — в плане отсутствовали); `bricks.library.categories.*` (мапа категорий: ru Layout → «Layout», Other → «Другое»); `bricks.media.categories.*` (MEDIA_CATEGORY_OPTIONS хранит ключи, `t()` в компонентах). Резолв-хуки: `resolveBricksLabel` в usePropertyVariants (labels+options), PropertyEditorRow (description), PropertyEditors (имена групп; группировка — по сырому ключу, стабильна между локалями), ComponentCard/useSidebarBrickDescription (описания), ComponentsView (категории). Паттерны: composables в setup — `useI18n()`; Pinia-сторы (publish, media) и module-level код (useModals.getModalOptions, requestErrors, plugins/text-editor-toolbar) — ленивый `useNuxtApp().$i18n`; yup-схема usePublishValidationSchema — функции-сообщения `() => t(...)` (реактивны к локали). Definitions: 10 файлов через параллельных агентов; ключи `bricks.blocks.<block>.props.<prop>.label\|description\|options.<slug>` + `groups.<slug>`; `name` блоков не тронут (идентификатор реестра). **Грабли**: unplugin-vue-i18n валит загрузку ВСЕЙ локали при HTML в значении (`<p>Ответ</p>` → плоский текст, обёртка в коде) и при literal-`{...}` в тексте (`[{text, subtitle?}]` → без скобок) — предупреждение добавлено в CLAUDE.md. Вне скоупа осознанно: render/ (по плану без i18n), документация (фаза 8), контент-дефолты блоков. Верификация: vue-tsc/oxlint/stylelint/depcruise/test зелёные; SSR-smoke в playground — обе локали рендерят переводы, intlify-warnings нет; полный клик-прогон матрицы {ru,en} — в фазе 9 |
| 7. Переключатель языка     | ✅     | 2026-07-04 | Кнопка RU/EN в `BuilderShellToolbarVerticalNav.vue` (между docs и тогглом темы; текстовая метка = текущая локаль uppercase, тултип — новый ключ `bricks.nav.language`; словари ru/en — по 455 ключей, паритет ок); emit `toggleLocale` → обработчик `handleToggleLocale` в `[pagename].vue` (`setLocale` из `useI18n()`, augmentation @nuxtjs/i18n типизирует без кастов). Сверх плана: на дашборде `publish/pages/index.vue` вертикальной навигации нет — добавлена своя кнопка-тоггл в правом верхнем углу (те же 3.6rem/0.8rem, но с рамкой base-300, т.к. фон страницы base-100); выровнен вертикальный ритм низа навигации (`margin-bottom: 1.6rem` снят с `.themeToggle` — раздувал зазор docs→locale до 2rem — заменён на `padding-bottom: 1.6rem` контейнера). Верифицировано в playground (Playwright): мгновенное переключение UI ru⇄en на билдере и дашборде, cookie `bricks-locale` пишется самим i18n и переживает reload, после удаления cookie срабатывает детект браузера (en у Playwright); скриншоты навигации в обеих темах — ок. **Нюанс**: кнопка docs переиспользует класс `.themeToggle` — селектор по классу матчит две кнопки. vue-tsc (полный) / oxlint / stylelint — зелёные                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 8. Документация по локали  | ✅     | 2026-07-04 | `git mv` 8 статей → `docs/guide/ru/`; `docs/guide/en/01-getting-started.md` — перевод 01-статьи, **без кросс-ссылок** на несуществующие en-статьи (клик по ссылке на отсутствующую статью — no-op, лучше не провоцировать). `useDocumentationArticles.ts`: `effectiveLocale` (активная локаль либо fallback `ru`, если папка пуста), фильтр glob-путей по `../docs/guide/<locale>/`, скоуп поиска в `navigateTo` префиксом локали, `watch(effectiveLocale)` — при смене локали активная статья сохраняется по имени файла (same-slug: 01-getting-started ru⇄en), иначе первая. UI-строки: заголовок модалки → `bricks.docs.title`, «Загрузка…» → переиспользован `bricks.common.loading`, «Статья не найдена.» → `bricks.docs.articleNotFound` (обёртка `<p>` в коде — HTML в словарях запрещён). Словари — по 457 ключей, паритет ок. Обновлены CLAUDE.md (раздел Documentation) и `.claude/commands/add-doc-article.md`. **Нюанс**: переключить локаль при открытой модалке нельзя (оверлей перекрывает навигацию) — watch отрабатывает при закрытой, при повторном открытии список уже новой локали. Проверено в playground (Playwright): en → 1 статья/`Documentation`, ru → 8 статей/`Документация`, кросс-ссылки ru работают, картинки `/docs/guide/images/*` грузятся, cookie переживает переключение; intlify-warnings нет. После переноса md чистил кэши — **не удалять корневой `.nuxt`** (его пересоздаёт только `nuxt-module-build prepare`, без него dev-сервер падает 500 на `extends ./.nuxt/tsconfig.json`). vue-tsc / oxlint / stylelint / depcruise / vitest — зелёные                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 9. Финальная верификация   | ✅     | 2026-07-04 | Статика зелёная: vue-tsc / oxlint / stylelint / depcruise / vitest. `npm run build` — locales ru/en, docs/guide ru(8)+en(1), InterVariable+OFL в dist (давний warn module-builder про `dist/types.d.mts` — не наш). Playground-прогон (Playwright, Postgres из docker-compose): матрица {light,dark}×{ru,en} — интерфейс следует теме, канвас/рабочая область светлые в dark, light-reset превью карточек работает; DnD Section+Text, панели свойств (Text и Section: device-табы, группы BACKGROUND/SPACING en/ru), Schema/Settings/PublishView, сохранение в БД («Черновик сохранён»), модалка списка страниц, документация ru: 8 / en: 1, рендер published `/test` не задет. **Найдено и исправлено 3 бага**: (1) inline editing overlay показывал сырой ключ `bricks.blocks.text.props.content.label` — `currentPropLabel` из store не проходил `resolveBricksLabel`, добавлен computed в `BuilderCanvasInlineEditingOverlay.vue`; (2) там же захардкожена «Готово» → новый ключ `bricks.textEditor.done` (словари 458/458, паритет ок); (3) **конфликт-путь ломал модуль**: при явном `@nuxtjs/i18n` в modules потребителя bricks не применял свои дефолты (ветка `!hasNuxtModule`) → голый i18n со стратегией `prefix_except_default` переписывал маршруты → `/builder` 404; фикс в `module.ts` — defu-дефолты применяются всегда (опции потребителя побеждают). Бонус-фикс: warn «hook was not called» перенесён с `modules:done` на `app:resolve` — i18n вызывает `i18n:registerModule` из собственного `modules:done`-хука, чек в `modules:done` срабатывал ложно. Оба сценария (с/без явного i18n) проверены в браузере: переводы регистрируются, warn'ов нет. CLAUDE.md (раздел i18n) обновлён. Окружение, не наши фазы: недоступный webp с `storage.yandexcloud.net`, a11y-warn Reka DialogContent. Published-страница не наследует Inter — это шрифт билдера; шрифты published — ответственность потребителя (как было и с Onest) |

---

## Context

Билдер выглядит устаревшим: полностью светлый интерфейс, шрифт Onest, приглушённый синий `#4d79e9`. Редизайн: яркий акцентный синий, soft UI (мягкие радиусы, слоистые тени), чёткая иерархия. Плюс i18n (ru/en) через `@nuxtjs/i18n` — сейчас всё захардкожено по-русски.

> **⚠️ Ревизия 2026-07-02 (решение пользователя после просмотра реализованной фазы 2):**
> концепция «shell всегда тёмный» **отменена**. Весь интерфейс билдера (тулбар, вертикальная
> навигация, библиотека, панели, модалки, тултипы) — **темозависимый**, переключается тогглом
> светлая/тёмная. **Зона канваса — статична вне зависимости от темы**: страница канваса всегда
> светлая (существующий `.bricks-dark .bricks-canvas`-reset), фон рабочей области вокруг неё —
> инвариантный `--bricks-workspace-bg: #f3f4f6` (`.BricksBuilder` в `[pagename].vue`). Теме
> следуют только кнопки/контролы рабочей области (вьюпорты, зум). В последующих фазах тёмный
> shell НЕ реализовывать.

Решения пользователя: шрифт **Inter**; i18n — **@nuxtjs/i18n**, язык — **по браузеру** (detectBrowserLanguage + cookie) + ручной переключатель; документацию (8 md) **не переводить** — только структура по локали (`ru/` полная, `en/` одна статья-пример; пользователь перепишет сам); панель свойств — **только рестайлинг**, без табов.

Установленные факты (проверены исследованием 2026-07-02):

- Все токены: `src/runtime/assets/scss/shared/_variables.scss` — `:root` (светлая), `.bricks-dark` (тёмная), `.bricks-dark .bricks-canvas` (reset канваса — канвас всегда светлый, **логику не трогать**).
- Тема: cookie `bricks-dark-mode`, toggle и bodyClass в `builder/app/pages/[pagename].vue:109-201`; кнопка — `BuilderShellToolbarVerticalNav.vue`.
- Стили подключаются через `bundle.scss` (module.ts ~197–204) + `plugins/bricks-styles.ts`; vite `additionalData` НЕ используется — компоненты используют чистые CSS-переменные.
- i18n-инфраструктуры нет. Видимые строки: UI-лейблы ~200–280, тосты/ошибки/confirm ~50–70, labels/descriptions в `layouts-blocks/*.definition.ts` (~142, 10 файлов). JSDoc/комментарии НЕ переводим.
- Документация грузится через `import.meta.glob('../docs/guide/**/*.md')` в `useDocumentationArticles.ts` — glob рекурсивный, паттерн менять не нужно.

## Ключевые проектные решения

### 1. ~~Тёмный shell: scope-класс `.bricks-shell`~~ — ❌ ОТМЕНЕНО 2026-07-02

> Реализовано в фазе 2 и **откачено** по решению пользователя (интерфейс должен следовать теме).
> Shell-токены и класс `.bricks-shell` удалены из `_variables.scss`; вместо них остался один
> инвариантный токен `--bricks-dark-surface: #1a1d24` (фон `_darkPreview` в text-editor /
> inline-editing overlay). Исторический дизайн ниже — не реализовывать.

В `src/runtime/assets/scss/shared/_variables.scss` добавляются:

**а) Инвариантные shell-токены в `:root`** (НЕ переопределяются в `.bricks-dark` → тёмные всегда):

```scss
--bricks-shell-bg: #12141a; /* тулбар, вертикальная навигация */
--bricks-shell-bg-deep: #0f1116; /* фон библиотеки компонентов */
--bricks-shell-surface: #1a1d24;
--bricks-shell-surface-hover: #232732;
--bricks-shell-border: #262b34;
--bricks-shell-text: #eceef2;
--bricks-shell-text-muted: #8b93a1;
--bricks-shell-accent: #3b82f6;
--bricks-shell-accent-soft: rgb(59 130 246 / 14%);
```

**б) Класс `.bricks-shell`**, ремапящий generic-токены (`--bricks-base-*`, `--bricks-primary*`, тени) на shell-значения → весь вложенный UI-кит темнеет автоматически, без переписывания компонентов:

```scss
.bricks-shell {
    --bricks-base-0: var(--bricks-shell-bg);
    --bricks-base-50: #171a20;
    --bricks-base-100: var(--bricks-shell-surface);
    --bricks-base-200: var(--bricks-shell-surface-hover);
    --bricks-base-300: var(--bricks-shell-border);
    --bricks-base-400: #39404c;
    --bricks-base-500: var(--bricks-shell-text-muted);
    --bricks-base-600: #a6adbb;
    --bricks-base-800: #d5d9e0;
    --bricks-base-900: var(--bricks-shell-text);
    --bricks-primary: var(--bricks-shell-accent);
    --bricks-primary-50: #1b2436;
    --rgb-base-900: 236 238 242;
    --rgb-base-0: 18 20 26;
    --shadow-sm: 0 0.2rem 0.6rem rgb(0 0 0 / 25%);
    --shadow-md: 0 0.8rem 2.4rem rgb(0 0 0 / 35%);
}
```

Специфичность безопасна: `.bricks-dark` на body, `.bricks-shell` на вложенном элементе → shell побеждает в обеих схемах. `.bricks-canvas` не потомок shell — конфликтов нет.

**Граница shell — 3 корня**: `TheBuilderShellToolbar.vue`, `BuilderShellToolbarVerticalNav.vue`, `BuilderShellSidebarComponentsView.vue` (+ собственный фон `--bricks-shell-bg-deep`, т.к. фон сейчас несёт aside). Панель свойств, PublishView, SchemaTreeView, модалки, канвас — остаются темозависимыми.

**Порталы (Reka teleport в body) выпадают из scope**: тултипам (`BricksTooltipHint.vue`) — фиксированная тёмная палитра во всех контекстах; `BricksActionButton` — новый проп `contentClass`, тулбар передаёт `bricks-shell`; модалки/селекты панели свойств — намеренно темозависимы.

### 2. Новая палитра

| Токен                                                    | Light                                 | Dark                                                                                                             |
| -------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `--bricks-primary`                                       | **#2563eb**                           | **#3b82f6**                                                                                                      |
| `--bricks-primary-600` (новый, hover)                    | #1d4ed8                               | #2563eb                                                                                                          |
| `--bricks-primary-500`                                   | #3b82f6                               | #60a5fa                                                                                                          |
| `--bricks-primary-300/200/100/50`                        | #93c5fd / #bfdbfe / #dbeafe / #eff6ff | #4a6eb3 / #2a3d66 / #1e2d4d / #1c2333                                                                            |
| `--bricks-base-400` (фикс грязного #b9c6cc)              | #9ca3af                               | #3d424e                                                                                                          |
| dark-нейтрали base-0..900                                | без изменений (Tailwind gray)         | холоднее, под shell: #16181d / #1b1e24 / #22252c / #2a2e36 / #333842 / — / #8b93a1 / #aab1bd / #d3d7de / #e8eaef |
| `--rgb-primary` (новый, заменяет `--rgb-indigo` в focus) | 37 99 235                             | 59 130 246                                                                                                       |

Soft UI: радиусы `--border-radius-xs: 0.6rem`, `-sm: 1rem`, `-md: 1.4rem` (кратно 0.2 ✓). Слоистые тени: `--shadow-sm: 0 0.1rem 0.2rem rgb(var(--rgb-base-900) / 5%), 0 0.2rem 0.8rem rgb(var(--rgb-base-900) / 6%)`; `--shadow-md: 0 0.4rem 1.2rem rgb(var(--rgb-base-900) / 8%), 0 1.2rem 3.2rem rgb(var(--rgb-base-900) / 10%)`; `--shadow-focus: 0 0 0 0.4rem rgb(var(--rgb-primary) / 18%)`. Блок `.bricks-dark .bricks-canvas` — обновить только значения primary синхронно, логику не трогать.

### 3. Inter

Один переменный файл `InterVariable.woff2` (~340 КБ, `font-weight: 100 900`, кириллица есть) с релиза github.com/rsms/inter → `src/runtime/assets/fonts/` (+ OFL-лицензия), Onest-\*.woff2 удалить. `fonts.scss` — один `@font-face`:

```scss
@font-face {
    font-family: Inter;
    src: url('../../fonts/InterVariable.woff2') format('woff2-variations');
    font-weight: 100 900;
    font-style: normal;
    font-display: swap;
}
```

`--bricks-font-family-base: 'Inter', system-ui, -apple-system, 'Segoe UI', 'Roboto', sans-serif`. Запасной вариант при проблемах с variable-шрифтом: статические Inter-Regular/Medium/SemiBold/Bold (400/500/600/700).

### 4. @nuxtjs/i18n внутри Nuxt-модуля

Паттерн «модуль-поставщик переводов» (API v10):

- В `src/module.ts` setup(): подписка на хук **`i18n:registerModule`** (register с `langDir: <runtime>/locales`, locales ru/en с `file: 'ru.json'/'en.json'`, `language: 'ru-RU'/'en-US'`) — регистрируется ДО installModule; затем:

```ts
if (!hasNuxtModule('@nuxtjs/i18n')) {
    nuxt.options.i18n = defu(nuxt.options.i18n, {
        strategy: 'no_prefix', // не трогаем роутинг потребителя
        defaultLocale: options.i18n?.defaultLocale ?? 'ru',
        detectBrowserLanguage: {
            useCookie: true,
            cookieKey: 'bricks-locale',
            fallbackLocale: options.i18n?.defaultLocale ?? 'ru',
        },
    });
    await installModule('@nuxtjs/i18n');
}
```

- `IBricksModuleOptions` += `i18n?: { defaultLocale?: 'ru' | 'en' }`.
- package.json: `@nuxtjs/i18n ^10` в `dependencies` (как @nuxt/kit/defu).
- Риск порядка модулей (consumer ставит i18n раньше bricks → хук не сработает): флаг «хук вызван» + `console.warn` в `modules:done` + примечание в README.
- В stores/composables без setup-контекста — `useNuxtApp().$i18n.t(...)`; в компонентах — `useI18n()`.
- `src/runtime/plugins/vee-validate.ts` — русские yup-сообщения (строки 36+) → ключи `bricks.validation.*`, реактивный `setLocale` по watch локали.

### 5. Словари и labels в definitions

`src/runtime/locales/ru.json` + `en.json`, всё под префиксом `bricks.` (проектные сообщения потребителя всегда побеждают):

```
bricks.common.*        — save/cancel/delete/close/loading/notFound...
bricks.toolbar.*       — grid, undo, redo, pagesEditor, media, preview, save, saveDraft, saveCopy
bricks.nav.*           — library, properties, schema, settings, docs, themeLight/Dark, language
bricks.library.*       — addComponent, searchPlaceholder, favorites, empty*, categories.*
bricks.properties.*    — панель свойств, display, device scope, deleteComponent
bricks.publish.*       — форма публикации, validation.*, toasts.*
bricks.media.*         — галерея, resolver, upload
bricks.schema.*        — дерево схемы, import/export
bricks.textEditor.*    — тулбар TipTap (plugins/text-editor-toolbar.ts)
bricks.docs.*          — модалка документации
bricks.validation.*    — vee-validate/yup
bricks.blocks.<block>.* — definitions: name/description, props.<prop>.label|description, options.*, groups.*
```

Definitions (`.definition.ts`) — «ключ-в-данных + резолв на рендере»: `label/description/options[].label/group` заменяются на ключи `bricks.blocks.*` (типы не меняются). Утилита `src/runtime/modules/common/utils/i18nLabels.ts`:

```ts
export function resolveBricksLabel(t: TFn, te: TeFn, raw?: string): string | undefined {
    if (!raw) return raw;
    if (te(raw)) return t(raw);
    if (raw.startsWith('bricks.')) return t(raw); // ключ есть только в fallback-локали (te не смотрит в fallback)
    return raw; // кастомные .brick.ts потребителя — как есть
}
```

Точки резолва — централизованные (не по всем компонентам): `builder/shell/sidebar/composables/usePropertyVariants.ts` (label/description/options/group при сборке варианта), `builder/app/composables/useComponentLibrary.ts` (name/description/category; категории через мапу `bricks.library.categories.*`, сырая строка категории `'Layout'` в данных остаётся — от неё зависит grid-раскладка), `useSidebarBrickDescription.ts` / SchemaTreeItem. `layouts-blocks/registry.ts` и published-рендер от i18n НЕ зависят.

### 6. Переключатель языка

Кнопка `RU ⇄ EN` в `BuilderShellToolbarVerticalNav.vue` рядом с тогглом темы (текстовая метка, тот же стиль; компонент презентационный — emit `toggleLocale` наверх); обработчики в `[pagename].vue` и `publish/pages/index.vue`: `const { locale, setLocale } = useI18n(); setLocale(locale.value === 'ru' ? 'en' : 'ru')` — cookie пишет сам i18n.

### 7. Документация по локали

`git mv` 8 статей → `docs/guide/ru/`, создать `docs/guide/en/01-getting-started.md` (единственная EN-статья-пример; пользователь потом перепишет контент). Картинки в `src/runtime/public/docs/guide/images/` — пути в md не меняются. В `useDocumentationArticles.ts`: фильтр ключей glob по `/guide/${locale}/`, fallback на `ru` если папка локали пуста, скоуп кросс-ссылок в `navigateTo()` по активной локали (иначе `./02-interface.md` заматчит обе локали), `watch(locale)` → сброс активной статьи на первую. `TheBuilderDocumentationModal.vue` — строки UI. Обновить CLAUDE.md (раздел Documentation) и скилл `/add-doc-article`.

## Фазы

### Фаза 0 — подготовка (0.5 дня)

1. Убрать мусорный текст «тз» перед `<script>` в `src/runtime/modules/ui/base/action-button/BricksActionButton.vue:1`.
2. Baseline: `npm run type-check`, `npm run lint:check` — зелёные до старта.

### Фаза 1 — токены и палитра (1 день)

- `_variables.scss`: новые primary, `--bricks-primary-600`, `--rgb-primary`, dark-нейтрали, радиусы, слоистые тени, shell-токены + `.bricks-shell` (см. решения 1–2).
- Заменить хардкод `#212226` и соседние на переменные: `text-editor/components/TextEditorArea.vue`, `TheTextEditorModal.vue`, `builder/canvas/editing/components/BuilderCanvasInlineEditingOverlay.vue`.
- Grep `#4d79e9|#6366f1|--rgb-indigo` по runtime → обновить fallback'и (в т.ч. `default.scss` resize-handles, `BuilderShellToolbarVerticalNav` `rgb(99 102 241 / 8%)`).
- Верификация: dev-сервер, обе темы, канвас остался светлым в dark; `npm run sl:check`.

### Фаза 2 — ~~тёмный shell~~ темозависимый интерфейс (переработана 2026-07-02)

Первоначальная реализация (всегда-тёмный shell) откачена по решению пользователя. Итоговое состояние:

- Тулбар/навигация/библиотека — на generic-токенах (`--bricks-base-*`, `--bricks-primary*`), следуют теме; никаких shell-классов.
- `BuilderShellSidebarComponentCard.vue` — light-reset превью расширен до полного набора токенов (по образцу canvas-reset): превью компонентов всегда светлые, в т.ч. в тёмной теме.
- `BricksTooltipHint.vue` — темозависимый (локальные light-пины удалены; телепорт в body получает `.bricks-dark` каскадом).
- Активные состояния навигации: `--bricks-primary-50` + `--bricks-primary`.
- Мелкие фиксы: hover поиска/карточек (base-400), empty-state библиотеки base-300 → base-500/400, несуществующая `--bricks-base-700` → `--bricks-base-800`.
- Фон рабочей области вокруг канваса — инвариантный `--bricks-workspace-bg: #f3f4f6` (не темнеет в dark).
- Верификация: тоггл темы переключает весь интерфейс; **зона канваса статична в обеих темах** (страница белая, фон рабочей области #f3f4f6); тултипы и dropdown «Сохранить» следуют теме.

### Фаза 3 — рестайлинг UI-кита, soft UI (2–3 дня)

Только `<style module>`, без изменений API:

- `ui/base/button/BricksButton.vue` — primary без видимой рамки, hover `--bricks-primary-600`, мягкая тень; outline/secondary/ghost тоньше; радиусы от токенов.
- `ui/inputs/BricksInput.vue` — **переход с подчёркивания на бокс**: `border: 1px solid var(--bricks-base-300); border-radius: var(--border-radius-xs); padding: 0.8rem 1.2rem; background: var(--bricks-base-0);` focus — рамка primary + `--shadow-focus`; починить битую `var(--primary-indigo-12)` в `.stepButton:hover`; степпер/юнит под новую геометрию.
- Согласованно: `BricksSelect`/`BricksSelectOption`, `BricksHexInput`, `BricksTagsEditor`, `BricksCheckbox`, `BricksSwitch`, `BricksModal` (radius-md + shadow-md), `BricksCloseButton`, `BricksToast`, `BricksConfirmModal`, `BricksTableGridPicker`, `BricksToolbarColorPicker`, `BricksToolbarEditableSelect`, `BricksTextEditorToolbar`.
- Проход по панели свойств (`BuilderShellSidebarPropertiesView.vue`, property-editors/\*) — отступы/радиусы под новые инпуты, табы НЕ делаем.
- Верификация: по каждому файлу `npx vue-tsc --noEmit | grep <file>` + `npx oxlint <file>`; в playground прокликать библиотеку → drop → все property-editors → модалки → text-editor.

### Фаза 4 — Inter (0.5 дня)

- `assets/fonts/InterVariable.woff2` (+ OFL-лицензия), удалить Onest-\*.
- `fonts.scss` — один `@font-face`; `_variables.scss` — `--bricks-font-family-base`.
- Проверить плотные места (вертикальная навигация 1rem, тулбар TipTap) — Inter чуть шире Onest.

### Фаза 5 — инфраструктура i18n (1 день)

- `package.json` — `@nuxtjs/i18n`.
- `src/module.ts` — хук + installModule + `i18n` в `IBricksModuleOptions` + warn (решение 4).
- `src/runtime/locales/ru.json`, `en.json` — скелет неймспейсов + первые ключи (common).
- `src/runtime/modules/common/utils/i18nLabels.ts` — `resolveBricksLabel`.
- `src/runtime/plugins/vee-validate.ts` — ключи `bricks.validation.*`, реактивный `yup.setLocale`.
- Smoke в playground: `useI18n` доступен, cookie `bricks-locale` ставится, детект браузера работает.

### Фаза 6 — извлечение строк, батчами (3–4 дня)

После каждого батча — vue-tsc + oxlint по изменённым файлам, прокликивание зоны:

1. **Shell/toolbar**: `TheBuilderShellToolbar.vue` (tooltips, publishButtonConfig → computed от `t`), `BuilderShellToolbarVerticalNav.vue` (NAV_ITEMS: label → ключ, `t()` в шаблоне).
2. **Shell/sidebar** (~15 файлов): ComponentsView, PropertiesView, PublishView (+SocialImage, SchemaActions), SchemaTree*, NavigationEditor, property-editors/*, composables (usePublishValidationSchema, useSchemaFileTransfer, useSidebarPropertiesPanel — device scope).
3. **App** (~12 файлов): `[pagename].vue` (confirm, toasts), useBuilderPage, useBuilderSession, useModals, TheBuilderLoader — `useNuxtApp().$i18n.t` вне setup-контекста.
4. **Publish + media** (~12 файлов): publish/stores/publish.ts (ошибки/валидация), publish pages+components, media components + stores.
5. **Text-editor + ui**: `plugins/text-editor-toolbar.ts`, TheTextEditorModal, inline-editing overlay; ui/ aria-labels («Увеличить/Уменьшить» в BricksInput, «Поле» в validate name).
6. **Definitions** (10 файлов `layouts-blocks/components/*.definition.ts`): label/description/options/group → ключи `bricks.blocks.*`; ru.json 1:1, en.json перевод; подключить `resolveBricksLabel` в usePropertyVariants, useComponentLibrary, useSidebarBrickDescription.

Правило типобезопасности: строки заменяются только в значениях, сигнатуры/типы не меняются.

### Фаза 7 — переключатель языка (0.5 дня)

- `BuilderShellToolbarVerticalNav.vue` — кнопка RU/EN + emit; `[pagename].vue` и `publish/pages/index.vue` — обработчики `setLocale`.
- Проверить: мгновенное переключение UI, cookie переживает reload, детект браузера — только без cookie.

### Фаза 8 — документация по локали (0.5 дня)

- `git mv` 8 статей → `docs/guide/ru/`; новая `docs/guide/en/01-getting-started.md`.
- `useDocumentationArticles.ts` — фильтр + fallback + скоуп ссылок + watch locale (решение 7).
- `TheBuilderDocumentationModal.vue` — строки UI.
- CLAUDE.md + скилл `add-doc-article` — новая структура.

### Фаза 9 — финальная верификация (0.5–1 день)

1. `npm run type-check`; `npm run lint:check` (oxlint + stylelint + dependency-cruiser); `npm run test`.
2. Playground `npm run dev`: матрица {light, dark} × {ru, en} — весь интерфейс следует теме; **канвас всегда светлый**; все property-editors, модалки, text-editor; документация ru: 8 / en: 1; публикация и рендер `/:pagename` не задеты.
3. Конфликт-путь: временно добавить `@nuxtjs/i18n` в playground modules — модуль не ломается.
4. `npm run build` — locales/\*.json и docs/guide/\*\* в dist.
5. После переноса md — glob-кэш Vite: `rm -rf .nuxt node_modules/.vite`.

## Риски

| Риск                                                                   | Митигация                                                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Порядок модулей: consumer ставит i18n раньше bricks → хук не сработает | warn в `modules:done` + README                                                                       |
| ~~Порталы выпадают из `.bricks-shell`~~                                | неактуально после ревизии 2026-07-02: порталы в body получают `.bricks-dark` каскадом и следуют теме |
| `te()` не видит fallback-локаль → сырые ключи                          | эвристика `startsWith('bricks.')` в resolveBricksLabel                                               |
| Бокс-инпуты меняют высоту строк панели свойств                         | визуальный проход по всем редакторам в фазе 3                                                        |
| Строки в Pinia actions без setup-контекста                             | `useNuxtApp().$i18n.t`                                                                               |
| dist теряет .json/.md                                                  | проверка артефакта в фазе 9; при необходимости правка build.config.ts                                |
| glob-кэш Vite после переноса md                                        | `rm -rf .nuxt node_modules/.vite`                                                                    |

Оценка: ~10–13 рабочих дней. Критичные файлы: `_variables.scss`, `module.ts`, `BuilderShellToolbarVerticalNav.vue`, `usePropertyVariants.ts`, `useDocumentationArticles.ts`.
