/**
 * Which chunks a published page is told to prefetch.
 *
 * Vite puts a prefetch hint on every dynamic import of a rendered module, so
 * without this hook a visitor of a published page downloads the whole editor stack
 * while idle. Moving a module out of the entry bundle is only half the saving —
 * the chunk still travels, just later — which is why the icon chunks belong here
 * as well: no published page renders a device glyph, and the two surfaces that do
 * await the chunk through a route gate instead of a background hint.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { Nuxt } from '@nuxt/schema';

// Utils
import { disableNonPublishedChunkPrefetch } from '../../src/module-setup';
// #endregion

// #region Types
interface IManifestEntry {
    prefetch?: boolean;
    imports?: string[];
}
// #endregion

// #region Methods
/**
 * Runs the hook over a manifest and returns it mutated.
 *
 * @param manifest - Fake build manifest.
 * @returns The same manifest, after the hook.
 */
function applyHook(manifest: Record<string, IManifestEntry>): Record<string, IManifestEntry> {
    let captured: ((value: Record<string, IManifestEntry>) => void) | null = null;

    const nuxt = {
        hook: (name: string, callback: (value: Record<string, IManifestEntry>) => void) => {
            if (name === 'build:manifest') {
                captured = callback;
            }
        },
    } as unknown as Nuxt;

    disableNonPublishedChunkPrefetch(nuxt);

    expect(captured).not.toBeNull();
    (captured as unknown as (value: Record<string, IManifestEntry>) => void)(manifest);

    return manifest;
}
// #endregion

describe('prefetch is withheld from the chunks a published page never needs', () => {
    it('both icon chunks lose the hint while a render chunk keeps it', () => {
        const manifest = applyHook({
            '../src/runtime/plugins/icons/deviceIcons.ts': { prefetch: true },
            '../src/runtime/plugins/icons/builderIcons.ts': { prefetch: true },
            '../src/runtime/modules/layouts-blocks/components/BlockSlider.vue': { prefetch: true },
        });

        expect(manifest['../src/runtime/plugins/icons/deviceIcons.ts'].prefetch).toBe(false);
        expect(manifest['../src/runtime/plugins/icons/builderIcons.ts'].prefetch).toBe(false);
        expect(
            manifest['../src/runtime/modules/layouts-blocks/components/BlockSlider.vue'].prefetch
        ).toBe(true);
    });

    it('a vendor chunk an unflagged entry also imports stays prefetchable', () => {
        // Otherwise the shared icon pack would lose the hint for the published page
        // that does render the placeholders out of it
        const manifest = applyHook({
            '../src/runtime/plugins/icons/deviceIcons.ts': {
                prefetch: true,
                imports: ['_vue-icons.hash.js'],
            },
            '../src/runtime/plugins/icons/systemIconsRegistry.ts': {
                prefetch: true,
                imports: ['_vue-icons.hash.js'],
            },
            '_vue-icons.hash.js': { prefetch: true },
        });

        expect(manifest['_vue-icons.hash.js'].prefetch).toBe(true);
    });
});
