// #region Imports
// Pinia
import { createPinia, setActivePinia } from 'pinia';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { TBricksResolvedDeviceSet } from '../../src/runtime/modules/common/types/devices';
// #endregion

vi.mock('nuxt/app', () => ({
    useAppConfig: vi.fn(() => ({})),
}));

// Stores
import { useCanvasStore } from '../../src/runtime/modules/builder/core/stores/canvas';

/**
 * Собирает резолвнутый набор устройств.
 *
 * @param devices - Ключ, ширина, высота листа и подпись каждой записи.
 * @returns Набор в форме, которую кладёт в стор composition root.
 */
function buildDevices(
    devices: Array<{ key: string; width: number; height?: number; label?: string }>
): TBricksResolvedDeviceSet {
    return devices.map((device) => ({
        key: device.key,
        label: device.label ?? device.key,
        icon: 'device-desktop',
        width: device.width,
        aside: 1.2,
        remBase: '10px',
        canvasHeight: device.height ?? 1080,
    }));
}

const THREE_DEVICES = buildDevices([
    { key: 'mobile', width: 375, height: 812 },
    { key: 'tablet', width: 768, height: 1024 },
    { key: 'desktop', width: 1600, height: 1080 },
]);

describe('canvas store: набор устройств страницы', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('размеры листа берутся из набора, а не из прежних дефолтов', () => {
        const canvasStore = useCanvasStore();

        canvasStore.setDevices(THREE_DEVICES);
        canvasStore.setViewport('tablet');

        expect(canvasStore.width).toBe(768);
        expect(canvasStore.height).toBe(1024);
    });

    it('правка ширины снимает ручной зум: под прежние размеры он больше не подходит', () => {
        // Без этого лист меняет размер, а авто-фит не срабатывает — ставший шире
        // лист (и особенно четыре листа Figma-режима) остаётся обрезанным до
        // ручного вмешательства
        const canvasStore = useCanvasStore();
        canvasStore.setDevices(THREE_DEVICES);
        canvasStore.setManualCanvasScale(0.75);

        canvasStore.setDevices(
            buildDevices([
                { key: 'mobile', width: 375, height: 812 },
                { key: 'tablet', width: 900, height: 1024 },
                { key: 'desktop', width: 1600, height: 1080 },
            ])
        );

        expect(canvasStore.hasManualZoom).toBe(false);
    });

    it('правка подписи ручной зум сохраняет: геометрия не изменилась', () => {
        // Иначе каждый символ, введённый в поле имени устройства, сбрасывал бы
        // масштаб, подобранный пользователем
        const canvasStore = useCanvasStore();
        canvasStore.setDevices(THREE_DEVICES);
        canvasStore.setManualCanvasScale(0.75);

        canvasStore.setDevices(
            buildDevices([
                { key: 'mobile', width: 375, height: 812, label: 'Телефон' },
                { key: 'tablet', width: 768, height: 1024 },
                { key: 'desktop', width: 1600, height: 1080 },
            ])
        );

        expect(canvasStore.hasManualZoom).toBe(true);
        expect(canvasStore.scale).toBe(0.75);
    });

    it('удаление активного устройства переводит канвас на базовое', () => {
        const canvasStore = useCanvasStore();
        canvasStore.setDevices(
            buildDevices([
                { key: 'mobile', width: 375, height: 812 },
                { key: 'laptop', width: 1280, height: 800 },
                { key: 'desktop', width: 1600, height: 1080 },
            ])
        );
        canvasStore.setViewport('laptop');

        canvasStore.setDevices(THREE_DEVICES);

        expect(canvasStore.viewport).toBe('desktop');
        expect(canvasStore.width).toBe(1600);
    });
});
