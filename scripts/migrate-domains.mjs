#!/usr/bin/env node
/**
 * Одноразовый codemod: перегруппировка src/runtime/ в доменную структуру.
 *
 * Usage:
 *   node scripts/migrate-domains.mjs --dry   # отчёт без изменений, abort при unresolved
 *   node scripts/migrate-domains.mjs         # git mv + переписывание импортов
 *
 * После миграции скрипт удаляется (см. план в documents/refactor.md, Шаг 1).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'src');
const RT = path.join(SRC, 'runtime');
const DRY = process.argv.includes('--dry');

// #region MOVES: каталоги (префиксы) — порядок: длинные раньше
const DIR_MOVES = [
    ['components/ui/', 'ui/'],
    ['components/canvas/', 'builder/components/canvas/'],
    ['components/sidebar/', 'builder/components/sidebar/'],
    ['components/toolbar/', 'builder/components/toolbar/'],
    ['components/builder/', 'builder/components/'],
    ['components/render/', 'render/components/'],
    ['components/layouts/', 'layouts-blocks/components/'],
    ['components/tiptap/', 'editor/components/'],
    ['store/landing/', 'stores/landing/'],
    ['utils/tiptap/', 'editor/tiptap/'],
    ['utils/db/', 'server/utils/db/'],
];
// #endregion

// #region MOVES: отдельные файлы
const FILE_MOVES = {
    // components/modal — расщепляется на 3 домена
    'components/modal/ThePublishedPagesModal.vue': 'builder/components/modal/ThePublishedPagesModal.vue',
    'components/modal/ConfirmActionModal.vue': 'builder/components/modal/ConfirmActionModal.vue',
    'components/modal/PublishedPageCard.vue': 'builder/components/modal/PublishedPageCard.vue',
    'components/modal/TheDocumentationModal.vue': 'builder/components/modal/TheDocumentationModal.vue',
    'components/modal/types.d.ts': 'builder/components/modal/types.d.ts',
    'components/modal/TheMediaGalleryModal.vue': 'media/components/TheMediaGalleryModal.vue',
    'components/modal/TheImageResolverModal.vue': 'media/components/TheImageResolverModal.vue',
    'components/modal/ImageResolverItem.vue': 'media/components/ImageResolverItem.vue',
    'components/modal/TheTextEditorModal.vue': 'editor/components/TheTextEditorModal.vue',

    // composables → builder
    'composables/useCanvasItemActions.ts': 'builder/composables/useCanvasItemActions.ts',
    'composables/useCanvasItemDrag.ts': 'builder/composables/useCanvasItemDrag.ts',
    'composables/useCanvasItemInlineEditing.ts': 'builder/composables/useCanvasItemInlineEditing.ts',
    'composables/useCanvasItemLayout.ts': 'builder/composables/useCanvasItemLayout.ts',
    'composables/useCanvasItemLoader.ts': 'builder/composables/useCanvasItemLoader.ts',
    'composables/useCanvasRemBase.ts': 'builder/composables/useCanvasRemBase.ts',
    'composables/useLandingCanvas.ts': 'builder/composables/useLandingCanvas.ts',
    'composables/useLandingCanvasDrops.ts': 'builder/composables/useLandingCanvasDrops.ts',
    'composables/useLandingCanvasPan.ts': 'builder/composables/useLandingCanvasPan.ts',
    'composables/useComponentProperties.ts': 'builder/composables/useComponentProperties.ts',
    'composables/useComponentSlots.ts': 'builder/composables/useComponentSlots.ts',
    'composables/useDraggableComponent.ts': 'builder/composables/useDraggableComponent.ts',
    'composables/useSlotDragDrop.ts': 'builder/composables/useSlotDragDrop.ts',
    'composables/useSidebarPropertiesPanel.ts': 'builder/composables/useSidebarPropertiesPanel.ts',
    'composables/usePropertyVariants.ts': 'builder/composables/usePropertyVariants.ts',
    'composables/useLandingBuilderPage.ts': 'builder/composables/useLandingBuilderPage.ts',
    'composables/useModals.ts': 'builder/composables/useModals.ts',
    'composables/useDocumentationArticles.ts': 'builder/composables/useDocumentationArticles.ts',
    'composables/useMarkdownRenderer.ts': 'builder/composables/useMarkdownRenderer.ts',
    'composables/usePublishValidationSchema.ts': 'builder/composables/usePublishValidationSchema.ts',
    // composables → render
    'composables/useLandingRendererLayouts.ts': 'render/composables/useLandingRendererLayouts.ts',
    'composables/useLandingRendererStories.ts': 'render/composables/useLandingRendererStories.ts',
    'composables/useLandingDataSources.ts': 'render/composables/useLandingDataSources.ts',
    // composables → layouts-blocks
    'composables/useLandingResponsiveLayoutStyles.ts':
        'layouts-blocks/composables/useLandingResponsiveLayoutStyles.ts',
    'composables/useLandingResponsiveVisibilityStyles.ts':
        'layouts-blocks/composables/useLandingResponsiveVisibilityStyles.ts',
    // composables → editor / media
    'composables/useLandingInlineEditor.ts': 'editor/composables/useLandingInlineEditor.ts',
    'composables/useSchemaImageResolver.ts': 'media/composables/useSchemaImageResolver.ts',

    // stores
    'store/media.ts': 'media/stores/media.ts',
    'store/publish.ts': 'builder/stores/publish.ts',

    // pages
    'pages/builder.vue': 'builder/pages/builder.vue',
    'pages/builder/index.vue': 'builder/pages/index.vue',
    'pages/builder/[pagename].vue': 'builder/pages/[pagename].vue',
    'pages/landing/[pagename].vue': 'render/pages/[pagename].vue',

    // utils/landing — расщепляется
    'utils/landing/history.ts': 'builder/utils/history.ts',
    'utils/landing/layoutProperties.ts': 'builder/utils/layoutProperties.ts',
    'utils/landing/propertyFormatters.ts': 'builder/utils/propertyFormatters.ts',
    'utils/landing/propertyValueCoercion.ts': 'builder/utils/propertyValueCoercion.ts',
    'utils/landing/scrollToComponent.ts': 'builder/utils/scrollToComponent.ts',
    'utils/landing/inlineEditableProp.ts': 'builder/utils/inlineEditableProp.ts',
    'utils/landing/slots.ts': 'builder/utils/slots.ts',
    'utils/landing/inlineContent.ts': 'layouts-blocks/utils/inlineContent.ts',
    'utils/landing/inlineContentTiptap.ts': 'editor/utils/inlineContentTiptap.ts',
    'utils/landing/schemaImageExtractor.ts': 'media/utils/schemaImageExtractor.ts',

    // types — расщепляется
    'types/canvas.d.ts': 'builder/types/canvas.d.ts',
    'types/builder.d.ts': 'builder/types/builder.d.ts',
    'types/builder-drafts.d.ts': 'builder/types/builder-drafts.d.ts',
    'types/sidebarProperties.d.ts': 'builder/types/sidebarProperties.d.ts',
    'types/draggable.d.ts': 'builder/types/draggable.d.ts',
    'types/composables.d.ts': 'builder/types/composables.d.ts',
    'types/modals.d.ts': 'builder/types/modals.d.ts',
    'types/documentation.d.ts': 'builder/types/documentation.d.ts',
    'types/render.d.ts': 'render/types/render.d.ts',
    'types/landing-data-source.d.ts': 'render/types/landing-data-source.d.ts',
    'types/layouts.d.ts': 'layouts-blocks/types/layouts.d.ts',
    'types/media.d.ts': 'media/types/media.d.ts',
    'types/schemaImageResolver.d.ts': 'media/types/schemaImageResolver.d.ts',
    'types/text-editor-toolbar.d.ts': 'editor/types/text-editor-toolbar.d.ts',

    // constants
    'constants/layoutComponents.ts': 'builder/constants/layoutComponents.ts',
};
// #endregion

/** Маппинг абсолютного старого пути файла → абсолютный новый (identity, если не двигается). */
function mapPath(abs) {
    if (!abs.startsWith(RT + path.sep)) {
        return abs;
    }
    const rel = path.relative(RT, abs).split(path.sep).join('/');
    if (FILE_MOVES[rel]) {
        return path.join(RT, FILE_MOVES[rel]);
    }
    for (const [from, to] of DIR_MOVES) {
        if (rel.startsWith(from)) {
            return path.join(RT, to + rel.slice(from.length));
        }
    }
    return abs;
}

/** Все файлы кода в src/ */
function collectFiles(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            collectFiles(p, out);
        } else if (/\.(ts|vue|mjs)$/.test(e.name)) {
            out.push(p);
        }
    }
    return out;
}

/** TS-порядок резолва относительного спецификатора. Возвращает [absFile, addedSuffix] | null. */
function resolveSpec(fromDir, spec) {
    const base = path.resolve(fromDir, spec);
    const probes = ['', '.ts', '.d.ts', '.vue', '.mjs', '/index.ts'];
    for (const suf of probes) {
        const p = base + suf;
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            return [p, suf];
        }
    }
    return null;
}

/** Новый спецификатор: relative от нового каталога файла до нового пути цели, в стиле исходного. */
function rebuildSpec(newFromDir, newTarget, addedSuffix) {
    let target = newTarget;
    // спецификатор был без этого суффикса — убираем его из пути
    if (addedSuffix && addedSuffix !== '') {
        target = target.slice(0, -addedSuffix.length);
    }
    let rel = path.relative(newFromDir, target).split(path.sep).join('/');
    if (!rel.startsWith('.')) {
        rel = './' + rel;
    }
    return rel;
}

// Спецификаторы: from '...', import '...', import('...'), declare module '...'
const SPEC_RE = /(from\s+|import\s+|import\s*\(\s*|declare\s+module\s+)(['"])([^'"]+)\2/g;

const files = collectFiles(SRC);
const moves = [];
const rewrites = new Map(); // abs(old) → [{old, new}]
const errors = [];
const warnings = [];

for (const file of files) {
    const newFile = mapPath(file);
    if (newFile !== file) {
        moves.push([file, newFile]);
    }

    const content = fs.readFileSync(file, 'utf8');
    const fileRewrites = [];
    for (const m of content.matchAll(SPEC_RE)) {
        const spec = m[3];
        if (!spec.startsWith('./') && !spec.startsWith('../')) {
            continue;
        }
        if (spec.includes('*')) {
            warnings.push(`${path.relative(ROOT, file)}: glob-спецификатор пропущен: ${spec}`);
            continue;
        }
        const resolved = resolveSpec(path.dirname(file), spec);
        if (!resolved) {
            errors.push(`${path.relative(ROOT, file)}: не резолвится: ${spec}`);
            continue;
        }
        const [target, addedSuffix] = resolved;
        const newTarget = mapPath(target);
        const newSpec = rebuildSpec(path.dirname(newFile), newTarget, addedSuffix);
        if (newSpec !== spec) {
            fileRewrites.push([spec, newSpec]);
        }
    }
    if (fileRewrites.length) {
        rewrites.set(file, fileRewrites);
    }
}

// Отчёт
console.log(`Файлов просканировано: ${files.length}`);
console.log(`Перемещений: ${moves.length}`);
console.log(`Файлов с переписанными импортами: ${rewrites.size}`);
for (const w of warnings) {
    console.log(`WARN  ${w}`);
}
for (const e of errors) {
    console.log(`ERROR ${e}`);
}
if (errors.length) {
    console.error(`\nAbort: ${errors.length} нерезолвящихся импортов. Ничего не изменено.`);
    process.exit(1);
}

if (DRY) {
    for (const [from, to] of moves) {
        console.log(`MV ${path.relative(ROOT, from)} -> ${path.relative(ROOT, to)}`);
    }
    for (const [file, rws] of rewrites) {
        console.log(`RW ${path.relative(ROOT, file)}`);
        for (const [o, n] of rws) {
            console.log(`     ${o} -> ${n}`);
        }
    }
    console.log('\n--dry: изменения не применены.');
    process.exit(0);
}

// Применение: git mv, затем переписывание содержимого по новым путям
for (const [from, to] of moves) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    execFileSync('git', ['mv', from, to], { cwd: ROOT });
}
for (const [file, rws] of rewrites) {
    const target = mapPath(file);
    let content = fs.readFileSync(target, 'utf8');
    for (const [o, n] of rws) {
        content = content.split(`'${o}'`).join(`'${n}'`).split(`"${o}"`).join(`"${n}"`);
    }
    fs.writeFileSync(target, content);
}
console.log('Готово. Удалите пустые каталоги: find src/runtime -type d -empty -delete');
