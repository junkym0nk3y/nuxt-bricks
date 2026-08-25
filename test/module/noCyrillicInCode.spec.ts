/**
 * Russian text outside the locale files.
 *
 * The package ships two languages, and every string the code holds itself is a
 * string one of the two never gets. The sweep that moved the last of them out found
 * them in places nobody looks at twice — a fallback next to a locale key, a default
 * of a block property, the caption of an empty state — so the guard is a check
 * rather than a habit.
 *
 * What is deliberately allowed:
 *
 * - `locales/ru.json` — the Russian locale itself.
 * - the built-in documentation of the builder: it is written in Russian and is
 *   content, not interface. Markdown is swept along with the code because the local
 *   READMEs next to `composables/` and `utils/` are English by the rules of the
 *   repository, and this documentation is the one exception to that.
 * - the two transliteration tables: their Cyrillic keys are data, and a replacement
 *   by range silently breaks the addresses of pages already published.
 */

// #region Imports
// Node
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Pathe
import { join, relative } from 'pathe';
// #endregion

// #region Data
const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));

/** Extensions of the executable and shipped sources swept for Russian text. */
const SCANNED_EXTENSIONS = ['.ts', '.vue', '.mjs', '.scss', '.json', '.md'];

/**
 * Paths that are allowed to hold Cyrillic, relative to `src`. A directory covers
 * everything under it.
 */
const ALLOWED = [
    'runtime/locales/ru.json',
    'runtime/modules/builder/documentation/docs',
    'runtime/modules/builder/publish/utils/slugify.ts',
    'runtime/modules/common/utils/slug.ts',
];

const CYRILLIC = /[А-Яа-яЁё]/;
// #endregion

// #region Methods
/**
 * Whether the path is on the allow list.
 *
 * @param relativePath - Path relative to `src`.
 * @returns True when Cyrillic is expected there.
 */
function isAllowed(relativePath: string): boolean {
    return ALLOWED.some(
        (allowed) => relativePath === allowed || relativePath.startsWith(`${allowed}/`)
    );
}

/**
 * Collects the scanned files of `src`.
 *
 * @param directory - Absolute path of the directory.
 * @param found - Accumulator of paths relative to `src`.
 * @returns The accumulator.
 */
function collectSources(directory: string, found: string[] = []): string[] {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const entryPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            collectSources(entryPath, found);
            continue;
        }

        if (SCANNED_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
            found.push(relative(SRC_DIR, entryPath));
        }
    }

    return found;
}
// #endregion

describe('src: Russian text lives in the locales, not in the code', () => {
    const sources = collectSources(SRC_DIR);

    it('the sweep actually reaches the sources', () => {
        // An empty selection would make every assertion below pass on a broken walk
        expect(sources.length).toBeGreaterThan(100);
        expect(sources).toContain('runtime/locales/ru.json');
    });

    it('no scanned file outside the allow list holds Cyrillic', () => {
        const offenders = sources
            .filter((relativePath) => !isAllowed(relativePath))
            .filter((relativePath) =>
                CYRILLIC.test(readFileSync(join(SRC_DIR, relativePath), 'utf8'))
            )
            .map((relativePath) => {
                const line = readFileSync(join(SRC_DIR, relativePath), 'utf8')
                    .split('\n')
                    .findIndex((text) => CYRILLIC.test(text));

                return `${relativePath}:${line + 1}`;
            });

        expect(offenders).toEqual([]);
    });

    it('every allowed path still exists', () => {
        const stale = ALLOWED.filter(
            (allowed) => !sources.some((path) => path === allowed || path.startsWith(`${allowed}/`))
        );

        expect(stale).toEqual([]);
    });
});
