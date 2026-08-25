/**
 * The device glyphs of the set — one per catalog device.
 *
 * A chunk separate from `builderIcons.ts`, because the two load on different
 * surfaces: the builder set is only needed on the builder routes, whereas a device
 * glyph surfaces in the preview banner as well — `builderIcons` is not loaded there
 * at all, and a chosen "laptop" would give an "Icon not found".
 *
 * All four live here and none in the core registry: the entry bundle of a published
 * page would otherwise carry glyphs no published page renders. Nothing races the
 * chunk — `runOnBricksSurface` awaits the install before the render on both entries
 * onto a served surface, the initial bootstrap and the SPA transition from a
 * published page (see `plugins/utils/builderRouteScope.ts`).
 */
// Types
import type { Component } from 'vue';

// Icons: the pack subpath, not the package root — the root is a full barrel
// (`icons/all.js`)
import {
    TaOutlineDeviceDesktop,
    TaOutlineDeviceLaptop,
    TaOutlineDeviceMobile,
    TaOutlineDeviceTablet,
} from '@kalimahapps/vue-icons/ta';

export const DEVICE_ICONS: Record<string, Component> = {
    'ta:outline-device-mobile': TaOutlineDeviceMobile,
    'ta:outline-device-tablet': TaOutlineDeviceTablet,
    'ta:outline-device-laptop': TaOutlineDeviceLaptop,
    'ta:outline-device-desktop': TaOutlineDeviceDesktop,
};
