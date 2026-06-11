# Нейминг внутри доменов (`src/runtime/modules/`)

Консолидация выполнена (2026-06-11). Правила действуют для всего нового кода.

## Компоненты

1. **Контекстное наследование от фичевой папки.** Компонент носит префикс своей
   feature-папки и читается без пути: `canvas/CanvasItem.vue`,
   `sidebar/SidebarPropertiesView.vue`, `toolbar/ToolbarVerticalNav.vue`.
   Дочерние компоненты продолжают цепочку родителя: `CanvasItem` → `CanvasItemToolbar`.
2. **`The` — только для синглтонов.** Компонент, который монтируется в приложении
   ровно один раз (корень фичи, глобальные модалки): `TheCanvas.vue`, `TheSidebar.vue`,
   `TheToolbar.vue`, `The*Modal.vue`. «Импортируется в одном месте» ≠ синглтон.
3. **Префикс `Bricks` — только в `ui/`.** UI-кит — единственное место, где префикс несёт
   смысл (неймспейс переиспользуемого кита). В остальных доменах контекст задаёт домен/папка.
4. **Минимум два слова в имени.** `Grid.vue`, `Text.vue` запрещены. Для `layouts-blocks/`
   сущность — «блок»: `BlockGrid.vue`, `BlockText.vue`.
5. **`modal/` — исключение из правила 1:** модалки именуются по содержимому
   (`TheDocumentationModal`, `ConfirmActionModal`), дети — по родителю (`PublishedPageCard`).
6. Компонент, используемый 2+ фичами одного домена, поднимается на уровень домена
   (`builder/components/`) и получает префикс домена: `BuilderLogo.vue`.
7. **Корневой CSS-класс = имя компонента** (CSS Modules, PascalCase): `TheCanvas.vue` →
   `:class="$style.TheCanvas"`. Исключение — классы-конвенции опубликованной страницы
   (`.container` в рендерере) не трогаем.

## Композаблы

- `use<Фича><Деталь>`: фичевый префикс совпадает с компонентным (`useCanvasItemDrag`,
  `useSidebarPropertiesPanel`).
- Слово **`Landing` в идентификаторах запрещено** (полный ребрендинг 2026-06-11).
  Для сущностей уровня модуля (схема, конфиг, стили, данные страницы) используется
  `Bricks`: `useBricksConfig`, `useBricksStyles`, `useBricksDataSources`, `BricksSchema`.
  Как универсальный префикс-шум `Bricks` тоже не использовать
  (`useBricksCanvas` ❌ → `useCanvas` ✅) — контекст задаёт домен/папка.

## Файлы типов и утилит

- Доменные типы — `<домен>/types/*.d.ts`; локальные типы фичи — `types.d.ts` рядом с ней
  (если в файле есть рантайм-код — `types.ts`).
- Имена файлов composables/stores/utils — camelCase (`deviceVisibility.ts`);
  kebab-case — только build-time/CLI-скрипты (`vite-brick-watch.ts`).

## Решение: canvas/sidebar/toolbar — отдельные домены, stores остаются в builder

Canvas/sidebar/toolbar выделены в top-level домены (2026-06-11). Общие stores
(`components`, `canvas`, `history`, `sidebar`, `publish`, `navigation`) остаются в
`builder/stores/` — это ядро состояния, перенос их в фичевые домены дал бы цикл
canvas↔sidebar (sidebar читает canvas-store, canvas читает sidebar-store).
Направление зависимостей: `canvas`/`sidebar`/`toolbar` → `builder` (stores/utils/types),
`builder/pages` — composition root, собирает все три домена. Обратных импортов
из builder-ядра в фичевые домены быть не должно.
