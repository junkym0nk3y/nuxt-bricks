/**
 * Which route gate installs the device glyphs.
 *
 * The glyphs live in a lazy chunk and in no other registry, so the gate that
 * installs it is what keeps the preview banner from rendering an empty icon:
 * `runOnBricksSurface` covers the builder AND the preview, `runOnBuilderRoute`
 * covers the builder alone. Swapping one for the other breaks the preview only —
 * a published page renders no glyph either way, and the builder keeps working, so
 * nothing else in the suite would notice.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { Component } from 'vue';
// #endregion

// #region Data
const hoisted = vi.hoisted(() => ({
    registered: [] as Array<Record<string, Component>>,
    surfaceInstalls: [] as Array<() => Promise<void>>,
    builderRouteInstalls: [] as Array<() => Promise<void>>,
}));
// #endregion

vi.mock('#imports', () => ({
    defineNuxtPlugin: (setup: unknown) => setup,
}));

vi.mock('../../src/runtime/plugins/icons/systemIconsRegistry', () => ({
    registerSystemIcons: (icons: Record<string, Component>) => {
        hoisted.registered.push(icons);
    },
    resolveSystemIcon: () => undefined,
}));

vi.mock('../../src/runtime/plugins/utils/builderRouteScope', () => ({
    runOnBricksSurface: async (install: () => Promise<void>) => {
        hoisted.surfaceInstalls.push(install);
    },
    runOnBuilderRoute: async (install: () => Promise<void>) => {
        hoisted.builderRouteInstalls.push(install);
    },
}));

describe('device glyphs: installed by the gate that covers the preview', () => {
    beforeEach(() => {
        hoisted.registered.length = 0;
        hoisted.surfaceInstalls.length = 0;
        hoisted.builderRouteInstalls.length = 0;
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('the chunk is handed to runOnBricksSurface, not to runOnBuilderRoute', async () => {
        const { default: plugin } = await import('../../src/runtime/plugins/vue-icons');

        await (plugin as unknown as (app: unknown) => Promise<void>)({
            vueApp: { component: () => undefined },
        });

        // Both gates are used by the plugin, so identify the chunk by what it
        // registers rather than by which gate ran
        for (const install of hoisted.surfaceInstalls) {
            await install();
        }

        const surfaceKeys = hoisted.registered.flatMap((icons) => Object.keys(icons));

        expect(surfaceKeys).toContain('ta:outline-device-laptop');
        expect(surfaceKeys).toContain('ta:outline-device-desktop');
    });

    it('the builder-only gate does not carry the glyphs on its own', async () => {
        const { default: plugin } = await import('../../src/runtime/plugins/vue-icons');

        await (plugin as unknown as (app: unknown) => Promise<void>)({
            vueApp: { component: () => undefined },
        });

        for (const install of hoisted.builderRouteInstalls) {
            await install();
        }

        const builderOnlyKeys = hoisted.registered.flatMap((icons) => Object.keys(icons));

        expect(builderOnlyKeys).not.toContain('ta:outline-device-laptop');
    });
});
