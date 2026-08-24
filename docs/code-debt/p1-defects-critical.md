# П1 — потеря данных и молчаливый отказ

Дефекты, у которых цена ошибки максимальная: пользователь теряет работу,
получает неверный результат или тишину вместо сообщения об отказе. Индекс и
правила чтения — [README.md](README.md).

**Закрыл пункт — удали его из этого файла** и перенумеруй остальные: список
сокращается, а не помечается галочками. Отметка «сделано» превращает файл в
журнал, а журнал никто не перечитывает — история правки и так лежит в git.

---

## 1. `/api/bricks` сопоставляется без границы сегмента

**Файлы:** `src/runtime/server/utils/auth/routeProtection.ts:103`,
`src/runtime/server/utils/auth/csrfProtection.ts:86`,
`src/runtime/server/utils/auth/rolePolicy.ts:190`

Все три матрицы решают «это путь bricks?» через
`pathname.startsWith('/api/bricks')`. Границы сегмента здесь нет, поэтому чужой
маршрут потребителя `/api/bricksmith` объявляется путём bricks: `requiresAuth`
требует авторизации, `isCsrfProtectedPath` включает CSRF-гейт,
`resolveRequiredAccess` выдаёт ролевое требование.

Правильный предикат в репозитории уже есть и уже используется соседним слоем:
`matchesPathPrefix`/`isLocalApiPathname` из
`modules/common/utils/localApiPaths.ts`, и на них есть спека —
`test/common/localApiPaths.spec.ts:20,36,59` прямо утверждает, что
`/api/bricksmith` **не** путь bricks. Тот же вывод фиксирует
`test/server/proxyRouting.spec.ts:82`: dev-прокси считает `/api/bricksmith` чужим
маршрутом и отправляет его на PROXY_URL. То есть два слоя одного модуля расходятся
на одном и том же пути.

Отказ fail-closed (потребитель получит 401 вместо своей ручки, а не наоборот), но
для интегрирующего разработчика это молчаливый захват его собственного
пространства имён: имя маршрута, начинающееся на `bricks`, перестаёт ему
принадлежать. Комментарии в коде описывают намерение верно — расходится с ним
реализация.

---

## 2. Импорт из бакета пишет ложный MIME всем форматам кроме четырёх

**Файлы:** `src/runtime/modules/persistence/server/utils/mediaProcessing.ts`
(`detectMimeTypeByFilename`),
`src/runtime/modules/persistence/server/utils/mediaImport.ts:18`

`detectMimeTypeByFilename` знает `svg`, `jpg`/`jpeg`, `png`, `webp` — и всё
остальное объявляет `image/png`. `buildImportPayload` применяет её к каждому
объекту под media-префиксом, а поддерживаемых расширений у модуля заметно больше:
`gif`, `avif`, `tif`/`tiff`, `bmp`, `heic`/`heif` и все шесть видео-контейнеров
(`mp4`, `webm`, `ogg`, `mov`, `avi`, `mkv`). В итоге импортированное видео лежит в
медиатеке с `mime_type: image/png`.

Ирония в том, что модуль уже умеет определять формат по содержимому:
`sniffImageFormat`/`sniffVideoFormat` из `fileSignatures.ts` — тот самый механизм,
которым загрузка перестала доверять клиентскому имени. Импорт до него не дошёл.
Цена: клиент выбирает способ показа по `mimeType`, то есть видео в галерее
отрисуется как картинка.

---

## 3. Непроверенный каст параметров: объект уезжает в URL как `[object Object]`

**Файл:** `src/runtime/modules/render/composables/useBricksDataSources.ts`
(`executeDataSource`, сборка `params`)

`resolveParamValue` возвращает `unknown` — иначе и не может, у
`IBrickDataSourceParam` поле `value: unknown` и `map: (…) => unknown`. При сборке
`Map` результат приводится кастом `as [string, string | number]`, а фильтр снимает
только `undefined` и `null`. Объект, массив или boolean каст переживают, и
`buildDataSourceUrl` подставляет их через `String(...)`:
`/api/x?f=%5Bobject%20Object%5D`. Такой URL проходит и `hasUnresolvedParams`
(двоеточия нет), и `checkDataSourceUrl` — запрос уходит с мусором, без единого
предупреждения.

`.claude/rules/typescript.md` запрещает такие приведения и требует type guard.

---

## 4. `hasUnresolvedParams` ищет любое двоеточие, а не `:paramName`

**Файл:** `src/runtime/modules/render/composables/useBricksDataSources.ts`

Проверка заканчивается `return checkedPart.includes(':')`, хотя плейсхолдер имеет
форму `:paramName` (её знает `buildDataSourceUrl`: `/:([a-zA-Z0-9_]+)/g`).
Легальный URL с двоеточием в query отбрасывается как «unresolved params»:
`/api/events?at=12:30` — относительный, значит `checkedPart` это вся строка,
`includes(':')` истинно, источник пропускается с предупреждением и компонент
остаётся на fallback props. Для абсолютных URL `checkedPart` это
`pathname + search`, то есть тот же случай.

**Чинить:** искать тем же регекспом, что подставляет, — остаток `:([a-zA-Z0-9_]+)`.

---

## 5. Отказ layout-блока по циклу неотличим от «это не layout»

**Файлы:** `src/runtime/modules/render/composables/useRendererLayouts.ts`
(`renderLayoutComponent`), `render/components/TheRenderer.vue`

`renderLayoutComponent` возвращает `null` в двух разных случаях: у компонента нет
`renderPublished` (не layout — штатный путь диспетчера) и блок **отказано**
рендерить из-за цикла или превышения `MAX_COMPONENT_TREE_DEPTH`. Вызывающий их не
различает: `TheRenderer.renderComponent` берёт
`layoutContent ?? renderUiComponent(...)`.

Для отказавшего layout-блока это значит поход в `resolveBrickComponent` с
`brickPath` вида `layout/grid`, а `findImportModule` на префиксе `layout`
возвращает `undefined` молча (`common/composables/useBrickImports.ts`:
`resolveBrickLoader` отсекает `LAYOUT_BRICK_PREFIX`, `reportMissingBrick` для него
не зовётся). Итог: посетитель повреждённой страницы видит заглушку «Компонент не
найден в библиотеке. Обновите bricks или schema» — диагноз неверный, а в лог не
уходит ничего.

Спека это не ловит: харнесс `test/render/layoutsCycleGuard.spec.ts:44` подменяет
отказ безобидным `h('div')` (`renderLayout(child) ?? h('div')`), то есть проверяет
завершаемость рекурсии, но не то, что увидит посетитель.

---

## 6. Замена URL в схеме идёт по всей строке, а префиксные URL ломаются

**Файл:** `builder/media/utils/schemaImageExtractor.ts` (`replaceSchemaImageUrls`,
ветка HTML)

Замена делает `replaced.split(oldUrl).join(newUrl)` по всей строке: заменяется
каждое вхождение где угодно — в `href` соседней ссылки, в видимом тексте, в
`data-`атрибуте. Извлечение при этом читает только `src` у `<img>`
(`HTML_IMG_SRC_RE`), то есть симметрия «что нашли, то и меняем» не соблюдается.

Отсюда второй, более неприятный край: **URL, который является префиксом
другого**. `urlMap` обходится в порядке вставки, и если `…/a.png` заменяется
раньше, чем `…/a.png?v=2`, второй превращается в `<плейсхолдер>?v=2` — то есть в
битую ссылку. Оба случая узкие (замена делается только на плейсхолдер при импорте
схемы), но оба молчаливые.

**Чинить:** заменять только внутри `src` (тот же `HTML_IMG_SRC_RE` с колбэком)
либо сортировать ключи по убыванию длины.

---

## 7. Гонка загрузки статьи: медленный ответ переписывает открытую статью

**Файл:** `builder/documentation/composables/useDocumentationArticles.ts:165-190`
(`loadArticleContent`), watcher — `:239-246`

`loadArticleContent` пишет `articleContent.value = html` без всякой проверки, что
путь, который он читал, всё ещё открыт. Watcher вызывает его на каждую смену
`activeArticlePath`, ничего не отменяя. Быстрое переключение A → B, где чанк A
приезжает позже, оставляет на экране статью A под подписью B; то же — при смене
локали, где `activeArticlePath` переписывается программно.

Ирония в том, что домен шаблонов этот класс дефекта закрывает поколением отправки
(`submissionGeneration`), а здесь того же приёма нет. Лечится одинаково: снимать
поколение (или сам путь) перед `await` и сверять после.

**Реалистичность:** чанки статей кэшируются после первого чтения, поэтому
воспроизводится на первых переключениях (медленная сеть, cold cache). На
playground с восемью локальными статьями поймать это без искусственной задержки не
удалось.

**Где держать поколение — решено, иначе починка встанет не туда.** Кэш заголовков,
набор прочитанных префиксов и экземпляр `MarkdownIt` остаются на уровне модуля:
это неизменяемая build-time статика, для всех запросов процесса одинаковая, и
общий кэш её не портит. Само поколение — наоборот, на уровень модуля выносить
нельзя: в одном серверном процессе оно стало бы общим для всех запросов, и
параллельные читатели гасили бы друг другу загрузку. Поколение (и флаг загрузки,
если он понадобится живому читателю) живёт в экземпляре — как `WeakMap` по
экземпляру приложения Nuxt в `useTemplatesData.ts:27-37`.

---

## 8. Дерево схемы принимает drop на вложенный узел и молча ничего не делает

**Файлы:** `builder/shell/sidebar/components/BuilderShellSidebarSchemaTreeItem.vue:176,212`,
`sidebar/components/BuilderShellSidebarSchemaTreeView.vue:59-75`

Рекурсивный item делает `draggable` любую строку, включая дочерние, рисует
индикатор позиции и поднимает `reorder` наверх через цепочку родителей.
`handleReorder` ищет `targetId` в `componentsStore.getRootComponents()` — а тот
отдаёт только компоненты без родителя (`core/stores/actions/crud.ts:431`), — и на
любом вложенном target выходит по `targetIndex === -1`. Пользователь видит
подсветку «сюда можно», отпускает — и не происходит ничего.

Комментарий сужен до корневого уровня (то есть описывает факт), само поведение
остаётся: либо перестановка внутри дерева, либо `draggable` только у корневых
строк.

---

## 9. Гейт `isDatabaseMode` в форме пароля недостижим и оставляет форму заблокированной

**Файл:** `builder/auth/components/BuilderAuthProfilePasswordForm.vue:99-101`

После успешной смены пароля уход на форму входа обёрнут в `if (isDatabaseMode)`.
Ветка `false` недостижима: форма рисуется только при `props.canChangePassword`
(`TheBuilderAuthProfileModal.vue:285`), а `canChangePassword` в правах билдера уже
включает режим (`builder/core/composables/useBuilderPermissions.ts:92-94`:
`isDatabaseMode && isPasswordChangeAllowedByFlag`). Ни один из спеков её не
проходит: `test/builder/authOwnPasswordForm.spec.ts:38` мокает
`isDatabaseMode: true`.

Если бы ветка была достижима, она молча ломала бы форму: `isSubmitting` снимается
только в `catch`, то есть при `isDatabaseMode === false` успех оставил бы кнопку и
оба поля заблокированными без сообщения.

**Чинить:** либо снять гейт, либо снимать флаг в обеих ветках.

---

## 10. `cycleUnit` записывает число пикселей как проценты

**Файлы:** `src/runtime/modules/text-editor/utils/sizeUnits.ts` (`convertFromPx`),
`src/runtime/modules/text-editor/components/TextEditorImageSizePanel.vue`
(`cycleUnit`)

`SIZE_UNITS` — `['px', 'rem', 'em', '%']`, и `cycleUnit` листает их по кругу,
пересчитывая значение из пиксельных `attr` через `convertFromPx`. Ветки для `%` в
`convertFromPx` нет: `default` возвращает пиксели как есть. Поэтому переключение
единицы на `%` у картинки шириной 300 px даёт `customWidth: '300%'`, а `applySize`
пишет это в атрибут узла (обратный `convertToPx` для `%` возвращает 0, поэтому
пиксельная ширина остаётся прежней, но в DOM уезжает `width: 300%`).

Комментарий над `cycleUnit` при этом верен: пересчёт действительно идёт от
пиксельных `attr`, чтобы не копить ошибки округления. Дефект в отсутствии ветки
для процентов, а не в описании.

---

## 11. Slot DnD: рекурсивный отбор детей и несимметричный `dragDepth`

**Файл:** `builder/canvas/item/composables/useSlotDragDrop.ts:134-141`, `:198-212`,
`:239-255`
**Состояние:** вживую не воспроизведено — нужен brick-компонент со слотами,
которого в playground нет. Ниже разбор по коду.

Две проблемы в одном обработчике. Первая: `getSlotChildElements` берёт
`container.querySelectorAll('[data-slot-child="true"]')` — селектор рекурсивный, а
атрибут получает любой canvas-item, у которого есть `slotName`
(`BuilderCanvasItem.vue:199`), включая детей слота внутри слота. Индекс вставки
тогда считается по расширенному списку и может превысить число непосредственных
детей слота.

Вторая: `dragDepth` растёт на каждом всплывшем `dragenter` (обработчик висит на
контейнере слота, а события приходят и от потомков), тогда как
`handleSlotDragLeave` при переходе между потомками выходит ранним `return` без
уменьшения — `relatedTarget` внутри контейнера. После двух-трёх переходов внутри
слота счётчик не возвращается к нулю, и плейсхолдер остаётся до конца drag-сессии,
пока его не снимет watcher `handleCanvasDragActiveChange`.

---

## 12. Редактор layout-компонента публикуется в стор после конца правки

**Файл:** `src/runtime/modules/text-editor/composables/useInlineEditor.ts`
(`initEditor`)

`initEditor` тянет TipTap динамическими `import()` и после них безусловно делает
`inlineEditingStore.setEditor(editor.value)`. Оба сторожа, которые сносят редактор
при уходе с компонента или смене свойства, требуют `editor.value` — а пока идёт
импорт, он ещё `null`. Значит, `stopEditing()` (Escape, клик мимо, переход на
другую страницу), случившийся внутри окна импорта, не уничтожает ничего, а
доехавший следом редактор встаёт в стор уже без активной правки.

Дальше — молчаливый отказ: следующее inline-редактирование видит непустой
`inlineEditingStore.editor` и не создаёт своего (`useInlineEditingFallback`
выходит по этой проверке), то есть overlay открывается, а править нечем. Второй
эффект — `saveToStore` осевшего редактора продолжает писать в **прежний** проп.

Overlay-половина этого класса уже закрыта: fallback после `await` сверяет
поколение, компонент, свойство и чужой редактор в сторе и уничтожает лишний
экземпляр. Здесь нужно то же самое — снимок `componentId`/`propName` до `await` и
`editor.destroy()` при расхождении.

**Различающий тест:** `stopEditing()` до завершения импорта — редактор уничтожен,
`inlineEditingStore.editor` остался `null`; спека на это сейчас есть только у
fallback (`test/builder/inlineEditingFallback.spec.ts`).
