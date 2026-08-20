# Предложения: что ещё вынести в компоненты — в коде и в макете

Документ — предложение, а не план работ и не журнал. Каждый пункт: что
дублируется, чем это доказано, что предлагается завести, что мигрирует и чем
проверять. Порядок — по убыванию выигрыша, а не по разделам.

**Состояние.** Часть I (код) выполнена; там, где сделанное расходится с
предложенным, в пункте стоит «сделано иначе» с причиной — предложение либо
опиралось на неверную посылку, либо потребовало бы переписать работающую логику
ради одинакового вида.

Часть II (макет) выполняется. Сделано: уборка страниц (переезд «📦 Templates» в
DASHBOARD, счётчики обложки по факту), сверка страницы 🔣 Icons с кодом (+12
иконок, −1 несуществующая, цвет глифов на токенах), расширение сета `Icon` с 8 до
28 глифов-доноров, иконочный слот у сета `Button` и замена **всех** рукописных
кнопок и табов на трёх страницах — 168 фреймов стали инстансами `Icon Button`,
`Button` и `Tab`. Не сделано: пятнадцать компонентов каталога и подмена на них
крупных рукописных узлов экранов (`row`, `avatar/*`, `nav-item/*`,
`version-card/*`, `routing-collapsed`, `search`), судьба двух компонентов вне
каталога. Подробности каждой правки — в журнале синков
`docs/figma-sync-workflow.md`; очередь — раздел «Что осталось» в конце документа.

Повод: выделение `BricksActionButton` и `BricksIconButton` показало, что
дублирование в проекте не разовое, а системное — один и тот же элемент
переписывается в каждом новом разделе, и копии начинают расходиться раньше, чем
кто-то замечает, что это копии.

**Критерий, по которому элемент попал в список:** три и более независимых
реализации одной роли **и** уже начавшийся разброс значений между ними. Просто
похожие блоки без расхождения в список не брались.

**Как снимались числа.** Код — обход `src/runtime/modules/**/*.vue` с разбором
блоков `<style module>` и шаблонов; макет — read-only обход дерева Figma
(`findAllWithCriteria`, `getMainComponentAsync`) по страницам 🖥 Builder,
📄 Dashboard, 📦 Templates, 🖼 Media Gallery. Реестр ID — `docs/figma-sync-workflow.md`.

---

## Часть I. Код

### 1. Оболочка модалки: шапка и футер

**Что дублируется.** Все **15** компонентов на `BricksModal` рисуют собственную
шапку (`.header` + `.title` + `BricksCloseButton`), **11** из них — ещё и
собственный футер с кнопками действий. `BricksModal` даёт только оверлей, портал,
фокус-трап и скрытый `DialogTitle`; всё видимое каждый пишет заново.

**Доказательство — заголовок одной и той же роли разъехался:**

| Значение       | Где                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `1.6rem / 600` | ConfirmModal, DraftRestore, DevicesModal, CreatePage, TemplatesRename, TemplatesSave, ImageResolver |
| `1.8rem / 700` | TextEditorLink, AuthProfile, AvatarCrop, UsersCreate, UsersPassword                                 |
| `1.8rem / 600` | TheTextEditorModal                                                                                  |
| `2rem / 600`   | Documentation, MediaGallery                                                                         |

Паддинг шапки — **семь** разных значений (`1.6rem 2rem`, `2rem 2.4rem`,
`2rem 2.4rem 1.6rem`, `1.6rem 2.4rem`, `1.8rem 2rem 1.8rem 2.4rem`, `2rem`,
`1.6rem 2rem`). Нижняя граница шапки — `base-200` у 13 модалок и `base-300` у двух
(TheTextEditorModal, Documentation). Футер — то `padding-top: 0.4rem` без границы,
то `padding: 1.6rem 2.4rem` с `border-top`.

Отдельно: заголовок пишется **дважды** — в проп `:title` (уходит в скрытый
`DialogTitle` для скринридера) и в видимый `<h3>`. Разъехаться они могут молча.

**Предложение.**

- `ui/base/modal/BricksModalHeader.vue` + `types.d.ts` — заголовок, опциональный
  подзаголовок, слот под действия слева от крестика, встроенный
  `BricksCloseButton` (с `disabled` для сабмита), проп `bordered` для случая без
  разделителя.
- `ui/base/modal/BricksModalFooter.vue` — выравнивание кнопок вправо, гэп,
  вариант с `border-top` для скроллящегося тела, слот для левой группы
  («Удалить» в углу).
- В `BricksModal` — слоты `#header` и `#footer` с дефолтом, который рендерит эту
  пару из пропа `title`. Тогда `:title` перестаёт быть вторым источником правды:
  видимый заголовок и `DialogTitle` берутся из одного значения.

**Что мигрирует:** 15 файлов, перечислены в разделе «Приложение».

**Как проверять:** `npx vitest run test/ui/`, затем живой прогон каждой модалки в
playground — на глаз ловится только смена размеров шапки. Тени и радиусы окна не
трогаются, меняется только внутренняя раскладка.

**Риск.** Модалки с нестандартной шапкой (медиатека с табами категорий,
профиль с вкладками) слотом покрываются, но проверять их надо руками: у них шапка
несёт не только заголовок.

**Сделано иначе.** Заголовок в шапку приходит провайдом из `BricksModal`, а не
пропом: тогда видимая надпись и скрытый `DialogTitle` берутся из одного значения,
и разъехаться им нечем (сторожит `test/ui/bricksModalSections.spec.ts`). Вместо
`bordered` у футера — `variant` (`bar` / `plain` / `inline`): полоса действий
бывает и без линии, но со своими отступами, а двумя булевыми пропами это
описывалось бы четырьмя комбинациями на три нужных случая. Геометрия шапки и
футера свелась к двум ступеням `size` (`md` — диалоги и формы, `lg` — рабочие
модалки на весь экран), и заодно выровнены горизонтальные отступы тела: шапка с
паддингом `2rem` над телом с `2.4rem` смотрелась бы сдвинутой. Футер медиатеки
на `BricksModalFooter` НЕ переведён — в нём живёт панель свойств выбранного
файла, то есть это полоса метаданных, а не полоса кнопок.

---

### 2. Всплывающая поверхность и пункт меню

**Что дублируется.** Рецепт «плавающая панель» —
`radius-sm` + `1px base-200` + `base-0` + тень + `z-popover` — написан **13 раз**:

| Файл                                                             | padding  | тень     |
| ---------------------------------------------------------------- | -------- | -------- |
| `BricksActionButton` (`.dropdown`, min-width 22rem)              | `0.8rem` | `md`     |
| `BricksSelect` (`.dropdown`)                                     | `0.6rem` | `md`     |
| `BricksToolbarColorPicker` (`.popup`)                            | `0.8rem` | `md`     |
| `BricksToolbarEditableSelect` (`.popup`)                         | `0.6rem` | `md`     |
| `BuilderAuthProfileMenu` (`.menu`)                               | `0.6rem` | `md`     |
| `BuilderShellToolbarPageSelector` (`.dropdown`)                  | `0`      | `md`     |
| `BuilderPublishDeviceAddMenu` (`.menu`)                          | `0.6rem` | `md`     |
| `BuilderPublishDeviceIconPopover` (`.popover`)                   | `0.8rem` | `md`     |
| `BuilderUsersRolePill` (`.menu`)                                 | `0.6rem` | `md`     |
| `BuilderCanvasInlineEditingOverlay`                              | `0.6rem` | `md`     |
| `BuilderCanvasItemContextMenu` (+ `.flyout`, min-width 24/16rem) | `0.6rem` | **`lg`** |
| `TextEditorImageFloatPopover`                                    | `0.4rem` | **`sm`** |
| `BuilderMediaGalleryUploadControls` (`.popover`, Reka)           | —        | —        |

Тень уже разъехалась на три ступени (`sm` / `md` / `lg`) при одинаковой роли —
это и есть признак, что дубль живёт своей жизнью.

**Пункт меню внутри** дублируется следом (`padding` + `radius-xs` + hover), и фон
наведения тоже разный: `base-50` (ProfileMenu, RolePill, ContextMenu),
`base-100` (PageSelector), `surface-raised` (DeviceAddMenu).

**Предложение.**

- `ui/base/popover/BricksPopoverSurface.vue` + `types.d.ts` — только поверхность:
  `density` (`compact` `0.4rem` / `default` `0.6rem` / `roomy` `0.8rem` / `flush` `0`),
  `elevation` (`sm` / `md` / `lg`), `minWidth`. Позиционирование **не берёт на
  себя**: кто-то стоит на Reka (`SelectContent`, `PopoverContent`), кто-то на
  ручном `position: absolute` — навязывать один способ значило бы переписывать
  логику там, где она рабочая.
- `ui/base/popover/BricksMenuItem.vue` — строка меню: иконка, лейбл, подпись
  справа (шорткат/значение), состояния `active` / `disabled` / `danger`, один
  фон наведения на всех.

**Как проверять:** `BricksSelect` и `BricksActionButton` покрыты спеками —
прогнать их; остальное живьём. Отдельно проверить контекстное меню канваса: у
него тень `lg` осознанная (меню всплывает над содержимым канваса, а не над
панелью), это должно остаться вариантом `elevation`, а не потеряться при
унификации.

**Сделано иначе.** С поверхностями reka компонент составляется через `as-child`,
то есть узел остаётся один: `data-state`, на который вызывающие вешают анимацию,
и класс с геометрией стоят там же, где вид (проверено вживую и спекой
`test/ui/bricksPopoverSurface.spec.ts`). Позиционирование, ширину и анимацию
компонент по-прежнему не берёт — только радиус, рамку, фон, тень и слой; для
паддингов вне шкалы плотности вызывающий берёт `density="flush"` и ставит свой,
иначе два класса-одиночки спорили бы за одинаковую специфичность.

Две поверхности из тринадцати оставлены рукописными, и это записано у них в
стилях: корень контекстного меню канваса и оболочка оверлея inline-редактирования
— ссылка на этот узел уходит в логику как ЭЛЕМЕНТ (проверка попадания курсора,
авторазмещение, перетаскивание), и инстанс компонента заставил бы тащить `$el` в
три места ради одинакового вида. Всплывающее подменю того же контекстного меню
(`.flyout`) на компонент переведено.

`BricksMenuItem` получили два меню из пяти — профиль и выбор устройства. Строка
селектора страниц осталась своей (это не пункт, а строка с превью, адресом и
плашкой на 5rem высоты), а контекстное меню канваса сохранило своё оформление
наведения — заливку `primary` с белой подписью, как у системных контекстных меню;
сводить её к нейтральной значило бы менять дизайн, а не убирать дубль. Разъехавшийся
фон наведения при этом сведён к `base-50` везде, включая селектор страниц.

---

### 3. Складная секция

**Что дублируется.** `BuilderPublishDetailsPanelRouting`,
`…PanelSchema`, `…PanelVersions` содержат **побайтово одинаковый** блок: кнопка
без рамки, шеврон `ta:outline-chevron-right`, поворот на 90° в открытом
состоянии, `1.2rem / 500 / base-600`, гэп `0.6rem`, `align-self: flex-start`.
Отличаются только имена классов (`routingToggle` / `schemaToggle` /
`versionsToggle`). Четвёртая копия с вариацией — `advancedCaret` в
`TheBuilderPublishCreatePageModal`.

**Предложение.** `ui/base/disclosure/BricksDisclosure.vue` + `types.d.ts`:
проп `label`, `modelValue` (открыто/закрыто), слот содержимого, слот действий
справа от заголовка. Внутри — `aria-expanded` и `aria-controls`, которых сейчас
нет ни у одной из четырёх копий: сегодня скринридер не сообщает, что заголовок
раскрывает секцию.

**Как проверять:** спеки панели деталей + клавиатурный прогон (Tab до заголовка,
Enter/Space).

---

### 4. Подсказка под полем

**Что дублируется.** Текст подсказки объявлен **15 раз**, тремя разными
рецептами: `1.2rem` + `base-500` + `line-height 1.4` (9 файлов), `1.2rem` +
`base-400` без `line-height` (4), `1.1rem` + `base-500` (`DeviceRanges`),
`1.2rem` + `base-500` + `line-height 1.5` (`TemplatesSave`).

Это самый дешёвый пункт списка: `ui/inputs/BricksFieldError.vue` уже существует
ровно как «единый вид ошибки поля для всех форм». Подсказка — его недостающий
близнец, и её отсутствие — причина, по которой цвет разъехался на `base-400` и
`base-500`.

**Предложение.** `ui/inputs/BricksFieldHint.vue` — один абзац, `margin: 0`,
внешние отступы задаёт вызывающий (как у `BricksFieldError`). Выбрать один цвет:
предлагаю `base-500`, он в большинстве и контрастнее на тёмной теме.

**Как проверять:** `stylelint` + просмотр форм (создание страницы, создание
пользователя, SEO-поля, параметры загрузки медиа).

---

### 5. Пустое состояние

**Что дублируется.** `BuilderPublishPagesList`, `BuilderUsersList`,
`BuilderTemplatesGrid` — одинаковые кружок-иконка `6.4rem` / `border-radius: 50%`
/ `base-100`, заголовок `1.6rem / 700 / base-900`, описание ниже. Облегчённый
вариант (иконка + подсказка, без кружка) — ещё в шести местах: сайдбар
«Компоненты» и «Схема», редакторы аккордеона и галереи, селектор страниц,
медиатека, `BlockAccordion`.

**Предложение.** `ui/feedback/BricksEmptyState.vue` + `types.d.ts`: `icon`,
`title`, `description`, слот действия (кнопка «Создать страницу»), проп `size`
(`md` — раздел дашборда с кружком, `sm` — панель сайдбара без кружка). Два
размера вместо двух компонентов: разница только в кружке и кегле.

**Риск.** `BuilderCanvasEmptyState` в список миграции **не** входит — это
состояние пустого холста со своей иллюстрацией и подсказкой про drag & drop, а не
пустой список.

---

### 6. Строка-карточка списка

**Что дублируется.** `BuilderPublishPagesListRow` и `BuilderUsersListRow` —
одинаковый рецепт: `radius-sm`, `1px base-200`, `base-0`, паддинг
`1.4rem 1.6rem`, наведение `border-color: primary-300` + `shadow-sm`.
`BuilderTemplatesCard` — тот же рецепт в сетке. Рядом расходящиеся варианты той
же роли: плитка медиатеки (`radius-md`, наведение `shadow-md`), карточка сайдбара
(`base-300`, `shadow-md`).

**Предложение.** `ui/base/surface/BricksSurfaceCard.vue` — поверхность и
поведение наведения/фокуса, без раскладки содержимого: раскладка у строки
страниц, строки учётки и карточки шаблона разная, и загонять её в общий компонент
значило бы делать его конфигуратором. Пропы: `interactive` (наведение и курсор),
`selected`, `radius` (`sm` / `md`), `elevation` наведения.

**Осознанное ограничение.** Это самый спорный пункт списка. Если решаем, что
общая поверхность не окупается, — минимум, который стоит сделать всё равно:
свести `base-200`/`base-300` и `shadow-sm`/`shadow-md` к одной паре, иначе строки
и карточки продолжат выглядеть как из разных наборов.

**Сделано иначе.** У поверхности два пропа вместо одного: `interactive` — отклик
на наведение и фокус (рамка и тень), `clickable` — курсор. Строка учётки
подсвечивается, чтобы проявить свои кнопки, но сама никуда не ведёт, и общий
`cursor: pointer` обещал бы переход, которого нет.

Поверхность получила три места из пяти: строку
списка страниц, строку учётки и карточку шаблона — у них рецепт был побайтово
одинаковым. Тег корня остался `article` (проп `as`): подменять его на `div` ради
общего компонента значило бы платить семантикой за оформление. Плитка медиатеки
не переведена — у неё три разных корня под одним классом (кнопка загрузки,
`option` файла, заглушка) и свой смысл выбранного состояния (рамка `0.2rem`
`primary`), но её токены и так совпадают с китом, то есть расхождения, ради
которого пункт заводился, там нет. Карточка компонента в сайдбаре оставлена
осознанно: прозрачный фон, рамка `base-300` и подъём на наведении — язык
источника перетаскивания, а не отставшая копия строки списка.

---

### 7. Плашка-индикатор: пилюля, тон и точка статуса

**Что дублируется.** Роль «короткое значение рядом с именем» написана пять раз, и
кит в этом наборе не источник, а один из вариантов:

| Где                                                   | Радиус                       | Геометрия                         | Кегль / вес    | Цвета                                                                   |
| ----------------------------------------------------- | ---------------------------- | --------------------------------- | -------------- | ----------------------------------------------------------------------- |
| `BricksBadge` (кит)                                   | `0.4rem` **сырым значением** | `padding 0.2rem 0.6rem`           | `1.2rem / 500` | `base-200`/`base-600`, `primary`/`static-white`                         |
| `selfBadge` (`BuilderUsersListRow`)                   | `radius-pill`                | `padding 0.2rem 0.8rem`           | `1.1rem / 600` | `base-100`/`base-500`                                                   |
| `currentBadge` (`BuilderPublishDetailsPanelVersions`) | `radius-pill`                | `padding 0.2rem 0.8rem`           | `1.2rem / 500` | `primary-500`/`static-white`                                            |
| `BuilderUsersRolePill`                                | `radius-pill`                | `height 2.4rem`, `padding 0 1rem` | `1.2rem / 500` | `base-100`/`base-700`, `primary-50`/`primary-600`, `base-50`/`base-500` |
| `localeBadge` (`BuilderPublishDashboardNav`)          | без фона                     | `width 1.8rem`                    | `1.2rem / 600` | `base-500`                                                              |

`currentBadge` — это буквально `BricksBadge variant="primary"`, переписанный
руками ради pill-радиуса. Что кит для этой роли годится, доказывает медиатека:
`selectedBadge` берёт `BricksBadge variant="primary"` и переопределяет классом
только форму. Недостающего в ките ровно два: pill-форма и тихий нейтральный тон
под подпись вроде «вы».

**Точка статуса — тот же дубль рядом.** `statusDot` побайтово одинаков в
`BuilderUsersListRow` и `BuilderPublishPagesListRow`: круг `0.8rem`, `base-300`,
`--bricks-green` в активном состоянии. У строки учётки рядом есть подпись
(`1.3rem / base-500`), у строки страницы подписи нет вовсе — статус объявлен
одним цветом, то есть ни скринридер, ни человек, не различающий зелёный,
статуса страницы не получают.

**Предложение.** Один примитив на все три места вместо трёх компонентов —
расширить `ui/base/badge/BricksBadge.vue` и `types.d.ts`:

- `shape` — `rounded` (нынешние `0.4rem`; значение вне шкалы токенов, ближайший
  `--bricks-border-radius-xs` — `0.6rem`, поэтому оставляется числом с
  комментарием, а не подтягивается «для чистоты») и `pill`;
- `tone` вместо `variant` — `primary`, `neutral`, `muted` (`base-100`/`base-500`,
  тон `selfBadge`), `plain` (без заливки, тон строки статуса);
- `size` — `md` (`1.2rem`) и `sm` (`1.1rem / 600`, кегль `selfBadge`);
  **сделано иначе: пропа нет.** Ступени различались на глаз только весом, а
  `1.1rem` — вне шкалы кратности `0.2rem`, то есть кит формализовал бы у себя
  запрещённое правилами значение. Кегль один: `1.2rem / 500`;
- `dot` — тон ведущей точки статуса (`neutral` / `positive`), она же снимает
  дубль `statusDot`;
- `as` — `span` по умолчанию, `button` для триггера меню ролей.

Что куда переезжает: `selfBadge` → `shape="pill" tone="muted" size="sm"`;
`currentBadge` → `shape="pill" tone="primary"`; `statusCell` обеих строк →
`tone="plain"` + `dot` + подпись внутри. Плашка без заливки — не растяжка
примитива, а его четвёртый тон: роль та же, меняется только фон. Список страниц
при этом получает подпись статуса, которой у него нет.

`BuilderUsersRolePill` остаётся своим компонентом: у него меню, три тона роли и
запрет по правилу. Ките он отдаёт только оболочку триггера
(`as="button" shape="pill"` + тон роли), а `DropdownMenuTrigger`, шеврон и замок
держит сам — затаскивать их в примитив значило бы делать из него конфигуратор.

**Сделано иначе: тон `muted` несёт подпись `base-600`, а не `base-500`.** У
плашки «вы» до переезда было именно `base-500`, но на `base-100` это 4.4:1 —
ниже порога AA для обычного текста, и как тон кита значение разошлось бы по всем
местам. Роль редактора (`base-100`/`base-700` своими стилями) через тот же тон
получает 6.9:1 вместо прежних 9.4:1 — заметно ближе, чем ушедшие 4.4:1.

**Что мигрирует:** `BricksBadge` (расширение), `BuilderUsersListRow`
(`selfBadge` + `statusCell`), `BuilderPublishPagesListRow` (`statusDot`),
`BuilderPublishDetailsPanelVersions` (`currentBadge`), `BuilderUsersRolePill`
(оболочка триггера), `BuilderMediaGalleryGrid`, `BuilderAuthProfileDetailsForm`
(переезд `variant` → `tone`).

**Как проверять:** `npx vitest run test/ui test/builder` + живой прогон списка
учёток (своя строка, заблокированная роль, деактивированная учётка) и списка
страниц (опубликованная и черновик), обе темы.

**Риск.** `variant` → `tone` — переименование пропа в ките при пяти вызовах;
обратная совместимость по правилам проекта не держится, но найти надо все пять,
включая тот, что задаёт вариант по умолчанию неявно (`BricksTagsEditor`,
`BuilderShellToolbarPageSelector`, `BuilderPublishPagesListRow` — без пропа).
Второй риск — `tone="plain"`: если таких вызовов окажется больше двух, значит
роль другая и её надо выносить отдельно, а не тоном.

---

### 8. Точечное

- **`BuilderShellToolbarPageSelector` рисует поиск руками.** **Сделано иначе:
  не мигрирует.** Посылка была неверной — полем там обязан быть reka
  `ListboxFilter`: стрелки и Enter из него ведут по строкам списка, а обычный
  `<input>` внутри `BricksSearchInput` унёс бы клавиатурную навигацию. Это уже
  записано в докблоке самого `BricksSearchInput` как исключение, и я эту запись
  при съёме числа пропустил.
- **27 icon-only кнопок написаны руками в 15 файлах** после выделения
  `BricksIconButton`. Часть законна (внутренние кнопки `BricksInput`, сам
  `BricksCloseButton`, кнопки тулбара редактора — у них свой компонент в
  каталоге). Мигрировали: `BuilderPublishDetailsPanel` (2),
  `BuilderPublishCreatePageStartOptions` (2), `BuilderShellSidebarComponentsView`
  (фильтр «только избранные» — у него не было доступного имени вовсе),
  `BuilderCanvasItemContextMenu`. **Сделано иначе:**
  `BuilderMediaGalleryPreviewLightbox` оставлен — ссылка на его кнопку нужна как
  элемент (`focus()` при открытии лайтбокса), а геометрия там своя (4rem, глиф
  2rem поверх полноэкранной вуали).
- **`RendererCloseButton` протух.** Копия `BricksCloseButton` в `render/`
  осознанная — правило render-lean запрещает `render` импортировать `ui`, и в
  файле стоит TODO. Но копия отстала: `radius-md` + рамка `base-300` + фон при
  наведении вместо `radius-control` без рамки и смены цвета глифа, и у неё не
  было `:focus-visible`. **Сделано иначе в одном:** имя у кнопки есть — его
  передаёт снаружи единственное место вызова (баннер превью), и это правильно:
  локалей в `render` нет, зашитая строка годилась бы для одного языка.
  Расхождение токенов теперь сторожит
  `test/render/rendererCloseButtonParity.spec.ts`.
- **Скелеты** — четыре независимых набора (`PageSelector`, `DetailsPanelVersions`,
  `TemplatesGrid`, `MediaGalleryGrid`), все на статичной заливке `base-100` без
  анимации. Дубль мелкий; `ui/feedback/BricksSkeleton.vue` (прямоугольник с
  `width`/`height`/`radius`) окупается, только если делать это заодно с пунктом 5.

---

## Часть II. Макет

### Главное: экраны собраны из локальных фреймов, а не из инстансов

Каталог 🧩 Components держит **49** узлов (26 сетов вариантов + 23 отдельных
компонента, считая 12 служебных глифов `Layout Icon/*` и `Tab Icon/*`), а экраны
им пользовались мало. Доля — инстансов к фреймам на странице; «было» снято
20 августа 2026 до правок, «стало» — после замены всех рукописных кнопок и табов:

| Страница         | Фреймов было | стало | Инстансов было | стало | Доля было | стало |
| ---------------- | ------------ | ----- | -------------- | ----- | --------- | ----- |
| 📄 Dashboard     | 1817         | 1673  | 273            | 447   | 15 %      | 21 %  |
| 📦 Templates     | 478          | 410   | 92             | 164   | 19 %      | 29 %  |
| 🖼 Media Gallery | 1012         | 886   | 238            | 364   | 24 %      | 29 %  |
| 🖥 Builder       | 993          | 993   | 103            | 103   | 10 %      | 10 %  |

Что было перерисовано руками (счётчик — сколько одноимённых фреймов на странице;
✅ — уже заменено инстансами):

- **Dashboard:** `row` ×26, `version-card/Default` ×18, `routing-collapsed` ×18,
  `role-pill` ×12, `nav-item/*` ×12 на каждый пункт рейла, `avatar/photo` ×20,
  `thumb` ×36, `badge/draft` ×8, `search` ×10, `header-avatar` ×10;
  ✅ `icon-btn` ×14, `action/key` ×10, `action/delete` ×10, `action/deactivate` ×4,
  `action/userOff` ×4, `action/userCheck` ×2, `button/*` ×24, `tab/*` ×30.
- **Templates:** рейл и шапка дашборда скопированы целиком (`nav-item/*` ×6 на
  пункт, `search` ×6, `header-avatar` ×4), `card-skeleton` ×8;
  ✅ `icon-btn` ×30.
- **Media Gallery:** `tab/*` ×12 на каждую категорию — **остаётся фреймом
  осознанно** (см. ниже); ✅ `Button/Удалить` ×16, `removeCategory` ×12,
  `optimizationTrigger` ×10, `ghostButton/plus` ×10, `ghostButton/pencil` ×10,
  `confirmCategory` ×4, `cancelCategory` ×4.
- **Builder:** `pageRow/*` ×6, `treeRow`, `searchField` ×6, `draftBadge` ×6,
  `separator` ×20 — страницу ещё не трогали.

Практический смысл: правка одной строки списка — это 26 ручных правок в одном
файле, и любая из них может быть пропущена. Тёмные копии удваивают счёт.

**Две позиции прежнего списка отменены — предложение опиралось на неверную
посылку.** Категорийные табы медиатеки в коде намеренно **не** `BricksTabBar`:
кнопку удаления категории нельзя вложить в `ToggleGroupItem` (кнопка внутри
кнопки), а положить их одним item нельзя потому, что любой item группы меняет
фильтр — то есть клик по крестику переключал бы категорию. Ряд собран напрямую на
reka `ToggleGroup`, и составной фрейм в макете это честно отражает; заменена в нём
только сама кнопка-крестик. `field/*` там же — обёртки «подпись + контрол» вокруг
настоящих инстансов `Input` и `Select`, а не копии компонента; заменять нечего.

### Компоненты каталога, которых не хватает

Все источники теперь существуют в коде — «предлагается кодом» больше не про
будущее, поэтому оси взяты из фактических пропов, а не из замысла. Секция
каталога — по папке кода, description — путь к `.vue`, как у остальных.

| Компонент          | Секция   | Оси вариантов                                                                                                  | Источник в коде                                            |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Avatar ✅ заведён  | BASE     | `Size=sm/md/lg` × `Kind=Photo/Initials`                                                                        | `ui/base/avatar/BricksAvatar.vue`                          |
| Badge ✅ заведён   | BASE     | `Shape=rounded/pill` × `Tone=primary/neutral/muted/accent/quiet/plain`, точка/подпись/иконка — переключателями | `ui/base/badge/BricksBadge.vue`                            |
| Search Input       | INPUTS   | `State=Empty/Filled/Focus`                                                                                     | `ui/inputs/BricksSearchInput.vue`                          |
| Slider             | INPUTS   | `State=Default/Disabled`                                                                                       | `ui/inputs/BricksSlider.vue`                               |
| Field Hint         | INPUTS   | вариантов нет — один абзац                                                                                     | `ui/inputs/BricksFieldHint.vue`                            |
| Popover Surface    | BASE     | `Density=compact/default/roomy/flush` × `Elevation=sm/md/lg`                                                   | `ui/base/popover/BricksPopoverSurface.vue`                 |
| Menu Item          | BASE     | `State=Default/Hover/Active/Disabled` × `Tone=Neutral/Danger` × `Hint=None/Value`                              | `ui/base/popover/BricksMenuItem.vue`                       |
| Modal Header       | BASE     | `Size=md/lg` × `Bordered=True/False` × `Subtitle=None/Text`                                                    | `ui/base/modal/BricksModalHeader.vue`                      |
| Modal Footer       | BASE     | `Size=md/lg` × `Variant=bar/plain/inline` × `Leading=None/Group`                                               | `ui/base/modal/BricksModalFooter.vue`                      |
| Disclosure         | BASE     | `State=Collapsed/Expanded`                                                                                     | `ui/base/disclosure/BricksDisclosure.vue`                  |
| Surface Card       | BASE     | `Radius=sm/md` × `State=Default/Hover/Selected`                                                                | `ui/base/surface/BricksSurfaceCard.vue`                    |
| Empty State        | FEEDBACK | `Size=md/sm` × `Action=None/Button`                                                                            | `ui/feedback/BricksEmptyState.vue`                         |
| Skeleton           | FEEDBACK | `Shape=Line/Block`                                                                                             | `ui/feedback/BricksSkeleton.vue`                           |
| Dashboard Nav Item | BASE     | `State=Default/Hover/Active` × `Badge=None/Count`                                                              | `builder/publish/…/BuilderPublishDashboardNav.vue`         |
| Version Card       | BASE     | `State=Default/Hover/Current/NoThumbnail`                                                                      | `builder/publish/…/BuilderPublishDetailsPanelVersions.vue` |

**Сделано иначе у `Badge`:** ось `Dot` не заведена. Точка вынесена в булев
переключатель, потому что тремя значениями оси сет вырос бы до 36 вариантов ради
сочетания, которое код использует только с тоном `plain`; положительная точка —
тот же круг, перекрашенный в `accent/green` оверрайдом. Заодно добавились два
переключателя, которых в предложении не было, но без которых код не описывался:
«Show label» (в строке списка страниц плашка — только точка, подписи нет) и
«Show icon» (шеврон или замок пилюли роли лежат внутри слота `BricksBadge`).

`Role Pill` отдельным компонентом не нужен: в коде это `Badge` с
`as="button" shape="pill"` плюс тон роли, то есть в каталоге достаточно
демо-инстансов с шевроном и замком рядом с сетом `Badge`. Плашки `Tag`
(standalone, INPUTS) `Badge` не заменяет и не отменяет: `Tag` — чип редактора
ключевых слов со своей кнопкой удаления, в коде это `BricksTagsEditor` на
`BricksBadge` внутри.

Первые пять строк — чистый долг: компоненты в коде были и раньше, а в каталоге их
нет (проверено 20 августа 2026 — ни `Avatar`, ни `Badge` в нём не заводили).
Остальные — пара к тому, что заведено этой правкой.

### Наведение порядка: что сделано и что осталось

1. **Сет `Icon Button` `801:202` был заведён с нулём инстансов, теперь их 84.**
   Блокировка была в глифах: внутри `Icon Button` стоит инстанс сета `Icon`
   `13:16`, а в нём было восемь глифов, и свапнуть вложенную иконку было не на
   что — подмена превратила бы пять разных действий строки в пять одинаковых
   «глазов».

    **Сделано.** Сет `Icon` расширен до 28 глифов; геометрию брали не из
    рукописных фреймов, а из `@kalimahapps/vue-icons` — того же источника, что и
    `BricksIcon` в коде, с обводкой, обведённой в заливку при боксе 16. После
    этого рукописные кнопки заменены инстансами: Dashboard — 14 `icon-btn`,
    30 `action/*`, 24 `button/*`, 4 одиночных; Templates — 30; Media Gallery — 66.
    Тон и глиф каждой кнопки взяты из кода, а не с картинки, поэтому попутно
    вылезли и исправлены расхождения (см. пункт 7).

2. **Два компонента вне каталога и без инстансов:**
   `Builder Toolbar Icon Button` `32:2` (36×36, description «BricksButton
   variant=outline equal size=md с иконкой (демо-компонент экрана)») и
   `Builder Sidebar Component Card` `34:8` (280×156,
   `BuilderShellSidebarComponentCard.vue`) на странице 🖥 Builder. Первый
   пересекается с сетом `Icon Button`, второй — единственное изображение
   карточки библиотеки. Решение за владельцем: переносить в каталог или удалять.
   Не сделано — удаление компонентов из общего файла не та правка, которую
   делают попутно.

3. **Страница «📦 Templates (concept)» лежала в CONCEPTS**, хотя фича в коде.
   **Сделано:** страница переименована в «📦 Templates» и стоит в DASHBOARD сразу
   за «📄 Dashboard»; борд «Сейчас → Стало» `688:5` с тёмной копией `712:4766`
   удалён, остальные борды перенумерованы 1–4 и подняты на 1160, чтобы не
   осталось дыры; подзаголовок страницы переписан фактом — он описывал заглушку
   («счётчик рейла захардкожен нулём», «кнопка пустого состояния выключена
   навсегда»), чего в коде давно нет.

4. **Обложка врала по счётчикам.** **Сделано:** `12:96` — было «57 variables ·
   20 components», стало «66 variables · 49 components». 66 = Color 48 +
   Radius 5 + Spacing 9 + Typography 4; 49 = 26 сетов + 23 отдельных компонента
   на 🧩 Components.

5. **Компонент `Tag` `25:76` описывает прежний чип.** В его description
   зафиксировано «фон primary/100, текст 12 primary/700, крестик primary/500» —
   в коде этой пары давно нет: чип стоит на `BricksBadge` (заливка `primary`,
   подпись `static-white`, крестик белый), потому что `primary-100` +
   `primary-700` в тёмной теме давали контраст около 2:1 и тег не читался.
   Обновить вместе с заведением сета `Badge`: чип — его же вид плюс кнопка
   удаления.

6. **Рукописное, для которого компонент в каталоге УЖЕ есть.** **Сделано** —
   кроме одной позиции: заменены `Button/Удалить` ×16 и вся мелкая кнопочная
   обвязка медиатеки, все `tab/*` дашборда (сет `Tab`) и все кнопки с иконками.
   `tab/*` медиатеки и `field/*` из списка **вычеркнуты**: в коде это не `Tab` и
   не копия `Input` (разбор — в конце раздела «Главное»). Осталось `search` ×10 на
   Dashboard и ×6 на Templates: под него нужен `Search Input`, потому что в коде
   это отдельный `BricksSearchInput`, а не `BricksInput` с иконкой.

7. **Расхождения макета с кодом, вскрытые заменой.** Разбирались по ходу, потому
   что вариант компонента и глиф нельзя выбрать, не посмотрев в код:
   строка списка страниц рисовала 4 кнопки против 5 в
   `BuilderPublishPagesListRow` — не было «Шаблон из страницы»; в единственном
   борде, где она была, стояла после «Удалить», хотя код вставляет её между
   копией и удалением. Корзина в карточке шаблона в покое была нейтральной при
   `danger` у кнопки. Удаление в футере панели деталей было 36×36 против
   `size="lg"` = 32. Сброс выбранного файла был 20×20 против обычного `ghost` 28.
   Полоса табов была 31 при 32 в коде, таб 27 при 28, подпись активного таба
   полужирная при весе 500 во всех состояниях. Крестик категории в медиатеке был
   16×16 без радиуса против 20×20 и радиуса `xs` из класса `.remove`. Всё
   выправлено по коду.

8. **Токены: три переменные без пары в коде и один цвет без переменной.**
   `color/primary/200` и `color/surface/panel` несут Code syntax
   `--bricks-primary-200` и `--bricks-surface-panel`, которых в
   `_variables.scss` больше нет; у `typography/font-size/lg` пары в коде тоже нет
   (Code syntax у неё не задан). Обратно: `--bricks-purple` в коде есть, а
   переменной в Figma нет. Решать владельцу: удалять переменные из файла или
   возвращать токены в код — молча делать ни то, ни другое нельзя, потому что
   на первые две могут быть ссылки в узлах.

---

## Что осталось

Код закрыт целиком: восемь пунктов части I, включая точечное. В части II закрыты
иконочный фундамент и вся кнопочно-табовая уборка — осталось то, что упирается в
отсутствующие компоненты каталога.

1. ~~Глифы в сет `Icon`~~ — **сделано**: 8 → 28 глифов, геометрия из
   `@kalimahapps/vue-icons`.
2. ~~`icon-btn` → инстансы `Icon Button`~~ — **сделано** на Dashboard и Templates,
   вместе с `action/*`, `button/*` и мелкой кнопочной обвязкой медиатеки; всего
   168 фреймов стали инстансами. У сета `Button` для этого появился иконочный слот
   («Show icon» + вложенный `Icon`).
3. **Компоненты каталога** — тринадцать из таблицы выше: `Badge` и `Avatar`
   заведены, на них уже переведены 144 узла дашборда. Осталось, от нижних слоёв к
   верхним: `Popover Surface` и `Menu Item`, затем `Modal Header` / `Modal Footer`,
   `Disclosure`, `Surface Card`, `Empty State`, `Skeleton`, `Dashboard Nav Item`,
   `Version Card`, и долг по `Search Input`, `Slider`, `Field Hint`. `Search Input`
   держит последнюю позицию кнопочной уборки (`search` ×16), `Disclosure` —
   `routing-collapsed` ×18 и `versions-collapsed` ×11, `Dashboard Nav Item` — 60
   пунктов рейла, `Surface Card` — `row` ×26. Сюда же — description компонента
   `Tag`: он описывает чип, которого в коде больше нет.
4. **Экраны на инстансы** — осталось `row` ×26, `version-card/Default` ×18,
   `routing-collapsed` ×18, `nav-item/*` ×60, `search` ×16 на Dashboard и родня на
   других страницах. Возможно только после пункта 3: подменять фрейм не на что,
   пока компонента нет. Аватары, пилюли роли, плашки и статусные пары (144 узла)
   уже заменены. Здесь же окупается и главный смысл части II — правка одной строки
   списка перестаёт быть 26 ручными правками.
5. **Страница 🖥 Builder не тронута** — `pageRow/*` ×6, `treeRow`, `searchField`
   ×6, `draftBadge` ×6, `separator` ×20 и рукописные иконки тулбара. Доля
   инстансов там самая низкая (10 %), но и компонентов под её узлы в каталоге
   меньше всего.
6. **Судьба двух компонентов вне каталога** (`32:2`, `34:8`) — решение владельца,
   в код и в каталог они сейчас не входят.
7. **Три переменные без пары в коде и один цвет без переменной** — пункт 8
   раздела «Наведение порядка». Тоже решение владельца: удалять из файла или
   возвращать в код.

**Чего в этом списке нет намеренно.** Реестр ID и журнал синков
`docs/figma-sync-workflow.md` обновляются вместе с каждой правкой макета, а не
отдельным пунктом. Собственный борд «Сейчас → Стало» после уборки не заводится
ни для одного из пунктов: правило то же — как только фича в коде, «было»
описывать нечего.

---

## Приложение: файлы, которые мигрировали

Список снят до правки и оставлен как есть — по нему видно охват части I.

**Модалки (п. 1)** — `BricksConfirmModal`, `TextEditorLinkModal`,
`TheTextEditorModal`, `TheBuilderDocumentationModal`, `TheBuilderDraftRestoreModal`,
`TheBuilderAuthProfileModal`, `BuilderAuthProfileAvatarCropModal`,
`BuilderPublishDevicesModal`, `TheBuilderPublishCreatePageModal`,
`TheBuilderUsersCreateModal`, `TheBuilderUsersPasswordModal`,
`TheBuilderTemplatesRenameModal`, `TheBuilderTemplatesSaveModal`,
`TheBuilderMediaGalleryModal`, `TheBuilderMediaImageResolverModal`.

**Всплывающие поверхности (п. 2)** — `BricksActionButton`, `BricksSelect`,
`BricksToolbarColorPicker`, `BricksToolbarEditableSelect`, `BuilderAuthProfileMenu`,
`BuilderShellToolbarPageSelector`, `BuilderPublishDeviceAddMenu`,
`BuilderPublishDeviceIconPopover`, `BuilderUsersRolePill`,
`BuilderCanvasInlineEditingOverlay`, `BuilderCanvasItemContextMenu`,
`TextEditorImageFloatPopover`, `BuilderMediaGalleryUploadControls`.

**Складные секции (п. 3)** — `BuilderPublishDetailsPanelRouting`,
`BuilderPublishDetailsPanelSchema`, `BuilderPublishDetailsPanelVersions`,
`TheBuilderPublishCreatePageModal` (блок «Дополнительно»).

**Подсказки (п. 4)** — `BricksHexInput`, `TextEditorLinkModal`,
`BuilderAuthProfileDetailsForm`, `BuilderAuthProfilePasswordForm`,
`BuilderAuthProfileAvatarCropModal`, `BuilderShellSidebarPublishView`,
`BuilderCanvasInlineEditingOverlay`, `BuilderPublishDeviceRanges`,
`TheBuilderPublishCreatePageModal`, `BuilderPublishDetailsPanelRouting`,
`TheBuilderUsersCreateModal`, `TheBuilderUsersPasswordModal`,
`TheBuilderTemplatesSaveModal`, `BuilderMediaGalleryDropOverlay`,
`BuilderMediaGalleryUploadOptions`.

**Пустые состояния (п. 5)** — `BuilderPublishPagesList`, `BuilderUsersList`,
`BuilderTemplatesGrid` (с кружком); `BuilderShellSidebarComponentsView`,
`BuilderShellSidebarSchemaTreeView`, `BuilderShellSidebarPropertyAccordionItemsEditor`,
`BuilderShellSidebarPropertyImageGalleryEditor`, `BuilderShellToolbarPageSelector`,
`TheBuilderMediaGalleryModal` (облегчённые).
