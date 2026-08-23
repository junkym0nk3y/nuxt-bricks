# П3 — мёртвый код и недостижимые ветки

Пропы, ветки, классы, поля и типы, у которых нет потребителя. Снимаются без
изменения поведения — но пока стоят, читаются как действующий контракт и стоят
времени каждому следующему читателю. Индекс — [README.md](README.md).

Порядок — от самых «контрактных» (публичный API кита, типы схемы) к локальным
осколкам.

**Закрыл пункт — удали его из этого файла** и перенумеруй остальные: список
сокращается, а не помечается галочками. Отметка «сделано» превращает файл в
журнал, а журнал никто не перечитывает — история правки и так лежит в git.

---

## 1. Контракт тулбара: пять пропов и одно событие, которых никто не читает

**Файл:** `builder/shell/toolbar/components/types.d.ts:8,10,11,22,24,44`

`IToolbarProps` объявляет `isEditingExistingPage`, `hasSelectedComponent`,
`isPublishSettingsComplete`, `sidebarOffset` и `isPublished`; ни один из пяти в
`TheBuilderShellToolbar.vue` не читается (грепом `props.<имя>` — ноль вхождений).
Четыре из пяти при этом честно передаются композиционным корнем
(`builder/app/pages/[pagename].vue:511-516`), то есть корень считает и прокидывает
значения, которые никуда не идут: `isEditingExistingPage` и
`isPublishSettingsComplete` — вычисляемые. `isPublished` не передаётся вовсе.

Там же `IToolbarEmits.clear` — событие, которого тулбар не эмитит и которое никто
не слушает (грепом по `src/runtime/modules/builder` `emit('clear'` находится только
в галерейных компонентах публикации, у них своё событие).

---

## 2. Четыре цветовых класса и два пропа `BricksButton` недостижимы

**Файл:** `src/runtime/modules/ui/base/button/BricksButton.vue` (`._red`,
`._green`, `._yellow`, `._grey`, `._round`, `._fill`)

`TBricksButtonVariant` — `primary | secondary | ghost | quiet | danger`, поэтому
четыре цветовых класса (27 строк) выбрать нечем. Пропы `round` и `fill` типом
разрешены, но ни один вызывающий в `src/runtime/modules` их не передаёт — их классы
тоже мертвы на практике.

---

## 3. Три мёртвых пропа и один no-op у `BricksTooltip`

**Файлы:** `src/runtime/modules/ui/base/tooltip/BricksTooltip.vue`,
`base/tooltip/types.d.ts`

`attach` (`'#bricks-app'`), `offsetY` и `offsetX` (по 12) объявлены с дефолтами и
не читаются: позиционирование делает `TooltipPortal` с `side-offset="nudge"`, а
стартовый сдвиг задан в CSS константами `0.4rem`.

Проп `bottom` — no-op: `side` возвращает `'bottom'` и без него, при этом восемь
вызовов его передают (работает как документация намерения, а не как переключатель).
Снимая, решить заодно, что делать с восемью вызовами.

---

## 4. Мёртвый CSS и обойдённый API у `BricksSelectOption`

**Файл:** `src/runtime/modules/ui/inputs/BricksSelectOption.vue:97-108`

Классы `.itemWrapper` и `.itemHead` в `<style module>` есть, в шаблоне их нет.

Сверх того: единственный вызывающий — `BricksActionButton` — передаёт только
`spec`, пустой `value` и класс, а пропы `disabled`, `isHighlighted` и событие
`click` не использует вовсе. Компонент описан как обобщённая опция селекта, а живёт
как строка одного меню.

---

## 5. Проп `size` у `BricksCloseButton` мёртв

**Файлы:** `src/runtime/modules/ui/base/modal/types.d.ts`
(`IBricksCloseButtonProps`), `BricksCloseButton.vue` (`withDefaults`)

Проп объявлен и получает дефолт `'sm'`, но не читается ни в шаблоне, ни в стилях, и
ни один из семи инстансов компонента его не передаёт. Кандидат на удаление вместе с
полем типа.

---

## 6. Проп `label` у `TextEditorArea` принимается и теряется

**Файлы:** `text-editor/components/types.d.ts` (`ITextEditorAreaProps`),
`text-editor/components/TextEditorArea.vue` (`withDefaults`, класс `.label` в
`<style>`)

`label` объявлен в контракте пропсов и получает дефолт `''`, но в разметке не
используется ни разу; класс `.label` в секции стилей тоже не навешивается ни на
что.

Проп при этом реально приходит: `normalizeVariantProps` кладёт `label` в
нормализованные пропсы, а `BuilderShellSidebarPropertyEditorRow` раздаёт их
редактору через `v-bind` — то есть панель свойств передаёт подпись и молча её
теряет. Подпись при этом рисует сама строка панели
(`<span v-if="shouldShowLabel">`), так что видимого дефекта нет, а есть два
осколка: проп без применения и правило CSS без владельца.

---

## 7. `BuilderLogo`: мёртвый проп `external` и мёртвая ветка текста

**Файл:** `builder/core/components/BuilderLogo.vue:32,40,204,358`

`external?: boolean` объявлен и получает дефолт, но не читается ни в шаблоне, ни в
скрипте, и ни один из трёх потребителей его не передаёт.

Проп `text` формально жив, но непустым его не передаёт никто (лоадер и тулбар не
передают вовсе, дашборд пишет `text=""`), поэтому ветка `v-if="props.text"` и
правило `.text` в стилях сейчас недостижимы. **Если `text` сохранять как публичный
API компонента, `v-html` на нём обязан проходить через `common/utils/sanitize/`** —
правило репозитория требует этого для любого HTML, а сейчас значение уходит в
`v-html` как есть.

---

## 8. `isInteractive`: поле схемы, которое теряется на части путей вставки и не читается вовсе

**Файлы:** `builder/app/composables/useDraggableComponent.ts:211`,
`builder/canvas/viewport/composables/useCanvasDrops.ts:298-314`, `:362-376`,
`common/types/brick.ts:100,115`

Вставка в корень сохраняет `isInteractive` из карточки библиотеки, вставка в layout
и в слот — нет (обе строят `componentData` по-своему). При этом само поле
`IBricksComponent.isInteractive` не читается ни в билдере, ни в рендере:
интерактивный предпросмотр включается через `interactivePreviewId` независимо от
него, а источник значения — определение блока
(`layouts-blocks/registry.ts:105`, `blockAccordion.definition.ts:51`).

**Решать заодно** с «Сборка `componentData` из перетаскиваемой карточки написана
трижды» в [П4](p4-duplication.md): одна фабрика payload плюс решение, подключать
поле к поведению или убрать из схемы.

---

## 9. Ветка `figmaDropPerViewport` недостижима

**Файл:** `builder/canvas/viewport/components/BuilderCanvasViewport.vue:178-198`

`canvasStore.figmaDropPerViewport` инициализируется `false`
(`builder/core/stores/canvas.ts:58`) и больше не записывается нигде в репозитории:
поле объявлено в типе (`common/types/brick.ts:158`), читается ровно в одном месте —
этой ветке, — и потому one-hot видимость по листу сейчас не срабатывает никогда.

Второе, помимо мёртвого флага: даже при включённом флаге видимость сужается только
у компонента с новым id, а перенос существующего блока проходит через тот же
`handleCanvasDrop` и сохраняет прежнюю видимость.

---

## 10. Отладочный блок панели свойств уезжает в прод

**Файл:** `builder/shell/sidebar/components/BuilderShellSidebarPropertiesView.vue:187-191,305-315`

Ветка `v-if="!store.selectedComponentData"` печатает `No component selected` и два
сырых дампа стора (`selectedComponent`, `selectedComponentData`) в блоке с классом
`.debug`. Гейта по `import.meta.dev` нет, тексты не через i18n, стиль — серая
плашка на `base-300`.

В живой панели блок не всплывает только потому, что панель монтируется по
выбранному компоненту, но это свойство внешнего условия, а не самой ветки.

---

## 11. `showGroupLabel` и `.groupLabel` мертвы в строке редактора

**Файлы:** `builder/shell/sidebar/types/sidebarProperties.d.ts:75`,
`sidebar/components/BuilderShellSidebarPropertyEditorRow.vue:22,193-199`,
`sidebar/components/BuilderShellSidebarPropertyEditors.vue:391,445`

Проп объявлен, дефолтится в `false`, дважды передаётся родителем — и ровно с тем же
`false`; в шаблоне строки он не читается ни разу. Класс `.groupLabel` в том же файле
тоже не используется: подпись группы рисует родитель своим `.groupToggle`.

---

## 12. `._bool` — мёртвый класс CSS-модуля

**Файл:** `builder/shell/sidebar/components/BuilderShellSidebarPropertyEditors.vue:504-508`

Правило живёт в модуле `BuilderShellSidebarPropertyEditors`, а `$style._bool`
навешивает `BuilderShellSidebarPropertyEditorRow` — у него свой модуль и своё
правило `._bool`. Класс из родителя не попадает в разметку ни разу.

---

## 13. Модификатор `._last` дерева схемы ничего не меняет — вместе с ним мёртв и проп

**Файл:** `builder/shell/sidebar/components/BuilderShellSidebarSchemaTreeItem.vue:24,163,337-339`

`.verticalLine` задаёт `height: calc(50% + 0.4rem)`, и `&._last` задаёт ровно ту же
величину. Единственный потребитель пропа `isLast` — этот класс, значит и проп, и его
вычисление `index === childComponents.length - 1` у обоих мест вызова не влияют ни
на что.

Похоже на недоделанный «обрыв линии у последнего ребёнка»: у последнего элемента
вертикаль должна была кончаться на середине строки, а не тянуться дальше. То есть
выбор — доделать или снять.

---

## 14. Мёртвое поле `segmentIndex` в payload медиа-выбора

**Файл:** `builder/shell/sidebar/types/sidebarProperties.d.ts:16-21`

`TInlineGalleryPayload.segmentIndex` не пишется и не читается нигде в `src`: живые
производители payload передают только `insertIndex` и `itemIndex`
(`BuilderShellSidebarPropertyImageGalleryEditor.vue:84,186`). Одноимённое поле в
`builder/media/types/schemaImageResolver.d.ts:28` — другой тип и другая механика.

---

## 15. `hasGroups` не читается ни разу

**Файл:** `builder/shell/sidebar/components/BuilderShellSidebarPropertyEditors.vue:133`

`const hasGroups = computed(() => groupedEditorItems.value.groups.size > 0)` —
единственное вхождение символа во всём `src`. Шаблон обходит
`groupedEditorItems.groups` напрямую.

---

## 16. `navigationMeta` не читает никто: дубль `toMeta()`

**Файл:** `builder/core/stores/navigation.ts:38`

Стор навигации отдаёт наружу и computed `navigationMeta`, и функцию `toMeta()` —
обе собирают `INavigationMeta` из тех же `items`. Потребитель ровно один и берёт
`toMeta()` (`stores/actions/schema.ts:28`); грепом по `src/`, `test/` и `e2e/`
других обращений к `navigationMeta` нет.

Отличие между ними неслучайное: `toMeta()` копирует записи
(`items.map((item) => ({ ...item }))`), а computed отдаёт живой массив состояния, то
есть попадание его в схему дало бы схему, разделяющую ссылки со стором. **Удалять
надо computed, а не функцию.**

---

## 17. Мёртвый `canvasWrapperRef`

**Файл:** `builder/canvas/viewport/components/TheBuilderCanvas.vue:113`, `:375`

`ref` объявлен и привязан в шаблоне, но не читается ни в скрипте, ни в composables
области: обёртке нужен только `:style`. Элемент при этом уже участвует в измерениях
через `canvasContainer`.

---

## 18. Мёртвый параметр `canvasEl` у `handleDrop`

**Файл:** `builder/app/composables/useDraggableComponent.ts`

`handleDrop(event, canvasEl, store, options)` не обращается к `canvasEl` ни разу —
параметр существует только в сигнатуре и в `@param`. Единственный вызывающий
(`canvas/viewport/composables/useCanvasDrops.ts`) исправно передаёт
`canvasRef.value`.

---

## 19. Четыре `typeof store.X === 'function'` над типизированным Pinia-стором

**Файл:** `builder/app/composables/useDraggableComponent.ts`

`moveExistingComponentToRoot` и `addNewComponentToCanvas` четырежды проверяют
наличие методов у `store: TBricksComponentsStore` (`moveComponentToRoot`,
`saveToHistory`). Тип — `ReturnType<typeof useComponentsStore>`, оба метода
объявлены в `componentActions` и существуют всегда.

Вместе с проверками мертва и ветка `else if (component.parent)` с ручным
`removeChildFromLayout` — до неё не дойти.

---

## 20. `moveComponentToRoot` уже очищает grid-позиционирование

**Файл:** `builder/app/composables/useDraggableComponent.ts`

После `store.moveComponentToRoot(...)` композабл ещё раз ставит
`component.gridColumn = undefined; component.gridRow = undefined`. Сам экшен
(`core/stores/actions/crud.ts`) делает это на две строки после входа. Повтор имел бы
смысл только на fallback-ветке с ручным `removeChildFromLayout` — а она недостижима
(пункт выше).

---

## 21. Мёртвый кламп по `width, height` в `resolveCropFrame`

**Файл:** `builder/auth/utils/avatarCropFrame.ts:91`

`const side = Math.min(Math.floor(shortestSide / Math.max(zoom, 1)), width, height)`.
Масштаб зажат снизу единицей, поэтому
`shortestSide / max(zoom, 1) <= shortestSide = min(width, height)`, и после
`Math.floor` результат не может превысить ни `width`, ни `height`. Две последние
подрезки не связывают никогда — при `zoom = NaN` тоже (`NaN` проходит `Math.min`
насквозь).

---

## 22. Ключи у ветвей `Transition` объявлены обязательными, хотя переход идёт и без них

**Файл:** `builder/auth/components/TheBuilderAuthProfileModal.vue:277,286`

Ветки — два **разных компонента**, у них разный `type` vnode, поэтому
`isSameVNodeType` ложно и без ключей. Проверено снятием: с удалёнными `key` смена
вкладки в живом билдере отыграла полный цикл
(`bricks-view-switch-leave-from` → `leave-active` → `leave-to` на форме профиля,
`enter-active` → `enter-to` на форме пароля).

Утверждение о необходимости ключей верно для одинаковых элементов (`<div v-if>` /
`<div v-else>`), но здесь ключи ничего не держат.

---

## 23. Ключ 429 в разборе отказов раздела учёток недостижим

**Файл:** `builder/users/utils/userErrors.ts:31-35`

`USER_ACTION_STATUS_KEYS` разбирает 404, 429 и 503. Ключ 429
(`bricks.users.errors.tooManyRequests`, живёт в обеих локалях) недостижим ни одной
из четырёх операций, которые зовут `resolveUserActionErrorKey`:
`POST /api/bricks/users`, `PATCH /api/bricks/users/:id`,
`DELETE /api/bricks/users/:id` и `POST /api/bricks/users/:id/password`.

Разбор: единственные источники 429 в проекте — `assertWithinRateLimit`
(`server/utils/requestRateLimiter.ts:146`, подключён только к `users/me/password`,
`users/me/avatar`, `media/upload`, `media/s3-page-thumbnail`), лимит попыток входа
(`api/bricks/auth/login.post.ts:118,129`) и брутфорс-локаут Basic Auth
(`server/middleware/auth.ts:132`). Последний живёт в ветке Basic-режима, а раздел
учёток существует только в режиме `database` (`isUserManagementAvailable` — 404 вне
него), то есть пути от него к этим ручкам нет. Ни один спек 429 в разделе не
ассертит.

**Чинить:** либо снять ключ вместе со строками локалей, либо, если 429 у
административных ручек нужен, добавить им лимитер.

---

## 24. Мёртвая цепочка из трёх звеньев в домене документации

**Файлы:** `builder/documentation/composables/useDocumentationArticles.ts:149-151,265`
(`activeArticleIndex`), `:99,268` (`isMarkdownLoading`),
`builder/documentation/composables/useMarkdownRenderer.ts:14,45-46,76` (`isLoading`)

`useDocumentationArticles` возвращает `activeArticleIndex` и `isMarkdownLoading`.
Единственный потребитель композабла — `TheBuilderDocumentationModal` —
деструктурирует шесть других полей и эти два не берёт; грепом по `src/` и `test/`
других обращений нет.

За `isMarkdownLoading` тянется третье звено: ради него `useMarkdownRenderer` держит
модуль-глобальный `ref` и переключает его в `ensureLoaded`, то есть флаг ставится и
снимается для читателя, которого нет. `knip` этого не видит: экспорт-то один
(`useDocumentationArticles`), мёртвыми оказались поля возвращаемого объекта.

Стоимости у мёртвого `computed` нет: Vue-шные `computed` ленивы, `.value` у
`activeArticleIndex` никто не читает, поэтому он не вычисляется ни разу. Находка про
мёртвый API, а не про лишние пересчёты.

---

## 25. Мёртвый фолбэк-цвет в модалке документации

**Файл:** `builder/documentation/components/TheBuilderDocumentationModal.vue:192`

`background-color: var(--bricks-primary-50, rgb(37 99 235 / 8%))` — единственное
место в `src/`, где у этого токена задан фолбэк. Токен определён в обеих темах
(`assets/scss/shared/_variables.scss:49` — `#eff6ff`, `:173` — `#1c2333`, `:222` —
светлый вариант для forced-colors), то есть до фолбэка исполнение не доходит
никогда. Проверено вживую: у активного пункта навигации модалки `background-color`
считается в `rgb(28, 35, 51)` — ровно значение токена в тёмной теме.

Вторая половина: сам фолбэк — прибитый светлый синий, и в тёмной теме он был бы
неверен, то есть страховка, которая при срабатывании сломала бы тему. Остальные
одиннадцать вхождений `--bricks-primary-50` в `src/` написаны без фолбэка.

---

## 26. Мёртвый экспорт типа `TTemplateContent`

**Файл:** `builder/templates/types/templates.d.ts:223-229`

Тип объявлен с шапкой на три строки («полный шаблон, прочитанный point-lookup'ом»)
и не используется нигде: грепом по `src/` и `test/` единственное вхождение — само
объявление.

Настоящий потребитель point-lookup'а — `TheBuilderPublishCreatePageModal.vue`, и он
берёт `IBricksTemplateRow` из `common/types/templates` напрямую, а
`fetchTemplateRequest` объявляет возвращаемый тип тем же `IBricksTemplateRow`. То
есть алиас не участвует даже в том сценарии, ради которого назван.

---

## 27. Поколение отправки в формах шаблонов: недостижимая страховка

**Файлы:** `builder/templates/composables/useTemplateSaveForm.ts:60-65`,
`useTemplateRenameForm.ts:59`, `components/TheBuilderTemplatesSaveModal.vue:91-93`

Ни один из трёх путей закрытия модалки во время запроса не работает:

- `handleClose` в обеих модалках возвращается сразу при `isSubmitting`;
- крестик выключен (`BricksModalHeader :close-disabled="isSubmitting"`), Cancel
  выключен (`:disabled="isSubmitting"`);
- Esc и клик по оверлею у `BricksModal` не закрывают окно сами: `DialogRoot`
  полностью контролируемый (`:open="props.isOpen"`), а `onUpdateOpen` только эмитит
  `close` — то есть приходит в тот же заблокированный `handleClose`.

Хозяйских путей закрытия тоже нет: `isModalOpen` у `useBuilderTemplateSave` гасят
ровно два места — `close()` (по эмиту модалки) и `handleSaved` (после ответа ручки),
то же на дашборде.

Значит, `resetForm` под летящим запросом не вызывается никогда, и три проверки
`generation !== submissionGeneration.value` недостижимы. **Аргумент против снятия:**
страховка стоит три строки и держит корректность, если закрытие во время запроса
когда-нибудь разрешат. Решение владельца.

---

## 28. `.catch()` у восстановительного прогона недостижим

**Файл:** `src/runtime/modules/render/composables/useRendererDataSources.ts`
(`recoverPartialRun`)

`refreshDataSources().catch((error) => console.warn('[Bricks DataSources] Partial run recovery failed:', error))`
не сработает никогда. В установленном Nuxt 3.21.8 `useAsyncData` ловит ошибку
внутри себя: `asyncData.execute` заканчивается
`.catch((error) => { asyncData.error.value = createError(error); asyncData.data.value = unref(options.default()); asyncData.status.value = 'error'; })`
(`node_modules/nuxt/dist/app/composables/asyncData.js:409-422`) и **не**
пробрасывает её дальше, а `.finally` возвращаемое значение не меняет.

Промис резолвится всегда; предупреждение в лог не попадёт, отказ восстановления
виден только по `dataSourceAsyncData.error`.

---

## 29. Финальная 404-ветка middleware недостижима

**Файл:** `src/runtime/middleware/bricks-page-layout.global.ts:286-292`

`else if (!isPreview && !page)` при текущем control flow не срабатывает никогда:
live-путь либо возвращает ошибку из `catch`, либо присваивает
`page = normalizePublishedPage(response)`, а `normalizePublishedPage`
(`common/utils/bricks/publishedPage.ts:98-117`) всегда возвращает объект; превью без
строки страницы выходит раньше.

Комментарий уже называет ветку недостижимой; снятие — правка кода.

---

## 30. Хеш манифеста считается на каждый скан и не имеет ни одного читателя

**Файлы:** `src/bricks-manifest.ts:82-109`,
`src/runtime/modules/common/types/brickManifest.d.ts:41`

`computeManifestHash` читает содержимое всех brick-файлов и считает по ним SHA-256;
поле `hash` уезжает в `manifest.json` и в состояние библиотеки на клиенте.
Единственное упоминание поля в рантайме — `EMPTY_MANIFEST` в
`server/utils/bricksComponents.ts:9`, то есть заглушка.

Оба комментария (здесь и в `useComponentLibrary.ts`) это честно признают, и решение
оставить задел законное. Записано, чтобы решение было видимым: пока читателя нет,
каждый скан платит за хеш, а контракт манифеста несёт поле, которое никто не читает.

---

## 31. Experimental-флаги включаются под макрос, которым в репозитории никто не пользуется

**Файл:** `src/module.ts:150-154`

Модуль принудительно включает потребителю `experimental.appManifest` и
`experimental.inlineRouteRules`, а метка региона называет причину:
`defineRouteRules` и `appManifest`. `defineRouteRules` и `routeRules` не
встречаются в `src/` ни разу (единственное упоминание в репозитории — комментарий
`playground/nuxt.config.ts:15` о том, что playground их не использует). То есть
`inlineRouteRules` включается ради макроса, которого нет.

Проверять и снимать надо по отдельности: `appManifest` может быть нужен другим
механикам.

---

## 32. Шесть CSS-переменных не имеют ни одного потребителя

**Файл:** `src/runtime/assets/scss/shared/_variables.scss:53, 70, 76-79, 177, 226`

Ни одного `var(--…)` во всём `src/` и `playground/` нет у:

- `--bricks-primary-700` — объявлена трижды (светлая тема, тёмная тема,
  canvas-reset). Последний след использования — комментарий
  `ui/inputs/BricksTagsEditor.vue:6`, где пара `primary-100` + `primary-700` названа
  **отброшенной** по контрасту, то есть переменная пережила собственный редизайн;
- `--bricks-rgb-gray`;
- `--bricks-rgb-layout-flex`, `--bricks-rgb-layout-grid`,
  `--bricks-rgb-layout-slider`, `--bricks-rgb-layout-section` — весь блок «Layout
  indicator colors». Динамической сборки имени (`--bricks-rgb-layout-#{type}`) в
  коде тоже нет: поиск по подстроке `rgb-layout` даёт только сами объявления.

Цена невелика, но блок из четырёх переменных читается как действующий контракт
индикаторов раскладки, которого нет.

---

## 33. Проброс `csrftoken` → `X-CSRFToken` — наследство родословной проекта

**Файл:** `src/runtime/modules/common/composables/useApiClient.ts:101-105`

Проброс не описан ни в `docs/external-backend-contract.md`, ни в одном тесте
(`grep X-CSRFToken test/` — ноль), у bricks-API свой заголовок `x-bricks-csrf`, а
`csrftoken` в тестах встречается только как посторонняя cookie, которую фильтры
**пробрасывают**.

Кандидат на удаление — решение владельца: если у кого-то из потребителей внешний
backend действительно ждёт этот заголовок, проброс живой, и тогда его надо описать в
контракте внешнего backend.
