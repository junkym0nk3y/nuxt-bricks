/**
 * Every executable file of the package stands under a coverage threshold.
 *
 * The thresholds are listed per directory, and the list names the directories that
 * exist today. A domain added tomorrow lands in the report through `include` but
 * under no threshold at all — that is, it may sit at zero percent while the gate
 * stays green, which is the one failure the per-directory split was introduced to
 * prevent.
 *
 * Checked here is the map rather than the numbers: for every `.ts`/`.vue` under
 * `src/` there is a glob in the config that covers it. Whether the numbers are
 * high enough is the business of the coverage run itself.
 *
 * One thing about the numbers is checked all the same — their sign. Functions and
 * branches are capped in entities (a negative threshold), not in percent, because
 * on a glob of fourteen functions one uncovered function costs seven points and the
 * percentage ends up measuring how the code is decomposed rather than what the
 * suite proves. That is not a preference but a repair: measured in percent, these
 * two metrics had gone red on refactorings that removed no test at all. The
 * decision lives in a comment in the config, and a comment cannot stop a
 * well-meaning hand from writing `functions: 78.3` back.
 */

// #region Imports
// Node
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Pathe
import { join, relative } from 'pathe';

// Config under test
import vitestConfig from '../../vitest.config';
// #endregion

// #region Interfaces
// The coverage options of vitest are a union over the providers, and `thresholds`
// lives on the branches rather than on the union — the config is read here through
// the shape this spec actually needs
interface ICoverageWithThresholds {
    thresholds?: Record<string, Record<string, unknown>>;
}
// #endregion

// #region Data
const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));
const REPO_DIR = fileURLToPath(new URL('../..', import.meta.url));

/** Files the coverage run does not measure: types carry no executable code */
const SKIPPED_SUFFIXES = ['.d.ts'];
// #endregion

// #region Methods
/**
 * Collects the executable sources of the package.
 *
 * @param directory - Absolute path to walk.
 * @returns Repo-relative paths with forward slashes.
 */
function collectSources(directory: string): string[] {
    const found: string[] = [];

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);

        if (entry.isDirectory()) {
            found.push(...collectSources(path));
            continue;
        }

        if (!/\.(ts|vue)$/.test(entry.name)) {
            continue;
        }

        if (SKIPPED_SUFFIXES.some((suffix) => entry.name.endsWith(suffix))) {
            continue;
        }

        found.push(relative(REPO_DIR, path));
    }

    return found;
}

/**
 * The threshold glob a source file is expected to fall under.
 *
 * The rules repeat the split of the config: the build-time layer, the server, the
 * runtime shell outside the modules, a domain of the runtime, a subdomain of the
 * builder. A file that fits none of them is exactly the case this spec guards —
 * there the answer is null and the assertion names the file.
 *
 * @param file - Repo-relative path of the source.
 * @returns The glob expected in the config, or null.
 */
function expectedGlob(file: string): string | null {
    if (/^src\/[^/]+\.ts$/.test(file)) {
        return 'src/*.ts';
    }

    if (file.startsWith('src/runtime/server/')) {
        return 'src/runtime/server/**';
    }

    if (/^src\/runtime\/(middleware|plugins|layouts)\//.test(file)) {
        return 'src/runtime/{middleware,plugins,layouts}/**';
    }

    const builderMatch = file.match(/^src\/runtime\/modules\/builder\/([^/]+)\//);
    if (builderMatch) {
        return `src/runtime/modules/builder/${builderMatch[1]}/**`;
    }

    const moduleMatch = file.match(/^src\/runtime\/modules\/([^/]+)\//);
    if (moduleMatch) {
        return `src/runtime/modules/${moduleMatch[1]}/**`;
    }

    return null;
}
// #endregion

describe('coverage thresholds: the map has no holes', () => {
    it('covers every executable source with a threshold of its own', () => {
        const coverage = vitestConfig.test?.coverage as ICoverageWithThresholds | undefined;
        const globs = new Set(Object.keys(coverage?.thresholds ?? {}));
        const uncovered: string[] = [];

        for (const file of collectSources(SRC_DIR)) {
            const glob = expectedGlob(file);

            if (glob === null || !globs.has(glob)) {
                uncovered.push(`${file} → ${glob ?? 'no rule'}`);
            }
        }

        expect(uncovered).toEqual([]);
    });

    it('caps functions and branches in entities rather than in percent', () => {
        const coverage = vitestConfig.test?.coverage as ICoverageWithThresholds | undefined;
        const wrongUnit: string[] = [];

        for (const [glob, values] of Object.entries(coverage?.thresholds ?? {})) {
            for (const metric of ['functions', 'branches']) {
                const value = values[metric];

                if (typeof value !== 'number' || value >= 0) {
                    wrongUnit.push(`${glob}.${metric} = ${String(value)}`);
                }
            }
        }

        expect(wrongUnit).toEqual([]);
    });

    it('lists no threshold for a directory that no longer exists', () => {
        const coverage = vitestConfig.test?.coverage as ICoverageWithThresholds | undefined;
        const used = new Set(
            collectSources(SRC_DIR)
                .map((file) => expectedGlob(file))
                .filter((glob): glob is string => glob !== null)
        );

        expect(Object.keys(coverage?.thresholds ?? {}).filter((glob) => !used.has(glob))).toEqual(
            []
        );
    });
});
