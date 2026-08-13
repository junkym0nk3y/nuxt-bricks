// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { effectScope, ref } from 'vue';

// Types
import type { TBricksPageDeviceSet } from '../../src/runtime/modules/common/types/devices';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import { usePublishDeviceSet } from '../../src/runtime/modules/builder/publish/composables/usePublishDeviceSet';

const PROJECT_DEVICES = [
    {
        key: 'mobile',
        label: 'Мобильный',
        icon: 'device-mobile',
        width: 375,
        aside: 0.4,
        canvasHeight: 812,
    },
    {
        key: 'tablet',
        label: 'Планшет',
        icon: 'device-tablet',
        width: 768,
        aside: 0.8,
        canvasHeight: 1024,
    },
    {
        key: 'desktop',
        label: 'Десктоп',
        icon: 'device-desktop',
        width: 1600,
        aside: 2,
        canvasHeight: 1080,
    },
];

/**
 * Поднимает редактор набора в effectScope.
 *
 * @param initial - Набор страницы на старте.
 * @returns Scope, API редактора и управление открытием/исходным набором.
 */
function mountEditor(initial: TBricksPageDeviceSet | null = null) {
    const scope = effectScope();
    const isOpen = ref(true);
    const config = ref<TBricksPageDeviceSet | null>(initial);

    const api = scope.run(() =>
        usePublishDeviceSet({
            isOpen: () => isOpen.value,
            initial: () => config.value,
            projectDevices: () => PROJECT_DEVICES,
            activeDeviceKey: () => 'desktop',
        })
    )!;

    return { scope, api, isOpen, config };
}

describe('usePublishDeviceSet', () => {
    it('включение своего набора копирует набор проекта, а не обнуляет черновик', () => {
        const { scope, api } = mountEditor();

        api.setCustom(true);

        expect(api.rows.value.map((row) => row.key)).toEqual(['mobile', 'tablet', 'desktop']);
        scope.stop();
    });

    it('добавляет выбранное устройство и сортирует набор по ширине', () => {
        const { scope, api } = mountEditor();

        api.setCustom(true);
        api.addDevice('laptop');

        expect(api.rows.value.map((row) => row.key)).toEqual([
            'mobile',
            'tablet',
            'laptop',
            'desktop',
        ]);
        expect(api.ranges.value.map((range) => range.text)).toEqual([
            '0 – 767',
            '768 – 1279',
            '1280 – 1599',
            'bricks.devices.rangeFrom',
        ]);
        scope.stop();
    });

    it('замок держится на mobile и desktop, даже когда сортировка их переставила', () => {
        // Порядок задаётся шириной: при mobile 1400 строка уезжает в конец, и
        // замок «по позиции» встал бы на планшет
        const { scope, api } = mountEditor();

        api.setCustom(true);
        api.updateDevice('mobile', { width: 1400 });

        const locked = api.rows.value.filter((row) => row.isLocked).map((row) => row.key);
        expect(locked.sort()).toEqual(['desktop', 'mobile']);
        scope.stop();
    });

    it('перестановка крайних блокирует сохранение, а не уезжает на сервер', () => {
        const { scope, api } = mountEditor();

        api.setCustom(true);
        api.updateDevice('mobile', { width: 1400 });

        expect(api.canSave.value).toBe(false);
        scope.stop();
    });

    it('ширина за верхней границей блокирует сохранение', () => {
        const { scope, api } = mountEditor();

        api.setCustom(true);
        api.updateDevice('desktop', { width: 7681 });

        expect(api.canSave.value).toBe(false);
        scope.stop();
    });

    it('rem не кратный шагу ловится общим контрактом, а не только полем ширины', () => {
        // Полевых проверок мало: они не покрывают rem-поля, и такой набор ушёл
        // бы в форму, а 400 прилетел бы уже при сохранении страницы
        const { scope, api } = mountEditor();

        api.setCustom(true);
        api.updateDevice('tablet', { aside: 1.3 });

        expect(api.canSave.value).toBe(false);
        scope.stop();
    });

    it('промежуточное устройство вне диапазона крайних не сохраняется', () => {
        const { scope, api } = mountEditor();

        api.setCustom(true);
        api.addDevice('laptop');
        api.updateDevice('laptop', { width: 1700 });

        expect(api.canSave.value).toBe(false);
        scope.stop();
    });

    it('крайние устройства не удаляются', () => {
        const { scope, api } = mountEditor();

        api.setCustom(true);
        api.removeDevice('desktop');

        expect(api.rows.value.map((row) => row.key)).toContain('desktop');
        scope.stop();
    });

    it('повторное открытие отменяет несохранённый черновик', () => {
        const { scope, api, isOpen } = mountEditor([
            { key: 'mobile', label: 'Мобильный', icon: 'device-mobile', width: 375, aside: 0.4 },
            { key: 'desktop', label: 'Десктоп', icon: 'device-desktop', width: 1600, aside: 2 },
        ]);

        api.updateDevice('desktop', { width: 1440 });
        isOpen.value = false;
        isOpen.value = true;

        expect(api.rows.value.find((row) => row.key === 'desktop')?.width).toBe(1600);
        scope.stop();
    });

    it('выключенный тумблер отдаёт null — страница наследует набор проекта', () => {
        const { scope, api } = mountEditor();

        api.setCustom(true);
        api.setCustom(false);

        expect(api.toFormValue()).toBeNull();
        scope.stop();
    });

    it('сохранённый набор не тащит UI-поля резолвнутого устройства', () => {
        const { scope, api } = mountEditor();

        api.setCustom(true);

        for (const device of api.toFormValue() ?? []) {
            expect(device).not.toHaveProperty('canvasHeight');
            expect(device).not.toHaveProperty('remBase');
        }
        scope.stop();
    });
});
