/**
 * Правила слоистости доменов src/runtime/modules/ (см. CLAUDE.md → «Направления зависимостей»).
 * Структура 2026-06-12: builder/{app,core,shell,canvas,publish,documentation,media},
 * text-editor, render, layouts-blocks, persistence, ui, common.
 * builder/app — composition root, ограничений не имеет (кроме глобальных правил).
 */
const M = 'src/runtime/modules';

module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'error',
            from: {},
            to: {
                circular: true,
                // легитимная рекурсия Vue-компонентов дерева канваса:
                // BuilderCanvasItem ↔ BuilderCanvasItemLayout, BuilderCanvasItem ↔ BuilderCanvasItemComponent
                viaNot: `^${M}/builder/canvas/item/components/BuilderCanvasItem(Layout|Component)\\.vue$`,
            },
        },
        {
            name: 'common-is-bottom',
            severity: 'error',
            from: { path: `^${M}/common` },
            to: { path: `^${M}/(?!common)` },
        },
        {
            name: 'ui-is-bottom',
            severity: 'error',
            from: { path: `^${M}/ui` },
            to: { path: `^${M}/(?!ui|common)` },
        },
        {
            // render самодостаточен: только common + layouts-blocks, ничего из builder
            name: 'render-lean',
            severity: 'error',
            from: { path: `^${M}/render` },
            to: { path: `^${M}/(?!render|common|layouts-blocks)` },
        },
        {
            // блоки не знают про builder; viewport — через inject(CANVAS_VIEWPORT_KEY)
            name: 'layouts-blocks-deps',
            severity: 'error',
            from: { path: `^${M}/layouts-blocks` },
            to: { path: `^${M}/(?!layouts-blocks|common|ui|text-editor)` },
        },
        {
            name: 'text-editor-deps',
            severity: 'error',
            from: {
                path: `^${M}/text-editor`,
                // tech-debt: useInlineEditor → builder/core/stores/components (кандидат на DI)
                pathNot: `^${M}/text-editor/composables/useInlineEditor\\.ts$`,
            },
            to: { path: `^${M}/(?!text-editor|common|ui)` },
        },
        {
            name: 'text-editor-tech-debt-scope',
            severity: 'error',
            from: { path: `^${M}/text-editor/composables/useInlineEditor\\.ts$` },
            to: { path: `^${M}/(?!text-editor|common|ui|builder/core/stores)` },
        },
        {
            // ядро состояния не знает про фичевые поддомены — иначе цикл canvas↔shell
            name: 'builder-core-deps',
            severity: 'error',
            from: {
                path: `^${M}/builder/core`,
                // tech-debt: useComponentProperties → app/composables/useModals (кандидат на DI)
                pathNot: `^${M}/builder/core/composables/useComponentProperties\\.ts$`,
            },
            to: { path: `^${M}/(?!builder/core|common|ui|layouts-blocks)` },
        },
        {
            name: 'builder-core-tech-debt-scope',
            severity: 'error',
            from: { path: `^${M}/builder/core/composables/useComponentProperties\\.ts$` },
            to: {
                path: `^${M}/(?!builder/core|common|ui|layouts-blocks|builder/app/composables/useModals)`,
            },
        },
        {
            // canvas/shell → core/publish/media + text-editor/layouts-blocks/ui/common;
            // не друг в друга и не в composition root (app)
            name: 'builder-canvas-shell-deps',
            severity: 'error',
            from: { path: `^${M}/builder/(canvas|shell)` },
            to: {
                path: `^${M}/(?!builder/(canvas|shell|core|publish|media)|text-editor|layouts-blocks|ui|common)`,
            },
        },
        {
            name: 'builder-canvas-shell-no-cross',
            severity: 'error',
            from: { path: `^${M}/builder/canvas` },
            to: { path: `^${M}/builder/shell` },
        },
        {
            name: 'builder-shell-no-canvas',
            severity: 'error',
            from: { path: `^${M}/builder/shell` },
            to: { path: `^${M}/builder/canvas` },
        },
        {
            // дашборд /bricks (publish/pages/index.vue) — поверхность-хост:
            // рендерит модалки документации и медиа-галереи (решение фазы 1
            // pages-manager-плана), поэтому media/documentation разрешены
            name: 'builder-publish-deps',
            severity: 'error',
            from: { path: `^${M}/builder/publish` },
            to: {
                path: `^${M}/(?!builder/publish|builder/core|builder/media|builder/documentation|builder/auth|ui|common)`,
            },
        },
        {
            // auth — малый самодостаточный поддомен (страница логина, сессия)
            name: 'builder-auth-deps',
            severity: 'error',
            from: { path: `^${M}/builder/auth` },
            to: { path: `^${M}/(?!builder/auth|ui|common)` },
        },
        {
            name: 'builder-media-deps',
            severity: 'error',
            from: { path: `^${M}/builder/media` },
            to: { path: `^${M}/(?!builder/media|builder/core|ui|common)` },
        },
        {
            name: 'builder-documentation-deps',
            severity: 'error',
            from: { path: `^${M}/builder/documentation` },
            to: { path: `^${M}/(?!builder/documentation|ui|common)` },
        },
        {
            // серверные адаптеры: используются только из src/runtime/server/api/bricks/**
            name: 'persistence-is-server-only',
            severity: 'error',
            from: { path: `^${M}/(?!persistence)` },
            to: { path: `^${M}/persistence` },
        },
        {
            name: 'persistence-deps',
            severity: 'error',
            from: { path: `^${M}/persistence` },
            to: { path: `^${M}/(?!persistence|common)` },
        },
    ],
    options: {
        doNotFollow: { path: 'node_modules' },
        // контрактные типы — часть графа: учитывать type-only импорты
        tsPreCompilationDeps: true,
        tsConfig: { fileName: 'tsconfig.json' },
        enhancedResolveOptions: {
            exportsFields: ['exports'],
            conditionNames: ['import', 'require', 'node', 'default', 'types'],
            extensions: ['.ts', '.mts', '.d.ts', '.js', '.mjs', '.vue'],
        },
        reporterOptions: {
            text: { highlightFocused: true },
        },
    },
};
