# Composables

Композаблы распределены по доменам (см. `documents/refactor.md`): здесь, в `common/composables/`,
живут только общие (используются 2+ доменами). Доменные — рядом со своим кодом.

## common/composables/ (общие)

| Composable         | Описание                                                                  |
| ------------------ | ------------------------------------------------------------------------- |
| `useLandingConfig` | Конфигурация лендинга с дефолтными значениями. Читает из `app.config.ts`  |
| `useApiClient`     | Работа с API через прокси или напрямую                                    |
| `useStoryImports`  | Динамический импорт story-файлов компонентов                              |
| `useLandingStyles` | Инъекция динамических стилей лендинга в `<head>` (override `.container`)  |

## Доменные композаблы

| Где                           | Что                                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `builder/composables/`        | `useCanvas{,Pan,Drops}`, `useCanvasItem*`, `useCanvasRemBase`, `useDraggableComponent`, `useSlotDragDrop`, `useComponent{Properties,Slots}`, `usePropertyVariants`, `useSidebarPropertiesPanel`, `useBuilderPage`, `useModals`, `useDocumentationArticles`, `useMarkdownRenderer`, `usePublishValidationSchema` |
| `render/composables/`         | `useLandingRenderer{Layouts,Stories}`, `useLandingDataSources`                                                                                                                                                                                                                                                                 |
| `layouts-blocks/composables/` | `useResponsive{Layout,Visibility}Styles`                                                                                                                                                                                                                                                                                       |
| `editor/composables/`         | `useInlineEditor`                                                                                                                                                                                                                                                                                                              |
| `media/composables/`          | `useSchemaImageResolver`                                                                                                                                                                                                                                                                                                       |

## Правила

1. **Интерфейсы** хранятся в `*/types/composables.d.ts` (builder) или `common/types/`, не инлайн в файлах
2. **Комментарии** на русском языке
3. **JSDoc** обязателен для всех публичных функций
4. **#region** комментарии для группировки кода
5. Новый композабл кладётся в домен-потребитель; в `common/` — только при использовании из 2+ доменов
