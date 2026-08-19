/**
 * Правила слоистости доменов src/runtime/modules/ (см. CLAUDE.md → «Направления зависимостей»).
 * Структура 2026-06-12: builder/{app,core,shell,canvas,publish,documentation,media,users,auth,templates},
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
            // ядро состояния не знает про фичевые поддомены — иначе цикл canvas↔shell.
            // Исключения нет: прежний выход в composition root (панель свойств →
            // фасад модалок) ушёл вместе с самим фасадом — кеш модалок наполняет
            // библиотека компонентов, а панель читает его из core
            name: 'builder-core-deps',
            severity: 'error',
            from: { path: `^${M}/builder/core` },
            to: { path: `^${M}/(?!builder/core|common|ui|layouts-blocks)` },
        },
        {
            // canvas/shell → core/publish/media/auth + text-editor/layouts-blocks/ui/common;
            // не друг в друга и не в composition root (app).
            //
            // auth разрешён с появлением аватара в тулбаре билдера: меню профиля —
            // один компонент на обе поверхности (шапка дашборда и тулбар), и
            // подключить его в тулбар можно либо так, либо слотом из composition
            // root — то есть двумя разными механизмами для одного компонента.
            // Цикла это не создаёт по построению: сам auth ограничен
            // `auth|ui|common` (см. `builder-auth-deps`), поэтому обратного пути
            // из него в shell не существует. `core` в этот список добавлять
            // нельзя — вот там и появился бы цикл canvas↔shell.
            name: 'builder-canvas-shell-deps',
            severity: 'error',
            from: { path: `^${M}/builder/(canvas|shell)` },
            to: {
                path: `^${M}/(?!builder/(canvas|shell|core|publish|media|auth)|text-editor|layouts-blocks|ui|common)`,
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
            // pages-manager-плана), поэтому media/documentation разрешены.
            // `builder/users` — раздел «Пользователи» того же дашборда: он живёт
            // отдельным поддоменом (управление учётками — не публикация), а
            // хостом ему остаётся дашборд. `builder/templates` — так же: раздел
            // «Шаблоны» плюс выбор шаблона в форме создания страницы, и
            // направление у пары одно (publish → templates)
            name: 'builder-publish-deps',
            severity: 'error',
            from: { path: `^${M}/builder/publish` },
            to: {
                path: `^${M}/(?!builder/publish|builder/core|builder/media|builder/documentation|builder/auth|builder/users|builder/templates|ui|common)`,
            },
        },
        {
            // users — раздел учёток дашборда: читает права из core, всё
            // остальное берёт из кита и common. `auth` в список НЕ входит
            // намеренно: свой профиль и чужие учётки — разные вещи, и модалку
            // профиля (свой пароль из своей строки) открывает хост по событию.
            // `publish` тоже: раздел не знает ни о страницах, ни о дашборде —
            // иначе появился бы цикл publish↔users
            name: 'builder-users-deps',
            severity: 'error',
            from: { path: `^${M}/builder/users` },
            to: { path: `^${M}/(?!builder/users|builder/core|ui|common)` },
        },
        {
            // templates — раздел шаблонов дашборда: читает права из core, всё
            // остальное берёт из кита и common. `publish` в список НЕ входит:
            // страницу из шаблона создаёт форма домена публикации, и знание о ней
            // здесь дало бы цикл publish↔templates. Схему страницы-источника
            // собирает вызывающий и передаёт значением
            name: 'builder-templates-deps',
            severity: 'error',
            from: { path: `^${M}/builder/templates` },
            to: { path: `^${M}/(?!builder/templates|builder/core|ui|common)` },
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
