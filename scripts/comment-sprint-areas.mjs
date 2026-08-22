/**
 * Sprint scope: which files the sprint looks at, which stage owns each of them,
 * and which paths it deliberately never touches.
 *
 * This is the file edited as the sprint advances — flipping `done: true` on a
 * closed stage turns its area into a gating one, so a Russian comment coming
 * back there fails the check instead of quietly joining the backlog.
 */

import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Repository-relative paths of tracked and untracked-but-not-ignored files.
 *
 * @param {{ untrackedOnly?: boolean }} [options] - Restrict to untracked files.
 * @returns {string[]} Paths.
 */
export function listFiles(options = {}) {
    const flags = options.untrackedOnly ? ['-o'] : ['-c', '-o'];
    const output = execFileSync('git', ['ls-files', ...flags, '--exclude-standard', '-z'], {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });

    return output.split('\0').filter(Boolean);
}

/**
 * Standalone stylesheets of the package.
 *
 * "A style section carries no comments" was written for the `<style>` of an SFC,
 * where the rationale has a `<script>` next to it to move into. These files have no
 * script: they are the style layer itself, and their rationale — the two reset zones,
 * the z-index ladder, why a transition is shaped the way it is — owns no other home.
 * By the owner's decision it stays where it is, in English, instead of being deleted.
 * Vendored `normalize.css` lives here too, carrying the MIT attribution the license
 * requires to travel with the code.
 *
 * Translation is not waived: a Cyrillic comment in these files still fails the check.
 */
const STANDALONE_STYLESHEETS = 'src/runtime/assets/scss/';

/**
 * Whether a file may keep prose comments in a markup or style section.
 *
 * @param {string} path - Repository-relative path.
 * @returns {boolean} True when prose comments are allowed to stay.
 */
export function isMarkupCommentAllowed(path) {
    return path.startsWith(STANDALONE_STYLESHEETS);
}

/**
 * Files whose template literals must lose their Cyrillic too.
 *
 * Cyrillic inside a template literal is not a comment, so it is informational
 * by default — a test fixture is allowed to be Russian. In these four it is
 * generated output instead: `module-scss.ts` writes its header into a SCSS file
 * **inside the consumer project**, the two `*Css.ts` emit generated CSS, and the
 * adapter embeds SQL comments. Leaving them out of the gate would let a stage
 * close with the most visible Russian text in the package still shipping.
 */
export const LITERAL_GATED = new Set([
    'src/module-scss.ts',
    'src/runtime/modules/common/utils/bricks/containerCss.ts',
    'src/runtime/modules/layouts-blocks/utils/deviceVisibilityCss.ts',
    'src/runtime/modules/persistence/server/postgres/postgresAuthAdapter.ts',
]);

/**
 * Developer messages that stay Russian by decision, keyed by path: the value is
 * the exact literal as the scanner reports it, because line numbers drift with
 * the first edit of a file.
 *
 * The one entry is the `description` of a `createError`, and it is the only
 * translatable text in the sprint that leaves the process: it travels in the
 * HTTP response body and a consumer application may render it to an end user.
 * Rewriting it in English would be a change of product text, which this sprint
 * does not make — so it is recorded as i18n debt in the findings instead. The
 * exception is named here rather than left implicit, otherwise the stage could
 * not close and the next reader would take it for missed work.
 */
export const MESSAGE_KEPT_RUSSIAN = new Map([
    [
        'src/runtime/server/utils/bricksComponents.ts',
        new Set(["'Убедитесь, что brick-файлы этой категории существуют в components/'"]),
    ],
]);

/**
 * Sprint areas, in the order stages run. `done: true` makes the area gating:
 * once a stage is closed, any Cyrillic comment coming back fails the check.
 *
 * `match` is tried top to bottom and the first hit wins, so narrow paths
 * (`builder/core`) must precede wide ones (`src/runtime/modules`).
 */
export const AREAS = [
    {
        id: '1',
        title: 'common',
        done: true,
        // `runtime/types.d.ts` is a one-line re-export of the common types
        // barrel, so it belongs to this area rather than to the build-time layer
        match: ['src/runtime/modules/common/', 'src/runtime/types.d.ts'],
    },
    { id: '2', title: 'ui', done: true, match: ['src/runtime/modules/ui/'] },
    {
        id: '3',
        title: 'layouts-blocks',
        done: true,
        match: ['src/runtime/modules/layouts-blocks/'],
    },
    { id: '4', title: 'text-editor', done: true, match: ['src/runtime/modules/text-editor/'] },
    { id: '5', title: 'render', done: true, match: ['src/runtime/modules/render/'] },
    { id: '6', title: 'persistence', done: true, match: ['src/runtime/modules/persistence/'] },
    { id: '7', title: 'server', done: true, match: ['src/runtime/server/'] },
    {
        id: '8',
        title: 'plugins + middleware + cli',
        done: true,
        match: [
            'src/runtime/plugins/',
            'src/runtime/middleware/',
            'src/runtime/layouts/',
            'src/cli/',
        ],
    },
    {
        id: '9',
        title: 'build-time src',
        done: true,
        match: ['src/types/', 'src/'],
        onlyDepth: true,
    },
    { id: '10', title: 'assets/scss', done: true, match: ['src/runtime/assets/'] },
    { id: '11', title: 'builder/core', done: true, match: ['src/runtime/modules/builder/core/'] },
    {
        id: '12',
        title: 'builder/canvas',
        done: true,
        match: ['src/runtime/modules/builder/canvas/'],
    },
    {
        id: '13',
        title: 'builder/shell',
        done: true,
        match: ['src/runtime/modules/builder/shell/'],
    },
    { id: '14', title: 'builder/auth', done: true, match: ['src/runtime/modules/builder/auth/'] },
    {
        id: '15',
        title: 'builder/users',
        done: true,
        match: ['src/runtime/modules/builder/users/'],
    },
    {
        id: '16',
        title: 'builder/media',
        done: true,
        match: ['src/runtime/modules/builder/media/'],
    },
    {
        id: '17',
        title: 'builder/templates + documentation',
        done: false,
        match: [
            'src/runtime/modules/builder/templates/',
            'src/runtime/modules/builder/documentation/',
        ],
    },
    {
        id: '18',
        title: 'builder/publish',
        done: false,
        match: ['src/runtime/modules/builder/publish/'],
    },
    { id: '19', title: 'builder/app', done: false, match: ['src/runtime/modules/builder/app/'] },
    { id: '20', title: 'local README.md', done: false, match: [], markdown: true },
    {
        id: '21+22',
        title: 'test',
        // Stages 21 (comments) and 22 (case titles) walk the same tree and close
        // one after the other, so `done` lists the metrics already closed
        done: false,
        match: ['test/'],
    },
    {
        id: '23',
        title: 'scripts + configs + e2e + playground',
        done: false,
        match: ['scripts/', 'e2e/', 'playground/', '.github/'],
        rootConfigs: true,
    },
    { id: '24', title: 'migrations', done: false, match: ['migrations/'] },
];

/**
 * Paths excluded from the scan entirely: product text, owner documentation and
 * generated output. Comments here are out of the sprint's scope by decision,
 * not by oversight, so they must not show up as remaining work.
 */
const EXCLUDED = [
    'docs/',
    '.claude/',
    '.playwright-mcp/',
    'src/runtime/locales/',
    'src/runtime/modules/builder/documentation/docs/guide/',
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'PAPERCUTS.md',
];

const SCANNED_EXTENSIONS = new Set([
    'ts',
    'js',
    'mjs',
    'cjs',
    'vue',
    'scss',
    'css',
    'sql',
    'yml',
    'yaml',
    'md',
]);

/**
 * Files with comments but no extension. Deciding scope by extension alone left
 * `.gitattributes` (two Russian comment lines counted by the plan) out of the
 * scan entirely.
 */
const SCANNED_BASENAMES = new Set([
    '.gitattributes',
    '.gitignore',
    '.npmrc',
    '.nuxtrc',
    '.nvmrc',
    '.prettierignore',
    '.stylelintignore',
    '.editorconfig',
    '.dockerignore',
]);

/**
 * Whether a path is of a type the scanner can read.
 *
 * @param {string} path - Repository-relative path.
 * @returns {boolean} The file can be scanned for comments.
 */
export function isScannedPath(path) {
    const name = path.slice(path.lastIndexOf('/') + 1);

    return SCANNED_EXTENSIONS.has(name.split('.').pop()) || SCANNED_BASENAMES.has(name);
}

/**
 * Whether the sprint deliberately never touches a path.
 *
 * @param {string} path - Repository-relative path.
 * @returns {boolean} The path is out of the sprint's scope by decision.
 */
export function isExcluded(path) {
    return EXCLUDED.some((prefix) => path === prefix || path.startsWith(prefix));
}

/**
 * The sprint area owning a path, or null when no stage claims it.
 *
 * @param {string} path - Repository-relative path.
 * @returns {object | null} Area descriptor.
 */
export function resolveArea(path) {
    if (isExcluded(path)) {
        return null;
    }

    if (path.endsWith('/README.md') || path === 'test/README.md') {
        return AREAS.find((area) => area.markdown);
    }

    if (path.endsWith('.md')) {
        return null;
    }

    for (const area of AREAS) {
        for (const prefix of area.match) {
            if (!path.startsWith(prefix)) {
                continue;
            }

            // Stage 9 owns the build-time layer only: `src/*.ts` and
            // `src/types/**`, never the runtime tree that sits below it
            if (area.onlyDepth && prefix === 'src/' && path.slice(4).includes('/')) {
                continue;
            }

            return area;
        }
    }

    if (!path.includes('/') && isScannedPath(path)) {
        return AREAS.find((area) => area.rootConfigs);
    }

    return null;
}
