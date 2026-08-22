/**
 * The device glyphs of the set — one per catalog device.
 *
 * A chunk separate from `builderIcons.ts`, because the two load on different
 * surfaces: the builder set is only needed on the builder routes, whereas a device
 * glyph surfaces in the preview banner as well — `builderIcons` is not loaded there
 * at all, and a chosen "laptop" would give an "Icon not found".
 *
 * Three of the four are in the core registry `systemIconsRegistry.ts` already —
 * they are the glyphs of the default project set, which the preview device switcher
 * reaches for; re-registering them here costs nothing. The laptop lives in this
 * chunk alone: a set gets it either from `bricks.devices` at build time or from a
 * page in the builder, and the entry bundle has no business carrying a glyph no
 * published page renders.
 */
// Types
import type { Component } from 'vue';

// Every icon imported by name, but through the package root — and that root is a
// full barrel (`icons/all.js`). The other icon modules take the pack subpath
// (`@kalimahapps/vue-icons/ta`), and this one should follow.
import {
    TaOutlineDeviceDesktop,
    TaOutlineDeviceLaptop,
    TaOutlineDeviceMobile,
    TaOutlineDeviceTablet,
} from '@kalimahapps/vue-icons';

export const DEVICE_ICONS: Record<string, Component> = {
    'ta:outline-device-mobile': TaOutlineDeviceMobile,
    'ta:outline-device-tablet': TaOutlineDeviceTablet,
    'ta:outline-device-laptop': TaOutlineDeviceLaptop,
    'ta:outline-device-desktop': TaOutlineDeviceDesktop,
};
