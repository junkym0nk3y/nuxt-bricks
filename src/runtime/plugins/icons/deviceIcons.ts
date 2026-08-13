/**
 * Глифы устройств набора — по одному на устройство каталога.
 *
 * Отдельным чанком от `builderIcons.ts`, потому что грузятся они на разных
 * поверхностях: builder-набор нужен только на `/bricks`, а глиф устройства
 * всплывает ещё и в баннере превью — там `builderIcons` не загружается вовсе,
 * и выбранный «ноутбук» дал бы «Icon not found».
 *
 * В `systemIconsRegistry.ts` их тоже не кладём: посетителю published-страницы
 * эти иконки не показываются, и в entry-бандл им незачем.
 */
// Types
import type { Component } from 'vue';

// Прямые импорты каждой иконки (избегаем barrel file)
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
