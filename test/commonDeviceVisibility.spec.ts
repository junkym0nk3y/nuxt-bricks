// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    buildDeviceVisibilityClasses,
    normalizeDeviceVisibility,
    shouldAriaHideComponent,
} from '../src/runtime/modules/common/utils/bricks/deviceVisibility';
// #endregion

describe('normalizeDeviceVisibility', () => {
    it('возвращает все устройства видимыми по умолчанию', () => {
        const expected = { mobile: true, tablet: true, desktop: true };
        expect(normalizeDeviceVisibility(null)).toEqual(expected);
        expect(normalizeDeviceVisibility(undefined)).toEqual(expected);
        expect(normalizeDeviceVisibility({})).toEqual(expected);
    });

    it('дополняет частичную конфигурацию дефолтами', () => {
        expect(normalizeDeviceVisibility({ mobile: false })).toEqual({
            mobile: false,
            tablet: true,
            desktop: true,
        });
    });

    it('приводит значения к boolean', () => {
        const result = normalizeDeviceVisibility({
            mobile: 0 as unknown as boolean,
            desktop: 1 as unknown as boolean,
        });
        expect(result.mobile).toBe(false);
        expect(result.desktop).toBe(true);
    });
});

describe('buildDeviceVisibilityClasses', () => {
    it('возвращает пустой список, когда всё видимо', () => {
        expect(buildDeviceVisibilityClasses(null)).toEqual([]);
        expect(buildDeviceVisibilityClasses({ mobile: true })).toEqual([]);
    });

    it('добавляет класс для каждого скрытого устройства', () => {
        expect(buildDeviceVisibilityClasses({ mobile: false, desktop: false })).toEqual([
            'bricks-hide--mobile',
            'bricks-hide--desktop',
        ]);
        expect(buildDeviceVisibilityClasses({ tablet: false })).toEqual(['bricks-hide--tablet']);
    });
});

describe('shouldAriaHideComponent', () => {
    it('помечает aria-hidden только компоненты, скрытые на desktop', () => {
        expect(shouldAriaHideComponent({ desktop: false })).toBe(true);
        expect(shouldAriaHideComponent({ mobile: false, tablet: false })).toBe(false);
        expect(shouldAriaHideComponent(null)).toBe(false);
    });
});
