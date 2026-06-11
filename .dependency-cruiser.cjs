/**
 * Правила слоистости доменов src/runtime/modules/ (см. documents/architecture-cleanup.md).
 * Все правила стартуют с severity: 'warn' — текущие нарушения задокументированы как baseline;
 * по мере выполнения шагов Части A каждое правило флипается в 'error'.
 */
const M = 'src/runtime/modules';

module.exports = {
    forbidden: [
        {
            name: 'no-circular',
            severity: 'error', // A3/A4 выполнены
            from: {},
            to: {
                circular: true,
                // легитимная рекурсия Vue-компонентов дерева канваса:
                // CanvasItem ↔ CanvasItemLayout, CanvasItem ↔ CanvasItemComponent
                viaNot: `^${M}/canvas/components/CanvasItem(Layout|Component)\\.vue$`,
            },
        },
        {
            name: 'ui-is-bottom',
            severity: 'error', // A2 выполнен; ui → common разрешено (common — нижний слой контрактов/утилит)
            from: { path: `^${M}/ui` },
            to: { path: `^${M}/(?!ui|common)` },
        },
        {
            name: 'common-is-bottom',
            severity: 'error', // A1 выполнен
            from: { path: `^${M}/common` },
            to: { path: `^${M}/(?!common)` },
        },
        {
            name: 'render-lean',
            severity: 'error', // A5 выполнен
            from: { path: `^${M}/render` },
            to: { path: `^${M}/(?!render|common|layouts-blocks)` },
        },
        {
            name: 'layouts-blocks-deps',
            severity: 'error', // A6 выполнен
            from: { path: `^${M}/layouts-blocks` },
            to: { path: `^${M}/(?!layouts-blocks|common|ui|editor)` },
        },
        {
            name: 'editor-deps',
            severity: 'error', // A3 выполнен
            from: { path: `^${M}/editor` },
            to: {
                path: `^${M}/(?!editor|common|ui|media|builder/(stores|utils|types|constants)|layouts-blocks)`,
            },
        },
        {
            name: 'builder-core-no-features',
            severity: 'error', // A3 выполнен
            from: { path: `^${M}/builder/(?!pages)` },
            to: { path: `^${M}/(canvas|sidebar|toolbar|editor|render)` },
        },
        {
            name: 'toolbar-deps',
            severity: 'error', // нарушений нет — сразу error
            from: { path: `^${M}/toolbar` },
            to: { path: `^${M}/(?!toolbar|ui|common|builder/components)` },
        },
        {
            name: 'media-deps',
            severity: 'error', // A4 выполнен
            from: { path: `^${M}/media` },
            to: { path: `^${M}/(canvas|sidebar|toolbar|render|editor|builder)` },
        },
        // builder/pages — composition root, может импортировать всё; правило не нужно
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
