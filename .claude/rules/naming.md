# Нейминг внутри доменов (`src/runtime/modules/`)

Консолидация выполнена (2026-06-11), реструктуризация под модульную цепочку — 2026-06-12.
Правила действуют для всего нового кода.

## Компоненты

1. **Имя = модульная цепочка пути + роль.** Компонент носит префикс из смысловых
   сегментов своего пути (Builder → Shell → Sidebar → …) и читается без пути:
   `builder/canvas/item/components/BuilderCanvasItem.vue`,
   `builder/shell/sidebar/components/BuilderShellSidebarPropertiesView.vue`.
   Технические сегменты (`components/`, `composables/`, `property-editors/`) и сегмент
   `app` в имя не входят (`builder/core/components/BuilderLogo.vue`, не `BuilderCoreLogo`;
   `core` тоже опускается). Дочерние компоненты продолжают цепочку родителя:
   `BuilderCanvasItem` → `BuilderCanvasItemToolbar`.
2. **`The` — только для синглтонов.** Компонент, который монтируется в приложении
   ровно один раз (корень фичи, глобальные модалки): `TheBuilderCanvas.vue`,
   `TheBuilderShellSidebar.vue`, `TheBuilderPublishPagesModal.vue`.
   «Импортируется в одном месте» ≠ синглтон.
3. **Модульные префиксы вместо `Bricks`.** `Bricks*` — только в `ui/` (неймспейс
   переиспользуемого кита); `Block*` (layouts-blocks), `Renderer*` (render),
   `TextEditor*` (text-editor) — модульные префиксы своих доменов. В остальном
   контекст задаёт цепочка из правила 1.
4. **Минимум два слова в имени.** `Grid.vue`, `Text.vue` запрещены. Для `layouts-blocks/`
   сущность — «блок»: `BlockGrid.vue`, `BlockText.vue`.
5. **Модалки — без исключений.** Именуются по той же цепочке:
   `TheBuilderDocumentationModal`, `TheBuilderMediaGalleryModal`,
   `TheBuilderPublishPagesModal`; дети — по цепочке родителя (`BuilderPublishPageCard`).
   (Прежнее «modal-исключение» — именование по содержимому — отменено.)
6. Компонент, используемый 2+ фичами одного поддомена, поднимается в
   `builder/core/components/`: `BuilderLogo.vue`.
7. **Корневой CSS-класс = имя компонента** (CSS Modules, PascalCase): `TheBuilderCanvas.vue` →
   `:class="$style.TheBuilderCanvas"`. Wrapper'ы без собственного корневого элемента
   (корень — чужой компонент или рендер-функция) класса не имеют. Исключение —
   глобальные классы-конвенции билдера (`.bricks-container`, `.bricks-canvas`) не трогаем.

## Композаблы

- `use<Фича><Деталь>`: фичевый префикс — по ближайшей смысловой папке, **без**
  `Builder`-цепочки (`useCanvasItemDrag`, `useSidebarPropertiesPanel`) — в отличие
  от компонентов, контекст композабла задаёт доменная папка. То же для типов
  (`ICanvasItemProps`, `ISidebarPropertyEditorsProps`).
- Для сущностей уровня модуля (схема, конфиг, стили, данные страницы) используется
  `Bricks`: `useBricksConfig`, `useBricksStyles`, `useBricksDataSources`, `IBricksSchema`.
  Как универсальный префикс-шум `Bricks` тоже не использовать
  (`useBricksCanvas` ❌ → `useCanvas` ✅) — контекст задаёт домен/папка.

## Файлы типов и утилит

- Доменные типы — `<домен>/types/*.d.ts`; локальные типы фичи — `types.d.ts` рядом с ней
  (если в файле есть рантайм-код — `types.ts`).
- Имена файлов composables/stores/utils — camelCase (`deviceVisibility.ts`);
  kebab-case — только build-time/CLI-скрипты (`vite-brick-watch.ts`).

## Решение: canvas/shell — поддомены builder, stores остаются в builder/core

Canvas/sidebar/toolbar живут внутри `builder/` (2026-06-12): `builder/canvas/`
(слайсы viewport/item/editing) и `builder/shell/` (sidebar + toolbar). Общие stores
(`components`, `canvas`, `history`, `sidebar`, `navigation`) остаются в
`builder/core/stores/` — это ядро состояния, перенос их в фичевые поддомены дал бы
цикл canvas↔shell (sidebar читает canvas-store, canvas читает sidebar-store);
`publish.ts` — в `builder/publish/stores/` (зависит только от common).
Направление зависимостей: `builder/canvas`/`builder/shell` → `builder/core`,
`builder/app` — composition root, собирает все поддомены. Обратных импортов
из `builder/core` в canvas/shell быть не должно.
