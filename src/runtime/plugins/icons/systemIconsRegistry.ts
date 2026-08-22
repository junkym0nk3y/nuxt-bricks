// Vue
import { shallowReactive, type Component } from 'vue';

// Icons: the core available on published/preview (the BlockSvg/BlockMedia
// placeholders, RendererCloseButton, the device switcher of the preview)
import {
    TaOutlineDeviceDesktop,
    TaOutlineDeviceMobile,
    TaOutlineDeviceTablet,
    TaOutlinePhoto,
    TaOutlineVideo,
    TaOutlineX,
} from '@kalimahapps/vue-icons/ta';

/**
 * The registry of the `BricksIcon` system icons. The core is registered right
 * away; the full builder set is topped up through `registerSystemIcons` on a
 * builder route (see plugins/vue-icons.ts) and never enters the bundle of published
 * pages. `shallowReactive` — so that BricksIcon instances already rendered redraw
 * once the set has been topped up.
 */
const SYSTEM_ICONS = shallowReactive<Record<string, Component>>({
    'ta:outline-photo': TaOutlinePhoto,
    'ta:outline-video': TaOutlineVideo,
    'ta:outline-x': TaOutlineX,
    'ta:outline-device-desktop': TaOutlineDeviceDesktop,
    'ta:outline-device-tablet': TaOutlineDeviceTablet,
    'ta:outline-device-mobile': TaOutlineDeviceMobile,
});

/**
 * Returns the component of a system icon by name.
 *
 * @param name - Icon name of the form 'prefix:name'.
 * @returns The icon component, or undefined if it is not registered.
 */
export function resolveSystemIcon(name: string): Component | undefined {
    return SYSTEM_ICONS[name];
}

/**
 * Adds icons to the registry (used by the lazy loading of the builder set).
 *
 * @param icons - A "name → component" map.
 */
export function registerSystemIcons(icons: Record<string, Component>): void {
    Object.assign(SYSTEM_ICONS, icons);
}
