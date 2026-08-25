/**
 * Where the device glyphs live.
 *
 * The glyph of a device is rendered by two surfaces alone — the device editor of
 * the builder and the banner of the preview — and by no published page. Keeping a
 * copy in the core registry therefore only weighed down the entry bundle every
 * published page loads.
 *
 * Nothing races the chunk: `runOnBricksSurface` awaits its install before the
 * render on both ways onto a served surface (the initial bootstrap and the SPA
 * transition from a published page), so a glyph resolved from the chunk alone is
 * present on the first frame.
 */

// #region Imports
// Node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { describe, expect, it } from 'vitest';

// Constants
import {
    DEVICE_ICON_CHOICES,
    DEVICE_ICON_PREFIX,
} from '../../src/runtime/modules/common/constants/devices';
// #endregion

// #region Data
const CHUNK_SOURCE = readFileSync(
    fileURLToPath(new URL('../../src/runtime/plugins/icons/deviceIcons.ts', import.meta.url)),
    'utf8'
);

const CORE_SOURCE = readFileSync(
    fileURLToPath(
        new URL('../../src/runtime/plugins/icons/systemIconsRegistry.ts', import.meta.url)
    ),
    'utf8'
);

const BUILDER_SOURCE = readFileSync(
    fileURLToPath(new URL('../../src/runtime/plugins/icons/builderIcons.ts', import.meta.url)),
    'utf8'
);
// #endregion

describe('device glyphs: the lazy chunk owns every one of them', () => {
    it('the catalog offers glyphs to check', () => {
        // An empty selection would make every assertion below pass on a broken import
        expect(DEVICE_ICON_CHOICES.length).toBeGreaterThan(0);
    });

    it('every glyph the catalog offers is registered by the chunk', () => {
        const missing = DEVICE_ICON_CHOICES.filter(
            (choice) => !CHUNK_SOURCE.includes(`'${DEVICE_ICON_PREFIX}${choice}'`)
        );

        expect(missing).toEqual([]);
    });

    it('no glyph is repeated by the core registry or the builder set', () => {
        const repeated = DEVICE_ICON_CHOICES.filter((choice) => {
            const name = `'${DEVICE_ICON_PREFIX}${choice}'`;

            return CORE_SOURCE.includes(name) || BUILDER_SOURCE.includes(name);
        });

        expect(repeated).toEqual([]);
    });
});
