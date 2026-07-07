// Vue
import { shallowReactive, type Component } from 'vue';

// Icons: ядро, доступное на published/preview (BlockSvg/BlockMedia placeholders,
// RendererCloseButton, device-переключатель превью)
import {
    TaOutlineDeviceDesktop,
    TaOutlineDeviceMobile,
    TaOutlineDeviceTablet,
    TaOutlinePhoto,
    TaOutlineVideo,
    TaOutlineX,
} from '@kalimahapps/vue-icons/ta';

/**
 * Реестр системных иконок `BricksIcon`. Ядро регистрируется сразу; полный
 * builder-набор доливается через `registerSystemIcons` при заходе на `/bricks`
 * (см. plugins/vue-icons.ts) и не попадает в бандл published-страниц.
 * `shallowReactive` — чтобы уже отрендеренные BricksIcon перерисовались
 * после доливки набора.
 */
const SYSTEM_ICONS: Record<string, Component> = shallowReactive({
    'ta:outline-photo': TaOutlinePhoto,
    'ta:outline-video': TaOutlineVideo,
    'ta:outline-x': TaOutlineX,
    'ta:outline-device-desktop': TaOutlineDeviceDesktop,
    'ta:outline-device-tablet': TaOutlineDeviceTablet,
    'ta:outline-device-mobile': TaOutlineDeviceMobile,
});

/**
 * Возвращает компонент системной иконки по имени.
 *
 * @param name - Имя иконки вида 'prefix:name'.
 * @returns Компонент иконки или undefined, если не зарегистрирована.
 */
export function resolveSystemIcon(name: string): Component | undefined {
    return SYSTEM_ICONS[name];
}

/**
 * Добавляет иконки в реестр (используется lazy-загрузкой builder-набора).
 *
 * @param icons - Мапа «имя → компонент».
 */
export function registerSystemIcons(icons: Record<string, Component>): void {
    Object.assign(SYSTEM_ICONS, icons);
}
