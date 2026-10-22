/**
 * Keys of the client manifest for the modules a published page registers but Rollup
 * bundles into a chunk without a key of its own.
 *
 * Without inlined styles (`features.inlineStyles: false`) an SSR response links the
 * stylesheets of exactly the modules it rendered: every SFC registers its id — the path
 * relative to the Vite root — in `ssrContext.modules`, the published renderer adds the
 * brick files it rendered, and the renderer of Nuxt looks the ids up among the keys of
 * the client manifest. A key exists for an entry and for the facade module of a dynamic
 * import. A leaf block is imported lazily by a published page and statically by the
 * builder canvas, and Rollup may put it into a shared chunk with no facade at all —
 * BlockText lands there — so its stylesheet was never linked, and the published page
 * came out without the CSS of the block until the hydration. A brick file the consumer
 * also imports statically can end up the same way.
 *
 * The client build records the chunk of every such module — a component of the package
 * or a brick file — and the manifest hook gives each one that has no key a copy of the
 * entry of its chunk under its own id. The hook is registered after the one that turns
 * prefetch off for builder chunks, so a copy inherits the hints of its chunk as they
 * finally are. Nothing is added for a module whose styles Nuxt inlines: the key would
 * link the same rules a second time. A per-module `inlineStyles` function is asked about
 * the brick file itself, since which SFC a brick renders is unknown at build time; under
 * the default function, which inlines SFCs alone, a brick that lost its key may get its
 * rules both inlined and linked — a duplicate, while the alternative is a brick that
 * imports a plain stylesheet coming out without it.
 */
import { addVitePlugin } from '@nuxt/kit';
import type { Nuxt } from '@nuxt/schema';
import { basename, relative } from 'pathe';
import type { OutputChunk } from 'rollup';
import type { Plugin } from 'vite';
import { isBrickFilePath } from './bricks-manifest';
import type { TBricksClientManifest, TBricksInlineStyles } from './types/moduleStyleManifest';

/** The main module of an SFC: its style and template parts carry a query */
const VUE_MODULE_PATTERN = /\.vue$/;

/**
 * Whether a module of the client build needs a key of its own.
 *
 * @param moduleId - Absolute id of the module.
 * @param root - Root of the Vite build, the `srcDir` of the application.
 * @param runtimeDir - Absolute path of the runtime of the package.
 * @param inlineStyles - The `features.inlineStyles` of the application.
 * @returns Whether the module is a brick file or a component of the package whose styles
 * are left to links.
 */
export function needsComponentManifestKey(
    moduleId: string,
    root: string,
    runtimeDir: string,
    inlineStyles: TBricksInlineStyles
): boolean {
    const isPackageComponent =
        moduleId.startsWith(`${runtimeDir}/`) && VUE_MODULE_PATTERN.test(moduleId);

    if (!isPackageComponent && !isBrickFilePath(root, moduleId)) {
        return false;
    }

    return typeof inlineStyles === 'function' ? !inlineStyles(moduleId) : !inlineStyles;
}

/**
 * Key of a chunk in the client manifest, spelled the way the manifest plugin of Vite
 * spells it: the path of the facade module relative to the root, or the file name behind
 * an underscore for a chunk without one. The key and not the file name identifies the
 * chunk: with `features.noScripts` Nuxt empties the file of every script entry before
 * the hooks of the modules run.
 *
 * @param chunk - The output chunk.
 * @param root - Root of the Vite build.
 * @returns The key of the chunk.
 */
export function toChunkManifestKey(
    chunk: Pick<OutputChunk, 'facadeModuleId' | 'fileName'>,
    root: string
): string {
    return chunk.facadeModuleId
        ? relative(root, chunk.facadeModuleId).replaceAll('\0', '')
        : `_${basename(chunk.fileName)}`;
}

/**
 * Adds a key for every recorded module the manifest has none for: a copy of the entry
 * of the chunk the module was bundled into. A module of the entry chunk is skipped — the
 * entry is linked on every page anyway, and a copy would declare a second entry.
 *
 * The copy is deep: an application may have a `build:manifest` hook of its own that
 * edits every entry, and a copy sharing its arrays with the entry of the chunk would take
 * such an edit twice or not at all depending on the order of the hooks.
 *
 * @param manifest - The client manifest, changed in place.
 * @param chunkByModule - Key of the chunk by the key of each recorded module.
 */
export function addComponentManifestKeys(
    manifest: TBricksClientManifest,
    chunkByModule: ReadonlyMap<string, string>
): void {
    for (const [key, chunkKey] of chunkByModule) {
        const owner = manifest[chunkKey];

        if (manifest[key] || !owner || owner.isEntry) {
            continue;
        }

        manifest[key] = { ...structuredClone(owner), src: key };
    }
}

/**
 * The client-build plugin that records the chunk of every module needing a key.
 *
 * @param runtimeDir - Absolute path of the runtime of the package.
 * @param inlineStyles - The `features.inlineStyles` of the application.
 * @param chunkByModule - The record to fill, key of the chunk by the key of a module.
 * @returns The Vite plugin.
 */
export function createComponentChunkRecorder(
    runtimeDir: string,
    inlineStyles: TBricksInlineStyles,
    chunkByModule: Map<string, string>
): Plugin {
    let root = '';

    return {
        name: 'nuxt-bricks:component-chunks',
        apply: 'build',
        configResolved(config) {
            root = config.root;
        },
        generateBundle(_options, bundle) {
            for (const output of Object.values(bundle)) {
                if (output.type !== 'chunk') {
                    continue;
                }

                for (const moduleId of output.moduleIds) {
                    if (needsComponentManifestKey(moduleId, root, runtimeDir, inlineStyles)) {
                        chunkByModule.set(
                            relative(root, moduleId),
                            toChunkManifestKey(output, root)
                        );
                    }
                }
            }
        },
    };
}

/**
 * Gives the modules a published page registers their keys in the client manifest of a
 * build that links styles instead of inlining them.
 *
 * @param nuxt - Nuxt instance.
 * @param runtimeDir - Absolute path of the runtime of the package.
 */
export function setupComponentManifestKeys(nuxt: Nuxt, runtimeDir: string): void {
    const { inlineStyles } = nuxt.options.features;

    if (nuxt.options.dev || inlineStyles === true) {
        return;
    }

    const chunkByModule = new Map<string, string>();

    addVitePlugin(createComponentChunkRecorder(runtimeDir, inlineStyles, chunkByModule), {
        server: false,
    });
    nuxt.hook('build:manifest', (manifest) => {
        addComponentManifestKeys(manifest, chunkByModule);
    });
}
