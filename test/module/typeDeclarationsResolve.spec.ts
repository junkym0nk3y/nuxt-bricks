/**
 * The type files are checked THEMSELVES, with no `skipLibCheck`.
 *
 * The main type run stands `skipLibCheck: true` (the tsconfig of Nuxt sets it), and
 * that switches off the checking of what is inside a `.d.ts`. A name used in a type
 * file and not imported into it therefore becomes `any` silently: `vue-tsc` goes
 * green, the fields of the contract stop checking anything at all, and a consumer of
 * the package — who may well have `skipLibCheck` off — gets a `TS2304`.
 *
 * That is exactly what the move of the session cluster out of
 * `builder/app/types/composables.d.ts` into `session.d.ts` did: four names stayed in
 * use with no import, and no green run showed it.
 *
 * Only the diagnostics of resolution are looked at — a name, a module or an export
 * that is not found. A full type check of the `.d.ts` files is not the business of
 * this spec and would drown the answer in noise from other people's types.
 */

// #region Imports
// Node
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Pathe
import { join, relative } from 'pathe';

// TypeScript
import ts from 'typescript';
// #endregion

// #region Data
const SRC_DIR = fileURLToPath(new URL('../../src', import.meta.url));

/**
 * The ways a broken reference inside a `.d.ts` shows up.
 *
 * The missing-export codes matter as much as the missing-name one: a move that
 * leaves `import type { IFoo } from './session'` behind when `session.d.ts` carries
 * no `IFoo` is the same defect arriving through a different door, and under
 * `skipLibCheck` it is just as silent.
 */
const RESOLUTION_ERROR_CODES = new Set([
    2304, // Cannot find name
    2307, // Cannot find module
    2305, // Module has no exported member
    2459, // Module declares the name locally, but it is not exported
    2724, // Module has no exported member named X (a near miss)
    2503, // Cannot find namespace
    2694, // Namespace has no exported member
    2702, // Only refers to a type, but is being used as a namespace here
]);

/**
 * The shapes a forgotten import takes in a `.d.ts`, each in a file of its own so
 * that one failure to parse cannot hide the rest.
 *
 * They exist because a list of codes is a whitelist, and a whitelist goes quietly
 * out of date: `type X = Missing.Member` reports `TS2503`, which the first version
 * of this guard did not carry — it would have gone green over the very defect it was
 * written for. The case below turns that into a red run instead of a silence.
 */
const MISSING_IMPORT_FIXTURES: Record<string, string> = {
    'real.d.ts': `export interface IReal { a: string }
export declare namespace RealNs { interface Inner { b: string } }
`,
    'bare-name.d.ts': 'export type A = Missing;\n',
    'qualified-name.d.ts': 'export type B = MissingNs.Member;\n',
    'missing-module.d.ts': "export type C = import('./nowhere').Whatever;\n",
    'missing-export.d.ts': "import type { INotThere } from './real';\nexport type D = INotThere;\n",
    'unimported-namespace.d.ts': 'export type E = RealNs.Inner;\n',
    'type-as-namespace.d.ts': "import type { IReal } from './real';\nexport type F = IReal.Nope;\n",
    'extends-missing.d.ts': 'export interface G extends AlsoMissing { x: number }\n',
};

/**
 * The options both programs stand: the checking of `.d.ts` bodies switched back ON,
 * which is the very thing this spec exists for.
 *
 * `strict` is deliberately OFF, and it is not a relaxation: not one of the codes
 * looked at depends on it, while switching it on costs a third of the run — and the
 * run is what has to stay inside a ceiling here. Whether the shapes still report
 * without it is not taken on trust: the second case proves it on fixtures.
 */
const PROGRAM_OPTIONS: ts.CompilerOptions = {
    skipLibCheck: false,
    noEmit: true,
    strict: false,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
};
// #endregion

// #region Methods
/**
 * The paths of every type file under `src/`.
 *
 * @param directory - The directory the walk starts at.
 * @returns Absolute paths of the `*.d.ts` files found.
 */
function collectDeclarationFiles(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const entryPath = join(directory, entry.name);

        if (entry.isDirectory()) {
            return collectDeclarationFiles(entryPath);
        }

        return entry.name.endsWith('.d.ts') ? [entryPath] : [];
    });
}
// #endregion

describe('type files resolve every name they use', () => {
    // A TypeScript program of its own is seconds rather than milliseconds, and the
    // default ceiling of vitest does not survive it. The ceiling below is set wide on
    // purpose: the program parses about 900 files (our type files drag the whole
    // runtime in through their imports), and inside a full run — where three hundred
    // spec files share the cores — those seconds multiply. A tight ceiling here buys
    // nothing and turns a busy machine into a red run over code that is fine.
    it('no *.d.ts uses a name it has not imported', () => {
        const declarationFiles = collectDeclarationFiles(SRC_DIR);

        // A walk that found nothing would pass as green
        expect(declarationFiles.length).toBeGreaterThan(20);

        const program = ts.createProgram(declarationFiles, PROGRAM_OPTIONS);

        // Our type files alone, and asked for file by file rather than taken out of
        // `getPreEmitDiagnostics`: that one checks every file of the program, and the
        // program is mostly other people's types dragged in by the imports — the walk
        // took about 40 s that way and timed the spec out under a full run, against
        // about 10 s for the files this guard answers for.
        //
        // The implementation modules pulled in are held by the main run, and they
        // legitimately import things this program knows nothing of — the SFC of a leaf
        // block, for one, which only `vue-tsc` can resolve; the `.d.ts` of dependencies
        // bring in whole optional peers of their own. Judging either here would make
        // the guard red over code it does not answer for, and the way out would be a
        // suppression by substring — which is what would hide a real typo later.
        //
        // Semantic diagnostics only: every code looked at is a semantic one, and a
        // broken syntax in a `.d.ts` is caught by the main type run anyway.
        const offenders = declarationFiles
            .flatMap((filePath) => {
                const sourceFile = program.getSourceFile(filePath);

                return sourceFile ? [...program.getSemanticDiagnostics(sourceFile)] : [];
            })
            .filter((diagnostic) => RESOLUTION_ERROR_CODES.has(diagnostic.code))
            .map((diagnostic) => {
                const fileName = relative(SRC_DIR, diagnostic.file?.fileName ?? '');
                const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');

                return `${fileName}: ${message}`;
            });

        expect(offenders).toEqual([]);
    }, 120000);

    it('the codes looked at cover every shape a forgotten import takes', () => {
        // The case above answers "are our type files clean"; this one answers "would
        // it notice". Without it the guard is a whitelist of codes with nothing
        // checking the whitelist, and a shape TypeScript reports under a code we did
        // not list passes as green — which is how `TS2503` slipped through once.
        const fixtureDir = mkdtempSync(join(tmpdir(), 'bricks-dts-resolve-'));

        try {
            const fixtureFiles = Object.entries(MISSING_IMPORT_FIXTURES).map(
                ([fileName, source]) => {
                    const filePath = join(fixtureDir, fileName);

                    writeFileSync(filePath, source, 'utf8');

                    return filePath;
                }
            );

            const program = ts.createProgram(fixtureFiles, PROGRAM_OPTIONS);
            const diagnostics = fixtureFiles.flatMap((filePath) => {
                const sourceFile = program.getSourceFile(filePath);

                return sourceFile ? [...program.getSemanticDiagnostics(sourceFile)] : [];
            });

            // Every broken fixture has to report something: a shape that stopped being
            // an error at all (a change of the compiler, a typo in the fixture) would
            // otherwise look like coverage
            const brokenFixtures = new Set(
                diagnostics.map((diagnostic) =>
                    relative(fixtureDir, diagnostic.file?.fileName ?? '')
                )
            );

            expect([...brokenFixtures].sort()).toEqual(
                Object.keys(MISSING_IMPORT_FIXTURES)
                    .filter((fileName) => fileName !== 'real.d.ts')
                    .sort()
            );

            const uncovered = diagnostics
                .filter((diagnostic) => !RESOLUTION_ERROR_CODES.has(diagnostic.code))
                .map(
                    (diagnostic) =>
                        `${relative(fixtureDir, diagnostic.file?.fileName ?? '')}: TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
                );

            expect(uncovered).toEqual([]);
        } finally {
            rmSync(fixtureDir, { recursive: true, force: true });
        }
    }, 120000);
});
