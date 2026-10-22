/**
 * Keys of the client manifest for the modules a published page registers but Rollup
 * bundles into a chunk without a key of its own. Without inlined styles an SSR response
 * links the stylesheets of the module ids it rendered, and an id missing from the
 * manifest linked nothing: a published page came out without the CSS of BlockText.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { Nuxt } from '@nuxt/schema';
import type { OutputBundle } from 'rollup';
import type { ResolvedConfig } from 'vite';
import type { TBricksClientManifest } from '../../src/types/moduleStyleManifest';
// #endregion

// #region Mocks
const { addVitePlugin } = vi.hoisted(() => ({ addVitePlugin: vi.fn() }));

vi.mock('@nuxt/kit', () => ({ addVitePlugin }));
// #endregion

import {
    addComponentManifestKeys,
    createComponentChunkRecorder,
    needsComponentManifestKey,
    setupComponentManifestKeys,
    toChunkManifestKey,
} from '../../src/module-style-manifest';

const ROOT = '/repo/playground';
const RUNTIME = '/repo/src/runtime';
const BLOCK_TEXT = `${RUNTIME}/modules/layouts-blocks/components/BlockText.vue`;
const BLOCK_TEXT_KEY = '../src/runtime/modules/layouts-blocks/components/BlockText.vue';
const BRICK = `${ROOT}/components/cards/Card.brick.ts`;

/** One chunk of a fake client bundle */
interface IFakeChunk {
    type: 'chunk' | 'asset';
    moduleIds?: string[];
    facadeModuleId?: string | null;
}

/**
 * Runs the recorder over a fake client bundle.
 *
 * @param bundle - Chunks of the bundle by file name.
 * @param inlineStyles - The `features.inlineStyles` of the application.
 * @returns The record of the recorder.
 */
function record(
    bundle: Record<string, IFakeChunk>,
    inlineStyles: boolean | ((id?: string) => boolean) = false
): Map<string, string> {
    const chunkByModule = new Map<string, string>();
    const plugin = createComponentChunkRecorder(RUNTIME, inlineStyles, chunkByModule);
    const outputs = Object.fromEntries(
        Object.entries(bundle).map(([fileName, output]) => [
            fileName,
            { facadeModuleId: null, ...output, fileName },
        ])
    );

    (plugin.configResolved as (config: ResolvedConfig) => void)({
        root: ROOT,
    } as ResolvedConfig);
    (plugin.generateBundle as (options: unknown, bundle: OutputBundle) => void)(
        {},
        outputs as unknown as OutputBundle
    );

    return chunkByModule;
}

/**
 * A Nuxt instance with the options the setup reads.
 *
 * @param overrides - Dev flag and inline styles.
 * @returns The instance and the registered hooks.
 */
function createNuxt(overrides: { dev?: boolean; inlineStyles?: unknown } = {}) {
    const hooks = new Map<string, (manifest: TBricksClientManifest) => void>();
    const nuxt = {
        options: {
            dev: overrides.dev ?? false,
            features: { inlineStyles: overrides.inlineStyles ?? false },
        },
        hook: (name: string, callback: (manifest: TBricksClientManifest) => void) => {
            hooks.set(name, callback);
        },
    } as unknown as Nuxt;

    return { nuxt, hooks };
}

beforeEach(() => {
    addVitePlugin.mockClear();
});

describe('needsComponentManifestKey', () => {
    it('takes a component of the package whose styles are linked', () => {
        expect(needsComponentManifestKey(BLOCK_TEXT, ROOT, RUNTIME, false)).toBe(true);
    });

    it('leaves out the parts of an SFC, other files and modules outside the package', () => {
        for (const moduleId of [
            `${BLOCK_TEXT}?vue&type=style&index=0`,
            `${RUNTIME}/modules/render/utils/pageCode.ts`,
            '/repo/src/runtime-extra/Block.vue',
            `${ROOT}/app.vue`,
        ]) {
            expect(needsComponentManifestKey(moduleId, ROOT, RUNTIME, false)).toBe(false);
        }
    });

    it('leaves out a component whose styles Nuxt inlines', () => {
        const inlinesBlockText = (id?: string): boolean => id === BLOCK_TEXT;

        expect(needsComponentManifestKey(BLOCK_TEXT, ROOT, RUNTIME, true)).toBe(false);
        expect(needsComponentManifestKey(BLOCK_TEXT, ROOT, RUNTIME, inlinesBlockText)).toBe(false);
        expect(needsComponentManifestKey(BLOCK_TEXT, ROOT, RUNTIME, () => false)).toBe(true);
    });

    it('asks about a brick file itself whether its styles are inlined', () => {
        const inlinesSfcs = (id?: string): boolean => Boolean(id?.includes('.vue'));

        expect(needsComponentManifestKey(BRICK, ROOT, RUNTIME, false)).toBe(true);
        expect(needsComponentManifestKey(BRICK, ROOT, RUNTIME, () => false)).toBe(true);
        expect(needsComponentManifestKey(BRICK, ROOT, RUNTIME, inlinesSfcs)).toBe(true);
        expect(needsComponentManifestKey(BRICK, ROOT, RUNTIME, () => true)).toBe(false);
        expect(needsComponentManifestKey(`${ROOT}/pages/Card.brick.ts`, ROOT, RUNTIME, false)).toBe(
            false
        );
    });
});

describe('toChunkManifestKey', () => {
    it('spells the key of a chunk the way the manifest plugin of Vite does', () => {
        expect(toChunkManifestKey({ facadeModuleId: BRICK, fileName: '_nuxt/Card.js' }, ROOT)).toBe(
            'components/cards/Card.brick.ts'
        );
        expect(
            toChunkManifestKey({ facadeModuleId: `${ROOT}/\0virtual.ts`, fileName: 'e.js' }, ROOT)
        ).toBe('virtual.ts');
        expect(
            toChunkManifestKey({ facadeModuleId: null, fileName: '_nuxt/BlGcw9r0.js' }, ROOT)
        ).toBe('_BlGcw9r0.js');
    });
});

describe('createComponentChunkRecorder', () => {
    it('records the key of the chunk of every module by its id relative to the Vite root', () => {
        const chunkByModule = record({
            '_nuxt/BlGcw9r0.js': {
                type: 'chunk',
                moduleIds: [
                    BLOCK_TEXT,
                    `${RUNTIME}/modules/common/utils/sanitize/sanitizeRichText.ts`,
                ],
            },
            '_nuxt/Shared.js': { type: 'chunk', moduleIds: [BRICK] },
            '_nuxt/BlockText.css': { type: 'asset' },
        });

        expect([...chunkByModule]).toEqual([
            [BLOCK_TEXT_KEY, '_BlGcw9r0.js'],
            ['components/cards/Card.brick.ts', '_Shared.js'],
        ]);
    });

    it('records nothing when every style is inlined', () => {
        const chunkByModule = record(
            { '_nuxt/a.js': { type: 'chunk', moduleIds: [BLOCK_TEXT, BRICK] } },
            true
        );

        expect(chunkByModule.size).toBe(0);
    });
});

describe('addComponentManifestKeys', () => {
    it('gives a module without a key a copy of the entry of its chunk', () => {
        const manifest = {
            '_BlGcw9r0.js': {
                file: 'BlGcw9r0.js',
                css: ['BlockText.css'],
                imports: ['_shared.js'],
                isDynamicEntry: true,
                prefetch: false,
            },
        } as unknown as TBricksClientManifest;

        addComponentManifestKeys(manifest, new Map([[BLOCK_TEXT_KEY, '_BlGcw9r0.js']]));

        expect(manifest[BLOCK_TEXT_KEY]).toEqual({
            file: 'BlGcw9r0.js',
            css: ['BlockText.css'],
            imports: ['_shared.js'],
            isDynamicEntry: true,
            prefetch: false,
            src: BLOCK_TEXT_KEY,
        });
    });

    it('finds the chunk whose file noScripts has emptied', () => {
        const manifest = {
            '_BlGcw9r0.js': { file: '', css: ['BlockText.css'], resourceType: 'script' },
        } as unknown as TBricksClientManifest;

        addComponentManifestKeys(manifest, new Map([[BLOCK_TEXT_KEY, '_BlGcw9r0.js']]));

        expect(manifest[BLOCK_TEXT_KEY]?.css).toEqual(['BlockText.css']);
    });

    it('shares no array with the entry of the chunk', () => {
        const owner = { file: 'a.js', css: ['a.css'], imports: ['_b.js'], assets: ['a.png'] };
        const manifest = { '_a.js': owner } as unknown as TBricksClientManifest;

        addComponentManifestKeys(manifest, new Map([[BLOCK_TEXT_KEY, '_a.js']]));
        // An application hook that edits the entries in place
        owner.assets.length = 0;
        owner.imports.push('_c.js');

        expect(manifest[BLOCK_TEXT_KEY]?.assets).toEqual(['a.png']);
        expect(manifest[BLOCK_TEXT_KEY]?.imports).toEqual(['_b.js']);
    });

    it('keeps a key the build has already given', () => {
        const own = { file: 'own.js', src: BLOCK_TEXT_KEY, css: ['own.css'] };
        const manifest = {
            [BLOCK_TEXT_KEY]: own,
            '_other.js': { file: 'other.js', css: ['other.css'] },
        } as unknown as TBricksClientManifest;

        addComponentManifestKeys(manifest, new Map([[BLOCK_TEXT_KEY, '_other.js']]));

        expect(manifest[BLOCK_TEXT_KEY]).toBe(own);
    });

    it('skips a module of the entry chunk and a chunk the manifest does not know', () => {
        const manifest = {
            'entry.js': { file: 'entry.js', isEntry: true, css: ['entry.css'] },
        } as unknown as TBricksClientManifest;

        addComponentManifestKeys(
            manifest,
            new Map([
                [BLOCK_TEXT_KEY, 'entry.js'],
                ['../src/runtime/Other.vue', '_missing.js'],
            ])
        );

        expect(Object.keys(manifest)).toEqual(['entry.js']);
    });
});

describe('setupComponentManifestKeys', () => {
    it('stays off in dev and when every style is inlined', () => {
        for (const options of [{ dev: true }, { inlineStyles: true }]) {
            const { nuxt, hooks } = createNuxt(options);

            setupComponentManifestKeys(nuxt, RUNTIME);

            expect(hooks.size).toBe(0);
        }

        expect(addVitePlugin).not.toHaveBeenCalled();
    });

    it('records the client build and adds the keys in the manifest hook', () => {
        const { nuxt, hooks } = createNuxt({ inlineStyles: false });

        setupComponentManifestKeys(nuxt, RUNTIME);

        expect(addVitePlugin).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'nuxt-bricks:component-chunks' }),
            { server: false }
        );

        const plugin = addVitePlugin.mock.calls[0]?.[0];
        plugin.configResolved({ root: ROOT });
        plugin.generateBundle(
            {},
            {
                '_nuxt/BlGcw9r0.js': {
                    type: 'chunk',
                    fileName: '_nuxt/BlGcw9r0.js',
                    facadeModuleId: null,
                    moduleIds: [BLOCK_TEXT],
                },
            }
        );

        const manifest = {
            '_BlGcw9r0.js': { file: 'BlGcw9r0.js', css: ['BlockText.css'] },
        } as unknown as TBricksClientManifest;
        hooks.get('build:manifest')?.(manifest);

        expect(manifest[BLOCK_TEXT_KEY]?.css).toEqual(['BlockText.css']);
    });
});
