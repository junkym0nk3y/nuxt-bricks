# П5 — правила проекта и стиль

Код работает верно, но расходится с правилами, которые проект сам себе записал в
`.claude/rules/*`. Цена — не в поведении, а в стоимости поддержки: правило,
нарушаемое в десяти местах, перестаёт работать как правило. Индекс —
[README.md](README.md).

Разделы: [Типы вне `types/`](#типы-вне-types) ·
[Контракты композаблов](#контракты-композаблов) · [Стили](#стили) ·
[Размер файлов](#размер-файлов) · [Магические числа и нейминг](#магические-числа-и-нейминг) ·
[Орфография](#орфография) · [Границы доменов](#границы-доменов)

**Закрыл пункт — удали его из этого файла** и перенумеруй остальные: список
сокращается, а не помечается галочками. Отметка «сделано» превращает файл в
журнал, а журнал никто не перечитывает — история правки и так лежит в git.

---

# Типы вне `types/`

`.claude/rules/typescript.md` требует объявлять интерфейсы и type-алиасы **только**
в файлах типов — «независимо от того, экспортируются они или нужны лишь здесь».
Причина не в стиле: тип, объявленный внутри модуля, невозможно переиспользовать, не
переписав его рядом, а две копии расходятся молча.

Сторож `test/module/typeLocations.spec.ts` эти места не видит: он проверяет
`src/*.ts` и композаблы рантайм-доменов, а SFC и `utils/` — нет (об этом сказано в
самом правиле).

## 1. Интерфейсы пропсов и эмитов объявлены внутри девяти SFC

**Файлы:** `builder/shell/toolbar/components/BuilderShellToolbarVerticalNav.vue:31,39`,
`sidebar/components/BuilderShellSidebarPropertiesView.vue:33`,
`sidebar/components/TheBuilderShellSidebarPropertiesPanel.vue:18`,
`sidebar/components/BuilderShellSidebarSchemaTreeItem.vue:21,36`,
`sidebar/components/BuilderShellSidebarSchemaTreeView.vue:30`,
`sidebar/components/BuilderShellSidebarPublishView.vue:60`,
`property-editors/BuilderShellSidebarPropertyMediaPicker.vue:19,33`,
`property-editors/BuilderShellSidebarPropertyAccordionItemsEditor.vue:16,21`,
`property-editors/BuilderShellSidebarPropertySpacingEditorSide.vue:14`

В области такие файлы типов есть и наполовину используются (`sidebar/types/`,
`sidebar/components/types.d.ts`, `toolbar/components/types.d.ts`).

Отдельно: `IEmits` в `BuilderShellSidebarPropertySpacingEditorSide.vue` нарушает и
правило нейминга — имя не называет сущность.

## 2. Интерфейсы пропсов объявлены внутри двух SFC канваса

**Файлы:** `builder/canvas/item/components/BuilderCanvasItemLayout.vue:24-37`,
`viewport/components/BuilderCanvasConditionalContainer.vue:6-9`

У домена такой файл есть и уже содержит соседей (`canvas/types/components.d.ts`:
`ICanvasItemComponentProps`, `ICanvasViewportProps`,
`ICanvasDropPlaceholderProps`), так что оба объявления — исключения без причины.

## 3. Инлайновые формы `defineProps`/`defineEmits` — домен публикации единственный такой

**Файлы:** `builder/publish/components/BuilderPublishDeviceRow.vue` (пропы и эмиты),
`BuilderPublishDeviceIconPopover.vue` (пропы и эмиты),
`BuilderPublishDeviceRanges.vue` (пропы) — три SFC, пять инлайновых форм; отдельно
`interface INavSection` внутри `BuilderPublishDashboardNav.vue`

Проверено грепом: в доменах `users`, `templates` и `media` таких мест **ноль** — там
все пропы и эмиты приходят типами из `types/`. У самого редактора устройств
правильный прецедент лежит рядом: `IPublishDeviceAddMenuProps`/`Emits` в
`types/devices.d.ts` описывают соседний компонент той же модалки.

Под букву `typescript.md` (запрет объявлять интерфейсы и type-алиасы вне файлов
типов) подпадает только `INavSection` — инлайновый объект в `defineProps` формально
не объявление, и `vue-best-practices.md` сам показывает такие примеры. То есть
нарушение правила здесь одно, а остальные четыре места — расхождение с доменным
стилем и с каноническим примером `vue-sfc.md`.

## 4. Интерфейс запроса объявлен в `utils/`, а не в `types/` (шаблоны)

**Файл:** `builder/templates/utils/templatesApi.ts:37-43`
(`ICreateTemplateRequestBody`)

Тело запроса создания шаблона объявлено прямо в утилите транспорта, хотя у домена
есть `types/templates.d.ts`, где лежат остальные его контракты — включая
`ITemplatesListResponse`, ответ той же ручки, объявленный «как надо» и импортируемый
в этот же файл строкой выше.

## 5. `IVersionRestoreStoreDeps` объявлен в `utils/`, а не в `types/`

**Файл:** `builder/publish/utils/pageVersionRestore.ts:17`

Узкий контракт стора для отката версии объявлен прямо в утилите, тогда как три его
брата того же назначения — `IPagesLoadStoreDeps`, `IPageLibraryWriteStoreDeps`,
`ICurrentPageWriteStoreDeps` — лежат в `types/publishStore.d.ts`. Тот же класс, что
пункт выше; здесь острее, потому что рядом в одном домене лежат три правильных
прецедента.

---

# Контракты композаблов

`.claude/rules/vue-best-practices.md` требует типизировать возвращаемые значения.

## 6. Четыре композабла сайдбара без явного типа возврата

**Файлы:** `builder/shell/sidebar/composables/usePublishValidationSchema.ts:24`,
`useSidebarMediaSelection.ts:25`, `useSidebarResponsiveScope.ts:22`,
`useSidebarPropertiesPanel.ts:42`

Половина композаблов области это делает через `types/composables.d.ts`
(`IUseSpacingEditorReturn`, `IUseSidebarPublishFormReturn`, `IComponentCardDrag`,
`IUsePropertyVariantsReturn`). У этих четырёх тип выводится, и
`useSidebarPropertiesPanel` возвращает при этом двадцать четыре ключа, включая сам
стор.

## 7. У двух композаблов домена шаблонов нет объявленного типа возврата

**Файлы:** `builder/templates/composables/useTemplateSaveForm.ts:34`,
`useTemplateRenameForm.ts:34`

Три остальных композабла домена возвращают объявленный контракт
(`IUseTemplatesDataReturn`, `IUseTemplatesListReturn`, `IUseTemplateActionsReturn`),
у двух форм тип вывелся сам. Практический эффект в том, что `errors` и поля
`defineField` приезжают наружу типами vee-validate, и контракт форм читается только
по реализации.

Смотреть вместе с «Формы сохранения и переименования шаблона — копия друг друга» в
[П4](p4-duplication.md): общий тип возврата — то место, где дубль виден раньше
всего.

## 8. `IPublishFormInitialValues` не описывает два поля, которые composable отдаёт

**Файлы:** `builder/shell/sidebar/types/composables.d.ts:67-72`,
`sidebar/composables/useSidebarPublishForm.ts:40-47`

Тип перечисляет четыре поля (`pagename`, `title`, `description`, `keywords`), а
`initialValues` возвращает шесть — плюс `urlPrefix` и `subdomain`. Комментарий прямо
над кодом объясняет, что без routing-полей yup видел бы `urlPrefix` пустым и
проверка адреса не работала бы, то есть эти два поля не случайны.

Присваивание проходит по ковариантности `ComputedRef`, так что компилятор молчит, а
читатель типа получает неполный контракт.

## 9. `IUsePublishTemplateSurfaceOptions` — чужой регион и единственное число

**Файл:** `builder/publish/types/composables.d.ts:383-388`

Тип опций `usePublishTemplatesSurface` лежит внутри блока
`// #region usePublishSchemaImport` (открыт строкой 365, закрыт 439) — между двумя
типами импорта схемы. Плюс имя в единственном числе (`Template`) против плюрального
имени самого композабла (`Templates`), тогда как возвращаемые типы соседей по домену
имя композабла повторяют дословно.

---

# Стили

## 10. Корневой CSS-класс не совпадает с именем компонента

**Файлы:** `src/runtime/modules/ui/base/button/BricksButton.vue` (`.button`),
`base/tooltip/BricksTooltipHint.vue` (`.tooltipHint`)

`.claude/rules/naming.md` требует корневой класс, совпадающий с именем компонента
(PascalCase). Оба файла его нарушают. `BricksSearchInput` под правило не попадает —
у него корень чужой компонент, а такие wrapper'ы правило прямо исключает.

## 11. Форс светлой темы вне списка легализованных исключений

**Файлы:** `builder/canvas/editing/components/BuilderCanvasInlineEditingOverlay.vue:435-447`
(`.fallbackEditorWrapper`),
`builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertyMediaPicker.vue:139-140`,
`builder/media/components/BuilderMediaImageResolverItem.vue:177-181`,
`components/TheBuilderMediaImageResolverModal.vue:199-203`

`.claude/rules/styles.md` перечисляет узлы с осознанным hex-переопределением
(`--bricks-base-0: #fff` и т. п.) **поимённо**: `TextEditorArea` (`.editor`,
`.fallbackArea`) и `TheTextEditorModal` (`.editor`). Здесь ещё четыре таких узла, и в
списке их нет.

Пин при этом работает — проверено в живом DOM: при `bricks-dark` на body фон превью
медиа-пикера остаётся `rgb(249, 250, 251)`, тогда как тулбар уходит в
`rgb(40, 38, 42)`. У медиа-пикера переопределений два, у каждого селекта резолвера —
три.

Причина переопределения нигде не записана: комментарии говорят «фиксируем светлую
тему», то есть что, а не зачем.

**Решать владельцу:** либо дополнить список правила этими узлами с причиной, либо
снять форс. Пока не решено, правило `styles.md` описывает не то, что в коде.

Рядом в `.fallbackEditorWrapper` две мелочи того же блока: `background` и
`background-color` заданы одним и тем же значением подряд (второе объявление
лишнее), а `color: initial` вместо переменной темы читается как случайный сброс —
при том, что фон здесь намеренно белый и текст обязан быть тёмным.

Селекты резолвера — ещё и дубль кита, см. «Нативный `<select>` вместо
кит-компонента» в [П4](p4-duplication.md).

## 12. Два мелких отступления в стилях сайдбара

**Файлы:** `builder/shell/sidebar/components/BuilderShellSidebarNavigationEditor.vue:182`,
`sidebar/components/BuilderShellSidebarSchemaTreeItem.vue:259`

`border-radius: 1rem` у счётчика навигации — пилюля числом, тогда как правило
требует `var(--bricks-border-radius-pill)`.

У выделенной строки дерева
`background-color: var(--bricks-primary-100, var(--bricks-base-200))` — fallback
никогда не срабатывает: `--bricks-primary-100` объявлена во всех трёх темах
(`assets/scss/shared/_variables.scss:50,174,223`), и запасное значение только
маскирует, какой токен на самом деле в силе.

## 13. Стили документации билдера лежат в глобальной таблице `default.scss`

**Файл:** `src/runtime/assets/scss/default.scss:214-336`

`.bricks-docs` — 120 строк типографики HTML-контента справки — стоит в
`default.scss`, который модуль пушит в `nuxt.options.css` всегда. Потребитель у
класса ровно один: `builder/documentation/components/TheBuilderDocumentationModal.vue:129`,
причём он уже навешивает рядом собственный модульный класс
(`[$style.markdown, 'bricks-docs']`), то есть дом в домене у этих стилей есть.

В render-only деплое (`features.builder: false`) билдер не собирается, а его
справочная типографика всё равно уезжает в CSS страницы.

---

# Размер файлов

## 14. `BlockGrid.vue` вышел за потолок размера SFC

**Файл:** `layouts-blocks/components/BlockGrid.vue` (510 строк)

`.claude/rules/vue-best-practices.md` держит потолок 300–500 строк, `oxlint`
настроен на `max-lines: 500` (SFC он не читает, поэтому молчит).

**Естественный шов:** drop-логика грида (ёмкость, `resolvePlaceholderCell`,
измерение треков) в композабл рядом с `useLayoutDropZone`.

Заодно в `#region Computed` этого файла лежат две константы
(`DEFAULT_GRID_MIN_HEIGHT`, `EMPTY_ROW_MIN_HEIGHT`) и функция
`buildGridTemplateRows` — порядок региона из `.claude/rules/vue-sfc.md` этого не
предполагает.

## 15. Два файла редактора стоят вплотную к потолку `oxlint max-lines`

**Файлы:** `builder/app/composables/useBuilderSession.ts`,
`builder/app/pages/[pagename].vue`

Оба занимают 499 и 500 строк при потолке 500. Запаса не осталось: следующая же
правка любого из них потребует либо резать текст, либо делить файл.

Про `[pagename].vue` это ожидаемо — composition root, — а `useBuilderSession.ts`
держит пять поверхностей сразу (bootstrap, таймаут, фиксация снапшота, переход на
копию, два watcher'а) и просится на разделение.

---

# Магические числа и нейминг

## 16. Потолок истории и длительность переключения viewport — литералы без имени

**Файлы:** `builder/core/utils/history.ts:21`, `builder/core/stores/canvas.ts:197`,
`:227`

`clampHistory(history, historyIndex, limit = 50)` — единственный вызов
(`stores/history.ts:43`) третьего аргумента не передаёт, поэтому потолок в 50
снимков существует только как значение по умолчанию, а не как названная константа.

В сторе канваса `setTimeout(..., 400)` повторён дважды (`setViewport`,
`toggleFigmaMode`) и совпадает числом с `CANVAS_HEIGHT_BUFFER = 400`, который значит
совсем другое (буфер высоты в px) — такое совпадение приглашает «починить» одно через
другое.

## 17. Ожидание 450 мс без имени и без связи с источником задержки

**Файл:** `builder/shell/sidebar/components/BuilderShellSidebarSchemaTreeView.vue:145-150`

Ждут завершения анимации переключения viewport, но анимации длительностью 450 мс в
проекте нет: переход листа канваса — `transform 250ms ease`
(`TheBuilderCanvas.vue:496`), общий токен — `--bricks-default-transition: 300ms ease`.
Число голое: константы у него нет, и связь с источником задержки не выражена ничем.

Смежное: те же 400 мс литералом в сторе канваса — пункт выше. Обе задержки ждут
одного и того же перехода, и величины у них разные.

## 18. `previewPagename` держит адрес, а не имя

**Файл:** `builder/app/composables/useBuilderPage.ts` (`handlePreview`)

`previewCurrentPage` возвращает `IBricksPageAddress | null`, и `startPreviewSync`
ждёт адрес — имя переменной обещает `pagename`. Тем более путает, что весь домен как
раз и разводит «имя» и «адрес» (одноимённые страницы под разными префиксами —
разные).

---

# Орфография

House-style репозитория — американская орфография (`.claude/rules/comments.md`).
Комментарии выправлены; ниже осталось то, что является кодом, а не комментарием, и
потому правится отдельно.

## 19. Идентификатор `normalised` в `ui`

**Файл:** `src/runtime/modules/ui/inputs/composables/useBricksInput.ts:245-248`

Локальная переменная `normalised` стоит при функции `normalizeIncomingValue`
рядом. Переименование — правка кода.

## 20. `cancelled` против `canceled` в сообщении ошибки

**Файл:** `persistence/server/utils/storageErrors.ts:148`

По репозиторию `canceled` встречается в тринадцати файлах, `cancelled` — в одном, и
это сообщение ошибки `'Query was cancelled by the server statement timeout'`; в том
же файле рядом стоят три `canceled`. Парный `console.error` в `handlerHelpers.ts`
уже пишет `canceled`, то есть одинаковый по смыслу текст в двух местах написан
по-разному.

Сообщение задаётся через `super()` в классе-наследнике `Error` — это строковый
литерал, а не комментарий.

## 21. `towards` против `toward`

**Файл:** `src/runtime/modules/ui/base/badge/types.d.ts`

House-style — американское `toward` (пять вхождений в `ui`, `persistence`,
`builder/canvas`, `builder/users`); единственное британское `towards` осталось
здесь.

---

# Границы доменов

## 22. Tech-debt-исключение для `useInlineEditor` в `.dependency-cruiser.cjs` устарело

**Файл:** `.dependency-cruiser.cjs` (`text-editor-deps` — `pathNot` на строке 60,
плюс правило `text-editor-tech-debt-scope` целиком, строки 65+)

Конфиг выводит `text-editor/composables/useInlineEditor.ts` из-под правила
`text-editor-deps` с пометкой про tech debt и отдельным правилом разрешает ему
`builder/core/stores`. Долг закрыт: файл не импортирует ничего из `builder` вовсе —
состояние билдера приходит через `inject` по ключу `INLINE_EDITOR_HOST_KEY` из
`common`, то есть DI, которого правило и ждало. Проверено прогоном
`npx depcruise src/runtime/modules/text-editor/composables/useInlineEditor.ts`: в
зависимостях только `common` и `text-editor`.

То есть исключение сейчас не отражает код и **держит границу открытой**: возврат
импорта `builder/core/stores` в этот файл `deps:check` не заметит.

**Чинить:** снять `pathNot` и удалить правило `text-editor-tech-debt-scope`.

## 23. Тип `IInlineEditableProp` ре-экспортируется через util вместо импорта у владельца

**Файл:** `builder/core/utils/inlineEditableProp.ts:15`

Тип объявлен в `common/types/inlineEditing.d.ts` и оттуда же импортируется в
`text-editor/stores/inlineEditing.ts`. Единственный потребитель ре-экспорта —
`builder/canvas/editing/composables/useCanvasItemInlineEditing.ts:24`, который берёт
тип из util одним оператором вместе с функциями.

Развязка лишняя: `common` доступен canvas напрямую, и после её снятия у типа
остаётся одно место объявления и одно место импорта.

## 24. Порог поиска пикера лежит в `common`, хотя нужен одному builder-компоненту

**Файл:** `common/constants/templates.ts:27-32`
(`TEMPLATE_PICKER_SEARCH_THRESHOLD`), потребитель —
`builder/templates/components/BuilderTemplatesPickerList.vue`

Файл объявлен как «единый источник для клиентской валидации, серверной валидации DTO
и счётчиков символов в полях формы» — порог показа поиска не относится ни к одному
из трёх. Сервер о нём не знает, потребитель один, и лежит он в нижнем слое, куда
смотрят все.

Прецедент решает спор в пользу переноса: у ТОЙ ЖЕ механики в тулбаре
(`SEARCH_VISIBLE_FROM_PAGES = 7`) константа объявлена рядом с потребителем, в
`builder/shell/toolbar/composables/`, и с тем же по смыслу комментарием.

Само значение порога — отдельный вопрос, см. «Порог поиска в пикере шаблонов не
согласован с потолком его высоты» в [П2](p2-defects.md).

## 25. Стили документации в глобальной таблице

См. пункт «Стили документации билдера лежат в глобальной таблице `default.scss`»
выше — это одновременно и нарушение границ домена: билдерский класс живёт в таблице,
которую модуль пушит всем, включая render-only деплой.

---

## 26. Статья документации уходит в `v-html` мимо `sanitize`

**Файлы:** `builder/documentation/components/TheBuilderDocumentationModal.vue:126`,
источник HTML — `builder/documentation/composables/useMarkdownRenderer.ts:41`
(`markdown-it` с `html: true`)

Правило `AGENTS.md` («любой недоверенный HTML/SVG перед `v-html` или `innerHTML`
пропускать через `common/utils/sanitize/`») сформулировано безусловно, а здесь
`v-html` получает результат `markdown-it`, включённого с `html: true`, то есть сырая
разметка из `.md` проходит насквозь. Недоверенного источника сегодня нет: статьи
приезжают build-time глобом `import.meta.glob('../docs/guide/**/*.md')` из самого
пакета.

**Решение владельца: прогонять через `sanitize`,** а не оставлять заметку с причиной.

**Дословно применить `sanitizeRichTextHtml` нельзя — он срежет все таблицы.** В его
allowlist (`common/utils/sanitize/sanitizeRichText.ts:42-80`) нет ни `table`, ни
`thead`/`tbody`/`tr`/`th`/`td`, а в статьях 167 строк markdown-таблиц (например
`builder/documentation/docs/guide/ru/06-adaptive.md:9`). Расширять сам allowlist — значит расширить его и
для четырёх остальных потребителей (`BlockText.vue:63`, `BlockAccordion.vue:47-48`,
`BuilderCanvasItemComponent.vue:49`), то есть разрешить таблицы в контенте
published-страниц. Это отдельное решение, поэтому чинить нужно вторым профилем
allowlist для документации, а не правкой общего.

**Проверка обязательна прогоном по всем девяти статьям** (восемь русских и одна
английская): сравнить разметку до и после, потому что срез разметки санитайзером
молчаливый — ошибки не будет, просто пропадёт кусок статьи. Сегодня сырого HTML в статьях нет вовсе (проверено грепом по
тегам), так что расхождение может дать только сам allowlist.
