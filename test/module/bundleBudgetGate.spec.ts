/**
 * The bundle budget gate: what the script does on a build that is over the budget and
 * on a build it can no longer measure.
 *
 * The reason for the checks is the shape of the failure. A budget of this kind fails
 * silently: the pattern of the editor surface stops matching anything after a domain
 * folder is renamed, the closure comes out empty, the sum is zero, and CI keeps
 * reporting a green surface that is not being measured at all. So both the honest
 * refusal and the empty selection are guarded here, not only the arithmetic.
 */

// #region Imports
// Node
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Vitest
import { afterEach, describe, expect, it } from 'vitest';

// Utils
import { checkBundleBudget } from '../../scripts/bundle-budget.mjs';
// #endregion

// #region Data
const PUBLISHED_PAGE_MODULE = '../src/runtime/modules/render/pages/[pagename].vue';
const EDITOR_MODULE = '../src/runtime/modules/builder/app/pages/builder.vue';

const BUDGETS = { entry: 1, published: 1, editor: 1 };

let outputDir = '';
// #endregion

// #region Methods
/**
 * Content of the given size that gzip cannot shrink. Repeated characters would not do:
 * four hundred kilobytes of one letter compress into a few hundred bytes, and a chunk
 * meant to be over the budget turns out to be under it.
 *
 * The bytes are derived from a hash chain rather than from a random source: the size
 * the gate measures has to be the same on every run.
 *
 * @param size - The number of bytes.
 */
function incompressibleBytes(size: number): Buffer {
    const parts: Buffer[] = [];
    let block = createHash('sha256').update('bundle-budget').digest();

    while (parts.reduce((total, part) => total + part.length, 0) < size) {
        parts.push(block);
        block = createHash('sha256').update(block).digest();
    }

    return Buffer.concat(parts).subarray(0, size);
}

/**
 * Lays out a build the script can read: a manifest module and the chunk files it
 * names.
 *
 * @param manifest - The manifest object to be exported by the module.
 * @param chunks - The content of the chunk files, keyed by file name.
 * @returns The path of the output directory.
 */
function writeBuild(manifest: unknown, chunks: Record<string, string | Buffer>): string {
    outputDir = mkdtempSync(join(tmpdir(), 'bricks-budget-'));

    const manifestDir = join(outputDir, 'server/chunks/build');
    const clientDir = join(outputDir, 'public/_nuxt');
    mkdirSync(manifestDir, { recursive: true });
    mkdirSync(clientDir, { recursive: true });

    writeFileSync(
        join(manifestDir, 'client.precomputed.mjs'),
        `export default ${JSON.stringify(manifest)};\n`
    );

    for (const [file, content] of Object.entries(chunks)) {
        writeFileSync(join(clientDir, file), content);
    }

    return outputDir;
}

/**
 * A manifest of an entry, a published page and one editor module.
 *
 * @param editorKey - The module key of the editor surface.
 */
function buildManifest(editorKey: string = EDITOR_MODULE) {
    const dependencies: Record<
        string,
        { scripts: Record<string, { resourceType: string; file: string }> }
    > = {
        'entry.js': {
            scripts: {
                'entry.js': { resourceType: 'script', file: 'entry.js' },
            },
        },
        [PUBLISHED_PAGE_MODULE]: {
            scripts: {
                [PUBLISHED_PAGE_MODULE]: { resourceType: 'script', file: 'published.js' },
            },
        },
        [editorKey]: {
            scripts: {
                [editorKey]: { resourceType: 'script', file: 'editor.js' },
            },
        },
    };

    return { entrypoints: ['entry.js'], dependencies };
}

/**
 * Runs the gate over a prepared build and collects what it printed.
 *
 * @param dir - The output directory of the build.
 * @param budgets - The budgets of the surfaces.
 */
async function runGate(dir: string, budgets: Record<string, number> = BUDGETS) {
    const messages: string[] = [];
    const errors: string[] = [];

    const code = await checkBundleBudget({
        outputDir: dir,
        budgets,
        log: (message: string) => messages.push(message),
        logError: (message: string) => errors.push(message),
    });

    return { code, messages, errors };
}
// #endregion

afterEach(() => {
    if (outputDir) {
        rmSync(outputDir, { recursive: true, force: true });
        outputDir = '';
    }
});

describe('bundle budget gate', () => {
    it('passes a build that fits every surface', async () => {
        const dir = writeBuild(buildManifest(), {
            'entry.js': 'a',
            'published.js': 'b',
            'editor.js': 'c',
        });

        const { code, messages } = await runGate(dir);

        expect(code).toBe(0);
        expect(messages).toHaveLength(3);
        expect(messages.every((message) => message.includes('OK'))).toBe(true);
    });

    it('refuses a surface that is over its budget', async () => {
        const dir = writeBuild(buildManifest(), {
            'entry.js': 'a',
            'published.js': 'b',
            'editor.js': incompressibleBytes(4 * 1024),
        });

        const { code, messages, errors } = await runGate(dir);

        expect(code).toBe(1);
        expect(
            messages.some(
                (message) => message.includes('editor') && message.includes('OVER BUDGET')
            )
        ).toBe(true);
        expect(errors.some((message) => message.includes('"editor" is over its budget'))).toBe(
            true
        );
    });

    it('counts the editor as the addition over the published surface', async () => {
        const shared = buildManifest();
        // The editor module arrives in the very chunk of the published page: there is
        // nothing of its own left to pay for
        shared.dependencies[EDITOR_MODULE].scripts[EDITOR_MODULE].file = 'published.js';

        const dir = writeBuild(shared, { 'entry.js': 'a', 'published.js': 'b' });

        const { code, errors } = await runGate(dir);

        expect(code).toBe(1);
        expect(errors.some((message) => message.includes('no chunks of its own'))).toBe(true);
    });

    it('refuses a manifest in which the editor surface matches nothing', async () => {
        const dir = writeBuild(buildManifest('../src/runtime/modules/renamed/pages/builder.vue'), {
            'entry.js': 'a',
            'published.js': 'b',
            'editor.js': 'c',
        });

        const { code, errors } = await runGate(dir);

        expect(code).toBe(1);
        expect(errors.some((message) => message.includes('EDITOR_MODULE_PATTERN'))).toBe(true);
    });

    it('refuses a build with no manifest instead of reporting zero', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'bricks-budget-'));
        outputDir = dir;

        const { code, errors } = await runGate(dir);

        expect(code).toBe(1);
        expect(errors.some((message) => message.includes('Manifest missing or empty'))).toBe(true);
    });

    it('refuses a manifest with no route module of a published page', async () => {
        const manifest = buildManifest();
        delete manifest.dependencies[PUBLISHED_PAGE_MODULE];

        const dir = writeBuild(manifest, { 'entry.js': 'a', 'editor.js': 'c' });

        const { code, errors } = await runGate(dir);

        expect(code).toBe(1);
        expect(
            errors.some((message) => message.includes('no route module of a published page'))
        ).toBe(true);
    });
});
