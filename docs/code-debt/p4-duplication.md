# П4 — дубли и упрощения

Один и тот же код в двух-трёх местах, лишние вычисления. Поведение верное;
цена — в поддержке: правка одной копии оставляет остальные с прежним поведением,
и расходятся они молча. Индекс — [README.md](README.md).

Разделы: [Дубли кода](#дубли-кода) · [Упрощения](#упрощения)

**Закрыл пункт — удали его из этого файла** и перенумеруй остальные: список
сокращается, а не помечается галочками. Отметка «сделано» превращает файл в
журнал, а журнал никто не перечитывает — история правки и так лежит в git.

---

# Дубли кода

## 1. `buildGridTemplateRows` — две функции с одним именем и разным поведением

**Файлы:** `layouts-blocks/components/BlockGrid.vue`,
`components/blockGrid.definition.ts`

Обе строят `grid-template-rows` из `rows`/`rowHeight`/`minRowHeight`, обе начинают
с ветки `minRowHeight > 0` и `minmax(...)`. Расходятся ровно в одном: канвасная
версия добавляет пол высоты незанятым строкам (`EMPTY_ROW_MIN_HEIGHT`), чтобы
объявленная структура была видна, published-версия — нет. Различие намеренное и
объяснено в комментарии, но одинаковое имя в двух файлах одного каталога
приглашает поправить одну копию и не заметить вторую.

Рядом та же история с меньшим радиусом: `FLEX_JUSTIFY_CSS`/`FLEX_ALIGN_CSS` в
`blockFlex.definition.ts` против `justifyMap`/`alignMap` в `BlockFlex.vue` — две
пары одинаковых таблиц; `normalizeSpacingSize` в `blockSpace.definition.ts` против
`normalizeSize` в `BlockSpace.vue` — одна и та же нормализация, различающаяся
конвертацией `px`.

**Сливать в одну функцию с флагом режима нельзя:** это свяжет канвас-
визуализацию с published-рендером, и правка вида канваса начнёт менять CSS
опубликованной страницы. Чинится переименованием по назначению; общей может стать
только минимальная высота или узкая чистая часть расчёта.

---

## 2. Минимальная высота грида — именованная константа против литерала

**Файлы:** `layouts-blocks/components/BlockGrid.vue`
(`DEFAULT_GRID_MIN_HEIGHT`), `components/blockGrid.definition.ts:139`,
`components/BlockSection.vue:68`

`10rem` — одно и то же решение о минимальной высоте контейнера, записанное трижды:
именованной константой на канвасе Grid, литералом в его published-рендере и
литералом в `BlockSection`. Правило проекта требует выносить «магические» значения в
константы; здесь константа есть, но две другие точки её не видят.

**Константу держать в `layouts-blocks`, не поднимать в `common`:** это решение о
виде блока, а не общий контракт пакета.

---

## 3. `resizableImage` и `resizableVideo` — два почти дословных файла

**Файлы:** `text-editor/tiptap/resizableImage.ts`,
`text-editor/tiptap/resizableVideo.ts`

Совпадения проверены сравнением текста, а не на глаз:

- `extractStyledDimension` и `applyCustomDimension` — дословно одинаковые функции в
  обоих файлах (различается только длина JSDoc);
- `FLOAT_CLASSES` и `VALIGN_CLASSES` — одинаковые константы;
- тело плагина `floatSync` совпадает посимвольно после замены имени типа узла
  (`image` против `video`) — расходятся только комментарии;
- тело `appendTransaction` плагина очистки `customWidth`/`customHeight` совпадает
  после той же замены полностью, включая комментарии.

**Кандидат:** общий модуль в `text-editor/utils/` для двух функций и фабрика
плагинов, принимающая имя типа узла. Сейчас исправление дефекта в одном файле нужно
помнить продублировать во второй.

**Целиком объединять расширения нельзя.** Общими становятся только атрибуты
float/vertical-align/размера, хелперы измерения и фабрики sync-плагинов,
принимающие имя типа узла — с РАЗНЫМИ `PluginKey`. NodeView картинки и видео
остаются раздельными.

---

## 4. `debouncedSaveToHistory` объявлен дважды, с двумя независимыми таймерами

**Файлы:** `builder/core/stores/actions/properties.ts:12`,
`stores/actions/schema.ts:15`

Оба файла создают свой `useDebounceFn((store) => store.saveToHistory(), 300)`. Это
не только дубль кода: таймеры разные, поэтому правка свойства и правка `htmlId`,
сделанные подряд внутри одного окна в 300 мс, дадут две записи истории вместо
одной, а порог 300 живёт двумя литералами в двух файлах.

**Один модульный синглтон на замену двум — хуже нынешнего дубля:** он смешает
разные инстансы Pinia и разные SSR-запросы, то есть один рендер начнёт отменять
таймер другого. Планировщик должен принадлежать стору
(`WeakMap<IComponentsStore, …>` либо поле стора).

---

## 5. Приведение строки к числу продублировано в двух экшенах

**Файл:** `builder/core/stores/actions/properties.ts:42-52`, `:149-159`

`updateComponentProp` и `updateComponentResponsiveProp` содержат один и тот же
одиннадцатистрочный блок: `trim`, пустая строка в `''`, регексп
`/^-?\d+(\.\d+)?$/`, проверка `Number.isNaN`. Разойтись копии могут молча — правка
регекспа в одной ветке оставит другую с прежним поведением, а различаются они только
тем, куда потом ложится значение (в `props` или в `props.responsive[device]`).

---

## 6. Снятие `responsive` записано двумя способами в одном домене

**Файлы:** `builder/core/stores/actions/properties.ts:110-120` против
`builder/core/utils/deviceKeyCleanup.ts:20-34`

`updateComponentIdentityProps` собирает `props` со спредом `...currentProps`
(который тащит прежний `responsive`), условно дописывает новый и затем отдельным
`delete` убирает ключ, если он оказался пустым. `cleanComponent` ту же задачу решает
без `delete`: деструктуризацией
`const { responsive: _dropped, ...withoutResponsive } = props`. Второй вариант
короче и не мутирует уже присвоенный объект; сейчас в области живут оба.

---

## 7. Замер высоты по контенту и пара watch-ей продублированы кодом

**Файлы:** `builder/canvas/viewport/composables/useCanvasContainerMetrics.ts:26-37`,
`:65-69` и `viewport/components/BuilderCanvasViewport.vue:135-158`, `:187-191`

Приём «снять `minHeight`, прочитать `scrollHeight`, вернуть `minHeight`» написан
дважды, и дважды написана пара watch-ей на состав компонентов; в компоненте вдобавок
свой `ResizeObserver` с собственным `onMounted`/`onBeforeUnmount`. Различие между
копиями одно: composable кладёт результат в стор
(`syncCanvasHeightWithContent`), а компонент — в локальный `viewportHeight` с
буфером `CANVAS_HEIGHT_BUFFER`.

**Кандидат:** общий composable с параметром «куда писать результат». Дубль рационала
в комментариях — прямое следствие дубля кода.

**Один универсальный composable измерения делать не надо:** у обычного канваса и
у листов Figma-режима разные высотные политики и разный жизненный цикл
наблюдателей. Общей стоит делать чистую DOM-операцию измерения, а watcher — только
если он окупится после этого.

---

## 8. Редакторы аккордеона и галереи повторяют один и тот же список операций

**Файлы:** `builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertyAccordionItemsEditor.vue:49-146`,
`property-editors/BuilderShellSidebarPropertyImageGalleryEditor.vue:69-186`

`cloneItems`, `updateItems`, `handleRemoveItem`, `handleMoveUp`, `handleMoveDown` и
`handleTitleChange` написаны в двух файлах посимвольно одинаково, с точностью до
типа элемента; различаются только `handleAddItem` против `handleAddImage` и набор
полей.

**Кандидат:** composable «редактируемый список объектов» на дженерике.

**Чего общий composable знать не должен:** формы конкретного элемента и UI. Ему
принадлежат только clone/update/remove/move/updateField. Входной массив не
мутировать — поедут стабильные ключи и фокус.

---

## 9. `clampToPropertyRange` дублирует `clampValue`

**Файлы:** `builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertyGridSizeEditor.vue:168-181`,
`sidebar/composables/useSpacingEditor.ts:61-71`

Обе функции берут `min`/`max` из `variant.property` и прижимают к ним число.
Отличие одно: spacing-версия дополнительно округляет до одной десятой. Рядом в
`useSpacingEditor` то же округление `Math.round(x * 10) / 10` написано трижды
(`formatSpacingValue`, `toNumberValue`, `clampValue`).

**Округление spacing в общий clamp не переносить:** grid-редактору оно не нужно,
а перенос сделает шаг сетки дробным.

---

## 10. Три watcher-а превью карточки с одинаковым телом

**Файл:** `builder/shell/sidebar/composables/useComponentCardPreview.ts:295-316`

Три подряд идущих `watch` — на загрузку async-компонента, на
`props.component.defaultProps` и на `props.isLayout` — содержат буквально одно и то
же: `await nextTick(); updatePreviewScale();`. Сводится к одному `watch` по массиву
источников.

---

## 11. Высота превью продублирована из CSS константами

**Файлы:** `builder/shell/sidebar/composables/useComponentCardPreview.ts:45-49`,
`sidebar/components/BuilderShellSidebarComponentCard.vue:285`

`PREVIEW_HEIGHT_REM = 18` и `LAYOUT_PREVIEW_HEIGHT_REM = 12` объявлены в композабле
с честной припиской «из CSS»; в самом CSS высота миниатюры задана как
`height: 18rem`. Расчёт масштаба и вёрстка разъедутся молча — превью просто
перестанет вписываться.

**Третью общую константу не заводить:** высоту брать из `clientHeight` обёртки
превью, тогда обе JS-константы уходят. Ветка layout-высоты при этом мёртвая —
layout-карточка до измерения не доходит.

---

## 12. `formatUserDate` — вторая копия `formatPageDate`, запрещённая шапкой владельца

**Файлы:** `builder/users/utils/userFormatting.ts:26-47`, владелец —
`common/utils/bricks/dates.ts:1-34`

`formatUserDate` повторяет `formatPageDate` полем в поле: тот же формат
`DD.MM.YYYY`, то же локальное время, тот же прочерк на пустом и битом значении.
Отличие только в том, что дату разбирает локальный `toValidDate` (он же нужен
`formatUserLoginDate`), а год не выносится в переменную.

Копия не безобидна: шапка `common/utils/bricks/dates.ts` прямо объясняет, почему
функция живёт в `common`, — «вторая копия функции уехала бы от первой на первой же
правке формата». То есть запрет на эту копию записан у владельца, и она его
нарушает.

**Чинить:** вызывать `formatPageDate` из `common` (домен `builder/users` от `common`
зависит законно, `common` — нижний слой).

---

## 13. Задержка поиска втроена по трём доменам, а рационал — у копий

**Файлы:** `builder/users/composables/useUsersList.ts:14-15`,
`builder/templates/composables/useTemplatesList.ts:14-15`,
`builder/publish/composables/usePublishDashboard.ts:17`

`SEARCH_DEBOUNCE_MS = 300` объявлен трижды. Владелец по смыслу — список страниц, но
именно у него комментария нет вовсе, а обе копии ссылаются на него («та же, что в
списке страниц», «та же, что в списках страниц и учёток»).

Значение одно на все поверхности поиска дашборда и просится в `common/constants`;
сейчас правка задержки требует трёх правок, а расхождение молча обесценит две
ссылки.

**Место — `builder/core/constants`, а не `common`:** это UX билдера, а не общий
контракт пакета. Не сводить с порогом показа поиска у пикера шаблонов: тот нужен
одному компоненту и переезжает к нему (см. П5).

---

## 14. Список ролей продублирован в двух компонентах

**Файлы:** `builder/users/components/BuilderUsersRolePill.vue:64-69`,
`builder/users/components/TheBuilderUsersCreateModal.vue:71-72`, владелец набора —
`common/constants/auth.ts` (`BRICKS_ROLE_RANK`)

`ROLE_ORDER: TBricksUserRole[] = ['admin', 'editor', 'viewer']` объявлен дважды.
Сервер же принимает роли по ключам `BRICKS_ROLE_RANK` (`requireRole` сверяется
именно с ним, и там же записано, почему без отдельного списка ролей). Новая роль
станет валидной на сервере и молча потеряется в одном или обоих местах интерфейса.

Порядок «от широких прав к узким» — своё решение домена, но он выводится из самого
ранга.

---

## 15. Категорийные табы медиатеки — копия `BricksTabBarItem`, потому что киту не хватает слота действия

**Файлы:** `builder/media/components/BuilderMediaGalleryCategoryTabs.vue`,
владелец вида — `ui/base/tabs/BricksTabBarItem.vue` (вариант `underline`, размер `sm`)

Копия значение за значением: бокс `3.2rem`, паддинг `0 1.2rem`, кегль `1.2rem`/500,
`line-height` 1.2, подпись `base-500`, ховер `base-900`, активное состояние `primary` и
та же полоса `0.2rem` через `scaleX` с `transform-origin: left center`. Это не похожие
блоки — блок `:after` совпадает построчно.

**Копия уже расходилась:** гэп между подписью и счётчиком был `0.4rem` против `0.8rem`
у кита, счётчик — `base-400` против `base-500`. Оба значения приведены к киту, но
защиты от следующего расхождения нет — она появится только когда останется одна
реализация.

**Почему нельзя просто взять компонент кита.** Мешает крестик удаления категории:
вложить кнопку внутрь `ToggleGroupItem` нельзя (кнопка внутри кнопки), а положить её
отдельным item нельзя потому, что любой item группы меняет фильтр — клик по крестику
переключал бы категорию. Поэтому в медиатеке каждый таб обёрнут своим `div.tab`,
который несёт подчёркивание (иначе у таба с крестиком полоса обрывалась бы под
подписью) и читает выбранное состояние через `:has(.label[data-state='on'])`.

**Чинить:** научить дорожку кита слоту действия у элемента — обёртка вокруг
`BricksTabBarItem` внутри `ToggleGroupRoot`, подчёркивание переезжает на обёртку, слот
вида `#item-action="{ item }"` рендерится рядом с элементом. После этого
`BuilderMediaGalleryCategoryTabs` собирается на `BricksTabBar`, и от него остаётся
только передача крестика в слот.

**Радиус поражения.** Обёртка меняет структуру прямых детей `ToggleGroupRoot`, а на ней
держится геометрия варианта `segmented`: пилюля сидит внутри дорожки с паддингом, гэпы
`0.2rem` у `ghost` и `0.8rem` у `outline`/`underline`, режим `block` растягивает
элементы через `flex: 1`. Мест вызова пять — `TheBuilderAuthProfileModal`,
`BuilderShellSidebarPropertiesView`, `BuilderCanvasBottomBar`,
`BuilderPublishPagesList`, `BuilderUsersList`, — и в двух из них дорожка иконочная
(`icon-only`), где ширина элемента фиксирована.

Сложность средняя: правка в ките с проверкой всех пяти дорожек в обеих темах плюс
`test/ui/bricksTabBar.spec.ts`. **Различающий тест** — таб с действием: полоса
активного состояния обязана идти под подписью **и** под действием, а клик по действию
не должен менять выбранный таб.

Побочно закрывается расхождение макета с кодом: в Figma эти табы уже стоят инстансами
сета `Tab` (Underline/SM), то есть макет описывает кит, а код — копию.

**Удаление категории внутрь кита не переносить:** киту принадлежит слот действия,
медиатеке — то, что в него кладётся.

---

## 16. Приведение `$i18n as Composer` повторяется в пяти файлах рантайма

**Файлы:** `plugins/builder/veeValidateSetup.ts`,
`plugins/builder/textEditorToolbarSetup.ts`,
`builder/publish/composables/usePublishPreview.ts`,
`builder/publish/stores/publish.ts`, `builder/publish/utils/formValidation.ts`

Общий хелпер — `common/utils/globalI18n.ts` (`translateBricksKey`): он появился там, где
два стора медиатеки держали байт-в-байт одинаковую функцию перевода вместе с JSDoc, и оба
на него переведены. Параметры интерполяции он теперь принимает, то есть препятствия,
записанного здесь прежде, больше нет.

Оставшиеся места приводят `useNuxtApp().$i18n` к `Composer` сами. Три из них
(`usePublishPreview`, `publish`, `formValidation`) держат буквально тело хелпера —
`return i18n ? i18n.t(key) : key` — и переводятся механически. Плагины сложнее: они уже
держат `nuxtApp` под рукой, и вызов, который резолвит приложение заново, им не выигрыш.

**Два плагина оставить как есть.** У них `nuxtApp` уже под рукой, и замена на
хелпер, который резолвит приложение заново, ухудшает причинность ради формального
устранения двух коротких функций. Механически переводятся ровно три места.

---

## 17. Модалка галереи и раздел дашборда дублируют фильтрацию и счётчики

**Файлы:** `builder/media/components/TheBuilderMediaGalleryModal.vue:104-195`,
`components/TheBuilderMediaSection.vue:106-152`

Два контроллера содержат почти дословно одинаковые `categoryCounts` (reduce по
`items` с пропуском файлов без категории), `filteredMediaItems` (категория, затем
поиск по имени, alt и подписи категории), проводку `useMediaCategoryActions` с тем же
порядком объявления и `handleCategoryDeleted`. Различие только в источнике фильтра и
запроса: в модалке это локальные `ref`, в разделе — пропы.

**Кандидат:** `useMediaGallerySurface(source)` снял бы копию целиком.

**Жизненный цикл модалки общему composable не отдавать:** иначе сброс при
закрытии модалки начнёт влиять на раздел дашборда. Общими становятся счётчики,
фильтрация и проводка действий.

---

## 18. Мета-панель модалки и панель деталей раздела дублируют работу с категорией

**Файлы:** `builder/media/components/BuilderMediaGalleryMetaPanel.vue:88-131`,
`components/BuilderMediaSectionDetailsPanel.vue:90-171`

Совпадают `categoryOptions` (с «Без категории» первым вариантом и пустой строкой как
контрактом `BricksSelect`), `categoryFacets`, `selectedCategory`, `isAltDisabled` и
`handleCategoryChange` вместе с правилом «пустая строка — это `null`, а не пустой
slug».

Черновики полей у этой пары уже вынесены в общий `useMediaMetaDrafts` — выбор
категории просится туда же или в соседний композабл.

**В `useMediaMetaDrafts` категорию класть нельзя:** имя файла и alt — черновики с
отложенным подтверждением, а категория — немедленный controlled-select. Механика
разная, нужен свой узкий контроллер.

---

## 19. Нативный `<select>` вместо кит-компонента в резолвере изображений

**Файлы:** `builder/media/components/BuilderMediaImageResolverItem.vue:95-103,177-181`,
`components/TheBuilderMediaImageResolverModal.vue:114-123,199-203`

Обе поверхности резолвера изображений собраны на нативном `<select>`, хотя в ките
есть `BricksSelect` — и он же используется соседями по домену
(`BuilderMediaGalleryMetaPanel`, `BuilderMediaSectionDetailsPanel`) ровно для того же
выбора из двух-трёх значений. Из-за этого у каждого селекта свои `padding`,
`border`, `font-size` и свой `:disabled`, которых у кита не пришлось бы писать
вовсе.

Второе следствие — блок форса светлой темы у каждого из двух селектов; он же
отдельным пунктом в [П5](p5-conventions.md), «Форс светлой темы вне списка
легализованных исключений».

---

## 20. Формы сохранения и переименования шаблона — копия друг друга

**Файлы:** `builder/templates/composables/useTemplateSaveForm.ts` (171 строка),
`useTemplateRenameForm.ts` (146 строк)

Нормализовав в двух файлах только слова `save`/`rename`, `diff` показывает
расхождение ровно в трёх местах кода: вызов ручки с телом запроса
(`createTemplateRequest` против `updateTemplateRequest`), два начальных значения в
`resetForm` (предложенные источником против текущих полей шаблона) и ключ текста при
обрыве по потолку ожидания (`saveOutcomeUnknown` против `renameOutcomeUnknown`).

Всё остальное — установка `useForm` с общей схемой, пара `defineField`, три `ref`
состояния, лестница разбора отказов
(занятое имя → обрыв ожидания → generic), `finally` и возвращаемый объект —
совпадает построчно. Это около девяноста строк.

Смежный пункт: общий тип возврата у этих же двух композаблов — то место, где дубль
виден раньше всего (см. [П5](p5-conventions.md)).

**Поколение отправки в общий контроллер не возвращать:** оно снято осознанно.
Разная семантика отправки (POST против PATCH) выражается параметрами, а не общим
телом.

---

## 21. Мета-строка шаблона собирается дважды

**Файлы:** `builder/templates/components/BuilderTemplatesCard.vue:70-75`
(`metaLine`), `BuilderTemplatesPickerList.vue:84-89` (`buildMetaLine`)

Обе функции склеивают одно и то же одинаково:
`t('bricks.templates.card.blocks')` и `formatPageDate(createdAt)` через `·`. Ключ
перевода в списке выбора взят из карточки (`templates.card.blocks`) — то есть
общность уже осознана, вынесена только не была.

Место для общего кода в домене есть: `templates/utils/templateSummary.ts` уже
собирает сводку из строки шаблона.

**`templateSummary` не должен стать скрытым потребителем i18n:** переводчик
передаётся аргументом, иначе чистая утилита сводки начнёт зависеть от того, поднят
ли композер.

---

## 22. Исход `window.open` проверяет одна функция из трёх

**Файлы:** `builder/publish/composables/usePublishPreview.ts`
(`previewCurrentPage` против `previewPageVersion`), `usePublishPageActions.ts`
(`previewPage`)

`previewPageVersion` возвращает `null`, если вкладка не открылась, и прямо
объясняет зачем: «блокировщик попапов возвращает null — без проверки отказ был бы
тихим». Соседняя `previewCurrentPage` того же файла зовёт `window.open` и возвращает
адрес, ничего не проверив, — то есть вызывающий получает «превью открыто» на
заблокированном попапе. `previewPage` в `usePublishPageActions` не проверяет тоже.

Аргумент про блокировщик одинаково применим ко всем трём; отличается только то, кто
его записал.

**Место — домен публикации, `common` тут не нужен.** Общая функция возвращает
факт «окно открылось», а каждый из трёх вызывающих сам решает, что показать: тост,
общую ошибку или `null`.

---

## 23. `DARK_MODE_COOKIE` против литерала в редакторе

**Файлы:** `builder/publish/composables/usePublishDashboardPreferences.ts`
(константа), `builder/app/pages/[pagename].vue` (литерал `'bricks-dark-mode'`)

Имя cookie темы вынесено в константу на дашборде и записано литералом в редакторе.
Дублируется не только имя: `maxAge` в редакторе записан тем же выражением
`60 * 60 * 24 * 365`, что и `DARK_MODE_COOKIE_MAX_AGE`.

При этом сам комментарий у константы прямо говорит, что cookie **общая с
редактором**, — а обе константы модуль-приватные, то есть редактору
переиспользовать их нечем. Владельцем должна стать общая константа, а не одна из
двух копий.

**Место — настройки `builder/core`, а не `common`:** cookie принадлежит билдеру,
published-поверхность о ней не знает.

---

## 24. `getMediaByUrl` в HTTP-адаптере — O(N) на горячем пути прокси

**Файлы:** `persistence/server/http/httpMediaMethods.ts` (`getMediaByUrl`),
`src/runtime/server/api/bricks/media/s3-proxy.post.ts:59`

`s3-proxy.post.ts` резолвит через `getMediaByUrl` каждое изображение, которое канвас
тянет для снимка страницы. У HTTP-адаптера это `GET {base}/media` целиком с
последующим `.find` — то есть на каждую картинку скачивается весь список медиатеки.

Контрактной point-lookup ручки у external backend нет, и её появление и есть правка
(в файле она уже названа follow-up контракта).

**Фоллбэка на полный список оставлять нельзя:** он спрячет несовместимый бэкенд и
сохранит тот самый горячий O(N)-путь. Обратная совместимость не поддерживается —
ручка становится обязательной частью контракта.

---

## 25. `IImageLocation` собирает семь полей, читается одно

**Файлы:** `builder/media/types/schemaImageResolver.d.ts:22-30`, заполнение —
`utils/schemaImageExtractor.ts` (`createLocation`), единственное чтение —
`components/BuilderMediaImageResolverItem.vue:48`

`createLocation` кладёт в каждое местоположение `componentIndex`, `componentId`,
`componentName`, `propName`, `sourceType` и, для массивов,
`arrayIndex`/`segmentIndex`. Грепом по `src/` и `test/`: читается ровно
`locations[0].componentName`. Остальные шесть полей не читает ни продакшен, ни
спеки — то есть обход схемы аллоцирует объект на каждое найденное вхождение ради
одной строки, а тип обещает адресацию, которой никто не пользуется.

Если адресация не понадобится, обход упрощается до «URL плюс имя первого
компонента».

---

# Упрощения

## 26. `inferPropertyType` — карта, написанная цепочкой `if` с отключённым правилом

**Файл:** `builder/core/composables/useComponentProperties.ts:31`

Одиннадцать подряд идущих `if (value.type === '<literal>')` возвращают либо тот же
литерал, либо `'select'` (для `select`/`tabs`/`modal-select`), и только после них
идут две содержательные ветки — список опций и вывод типа из `default`. Цепочка
стоит проекту `// eslint-disable-next-line complexity`.

Правило проекта прямо предписывает карту вместо разбора по равенствам
(`.claude/rules/typescript.md`, «Prefer Object Maps over Switch»), а рядом в этом же
файле такая карта уже есть — `SELECTOR_TYPE_BY_PROPERTY`. Замена одиннадцати ветвей
на `Record<string, TPropertyType>` снимает и disable-директиву.

**Неизвестный тип свойства в отказ не превращать:** сейчас он деградирует мягко, и
карта обязана сохранить это фоллбэком, а не бросать.

---

## 27. `validatePropertyValue` разбирает тип через `switch`

**Файл:** `builder/core/composables/useComponentProperties.ts:173`

Второй `// eslint-disable-next-line complexity` в файле прикрывает `switch` по
`property.type`. Правило проекта — карта вместо `switch`; здесь значением карты был
бы предикат (`Record<TPropertyType, (value: unknown) => boolean>`), а `default: true`
выражался бы фоллбэком на «всегда истинно».

Отдельно от пункта выше, потому что чинится независимо.

**`default: true` сохранить фоллбэком:** незнакомое свойство обязано остаться
проходимым, иначе новый тип начнёт молча блокировать ввод.

---

## 28. `findSiblingContext` возвращает поле с двумя разными смыслами, и вызывающий его перевычисляет

**Файл:** `builder/core/stores/actions/order.ts:22-56`, `:67-116`

Хелпер отдаёт `{ siblings, index, parentId }`, но `siblings` — это то живой
`parent.children` (вложенная ветка), то свежая копия идентификаторов
(`rootComponents.map(...)` в корневой). Мутировать через поле поэтому нельзя, и
`moveComponentUp`/`moveComponentDown` заново достают родителя, его `children` и
индекс — то есть повторяют работу хелпера целиком, оставляя от него только проверку
границ.

Разделение на «индекс» и «массив, в котором двигаем» сняло бы дубль.

---

## 29. `handleNormalizeProps` игнорирует второй аргумент, объявленный контрактом

**Файлы:** `builder/shell/sidebar/composables/usePropertyVariants.ts:148-153`,
`sidebar/types/composables.d.ts:32-35`

Контракт объявляет `(data, editorType) => Record<string, unknown>`, реализация
принимает `_editorType` и не смотрит на него — вся работа в
`normalizeVariantProps(data)`. Через панель аргумент честно протаскивается двумя
слоями (`ISidebarPropertyHandlers` →
`BuilderShellSidebarPropertyEditorRow.vue:51`).

Либо тип свойства нужен нормализации, и тогда она его не использует, либо не нужен —
и тогда его протаскивают зря.

---

## 30. Инлайновый SVG-шеврон вместо иконки кита

**Файл:** `builder/shell/sidebar/components/BuilderShellSidebarPropertyEditors.vue:405-422`

Восемнадцать строк разметки `<svg>` с `width="12" height="12"` в пикселях там, где
во всех соседних местах области стоит
`<BricksIcon icon="ta:outline-chevron-down" />` (сравнить с
`BuilderShellToolbarPageSelector.vue:213-216`, где направление шеврона тоже меняется
по состоянию). Поворот у инлайнового варианта сделан классом
`.groupChevron`/`.groupChevronOpen`, что тоже воспроизводимо на иконке.

---

## 31. `isPasswordActionVisible` — псевдоним `canChangePassword`

**Файл:** `builder/users/components/BuilderUsersListRow.vue:114-125`

`const isPasswordActionVisible = computed<boolean>(() => canChangePassword.value)` не
добавляет к пропу композабла ничего, кроме имени; разметка могла бы читать
`canChangePassword` напрямую. Единственное, что держит вычисляемое, — его JSDoc
(почему ключ остаётся у деактивированной учётки и почему флаг установки убирает его у
всех).

Уместнее либо дописать эту причину к самому `canChangePassword` в
`builder/core/composables/useBuilderPermissions.ts`, либо оставить как есть — размен
в пользу читаемости разметки. Записано, чтобы не потерялось.

**Удаление может ухудшить разметку.** Флаг несёт семантику строки учётки, а
`canChangePassword` — глобальное право. Валидные исходы: переименовать в
`showPasswordAction` либо оставить и закрыть пункт как осознанный размен, дописав
причину к `canChangePassword`.

---

## 32. `ensurePublishSettingsVisible` — обёртка с неиспользуемым параметром

**Файл:** `builder/app/composables/useBuilderPage.ts`

Функция принимает `_message: string`, не читает его и вызывает
`handleOpenPublishSettings()`. Оба вызывающих (`useBuilderPageWrite`) передают текст
ошибки.

Либо параметр должен что-то делать (подсветить поле, отдать текст в панель), либо
контракт `IBuilderPageWriteOptions.ensurePublishSettingsVisible` должен стать
`() => void`, а сама обёртка исчезнуть в пользу `handleOpenPublishSettings`.

---

## 33. Пустые делегаты в composition root

**Файл:** `builder/app/pages/[pagename].vue`

`handleRetrySession` — это `await retryBuilderSession()`,
`handleOpenMediaGalleryWithContext` — это `handleOpenMediaGallery(context)`. Оба можно
связать в шаблоне напрямую: тулбар эмитит `openMediaGallery: []` без полезной
нагрузки, сайдбар — `[context: TMediaGalleryContext]`, и дефолт параметра покрывает
первый случай.

**На сверке с кодом делегатов осталось два:** пара guarded-save уже снята, и
возвращать под них фабрику не нужно.

---

## 34. `previewCurrentPage`: два `Date.now()` и строка ради числа

**Файл:** `builder/publish/composables/usePublishPreview.ts` (`previewCurrentPage`)

Подряд идут ``{ pagename: `preview-${Date.now()}` }`` (фолбэк адреса) и
``const tempPageId = `preview-${Date.now()}` `` — второй независимый вызов часов.
Дальше `tempPageId` используется ровно один раз:
`id: Number(tempPageId.replace('preview-', ''))`, то есть строка собирается только
для того, чтобы тут же распарсить её обратно в число.

Один `Date.now()` в переменную закрыл бы и лишний round-trip, и расхождение двух
отметок на миллисекунду (при невалидном адресе формы `pagename` и `id` снимка
приходят из разных вызовов).

---

## 35. `openGeneration` инкрементируется дважды подряд

**Файл:** `builder/auth/composables/useAuthAvatarCrop.ts:139-143`

`openFile` вызывает `release()`, который поднимает `openGeneration` (обесценивая
начатое декодирование), и сразу поднимает его сам ещё раз. Между инкрементами
счётчик никто не читает, так что поведение верное, но номер поколения растёт вдвое
быстрее числа открытий — при отладке это читается как «файл открывали дважды».
Достаточно одного инкремента.

---

## 36. `normalizeSvgContent` — обёртка над `trim()` с JSDoc на пять строк

**Файл:** `layouts-blocks/utils/inlineContent.ts`

Тело функции — `return svgContent.trim()`, вызывающий один. JSDoc при этом обещает
«подготовку SVG к inline-вставке» и «очищенный SVG», то есть описывает
несуществующий этап обработки: читатель ждёт снятия XML-пролога или `<?xml ... ?>`,
а получает обрезку пробелов.

Либо снять обёртку, либо дописать обработку, которую JSDoc обещает.

---

## 37. `sliderRootStyle` — computed из одного неизменного свойства

**Файл:** `layouts-blocks/components/BlockSlider.vue:182`

`computed(() => ({ pointerEvents: 'auto' }))` не зависит ни от одного реактивного
источника: реактивность здесь платится за константу. Упрощение — обычная константа
модуля или литерал в биндинге.

**Чего делать нельзя** (проверено): переносить правило в `<style module>`.
`BuilderCanvasItem` гасит интерактивность прямых детей селектором
`.BuilderCanvasItem > *` (специфичность 0,1,1), и правило `.BlockSlider` (0,1,0) ему
проиграет — инлайновый стиль здесь несущий, а не избыточный. Та же конструкция по
той же причине стоит в `flexStyle` (`BlockFlex.vue`) и `gridStyle`
(`BlockGrid.vue`); объяснения нет ни в одном из трёх мест, и это отдельный повод его
дописать.

---

## 38. Отступ попавера над медиа — безымянное число рядом с именованным

**Файл:** `text-editor/components/TextEditorImageFloatPopover.vue`
(`updatePosition`)

Ширина попавера вынесена в константу `POPOVER_WIDTH = 270` и участвует в расчёте
центровки, а вертикальный подъём над элементом остаётся литералом:
`popoverTop.value = rect.top - 44`. Число связано с высотой самого попавера
(2.8rem кнопки плюс отбивка), то есть при изменении вида поедет молча.

---

## 39. Условие `editorTransactionCount.value < 0` читается как барьер

**Файл:** `text-editor/composables/useToolbarStateSync.ts` (`toolbarGroups`)

Счётчик только инкрементируется (`editorTransactionCount.value++`), поэтому
`editorTransactionCount.value < 0` не бывает истинным никогда. Чтение `.value`
внутри условия существует ради регистрации реактивной зависимости — приём рабочий,
но в виде третьего слагаемого в `if` он выглядит проверкой на невозможное состояние.
Комментарий над `computed` про зависимость от счётчика есть, а вот сам код о своём
назначении не говорит.

---

## 40. Линейный поиск детей по всему списку компонентов

**Файл:** `src/runtime/modules/render/composables/useRendererLayouts.ts`
(`getChildComponents`)

Каждый дочерний id ищется `allComponents.value.find(...)`, то есть обходом всего
списка на каждого ребёнка. Контракт разрешает 5000 компонентов на страницу
(`persistence/server/utils/payloadValidation.ts:53`, `MAX_SCHEMA_COMPONENTS`), и в
худшем случае получается квадратичный обход на каждый рендер.

Индекс `computed<Map<string, IBricksComponent>>` по `allComponents` убрал бы повтор.

**Обычный `new Map()` меняет поведение на битой схеме:** при повторяющемся `id`
нынешний `.find` берёт ПЕРВОЕ вхождение, а `Map` оставит последнее. Индекс строить
так, чтобы выигрывало первое.

---

## 41. Двойной вызов `needsContainerWrapper` на каждый компонент

**Файл:** `src/runtime/modules/render/components/TheRenderer.vue`

`renderComponent` вычисляет `hasContainer`, чтобы решить, куда положить
`aria-hidden`, и передаёт `content` в `wrapWithContainer`, который вычисляет то же
самое второй раз. Решение «aria на обёртку, если она есть, иначе на сам компонент»
размазано по двум функциям и держится на том, что обе получают одинаковый ответ.
Дешевле и честнее считать один раз и передавать флаг аргументом.
