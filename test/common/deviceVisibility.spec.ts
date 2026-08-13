// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    buildDeviceVisibilityClasses,
    normalizeDeviceVisibility,
    shouldAriaHideComponent,
} from '../../src/runtime/modules/common/utils/bricks/deviceVisibility';
// #endregion

describe('normalizeDeviceVisibility', () => {
    it('пустая конфигурация остаётся пустой: отсутствие ключа и есть «видно»', () => {
        expect(normalizeDeviceVisibility(null)).toEqual({});
        expect(normalizeDeviceVisibility(undefined)).toEqual({});
        expect(normalizeDeviceVisibility({})).toEqual({});
    });

    it('не дописывает недостающие ключи: набор у страниц разный', () => {
        // Прежняя нормализация возвращала тройку целиком и при каждой
        // десериализации возвращала бы в схему ключи удалённых устройств
        expect(normalizeDeviceVisibility({ mobile: false })).toEqual({ mobile: false });
    });

    it('сохраняет произвольный ключ устройства', () => {
        expect(normalizeDeviceVisibility({ laptop: false })).toEqual({ laptop: false });
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

    it('строит класс по произвольному ключу устройства', () => {
        expect(buildDeviceVisibilityClasses({ laptop: false })).toEqual(['bricks-hide--laptop']);
    });

    it('добавляет класс для каждого скрытого устройства', () => {
        expect(buildDeviceVisibilityClasses({ mobile: false, desktop: false })).toEqual([
            'bricks-hide--mobile',
            'bricks-hide--desktop',
        ]);
        expect(buildDeviceVisibilityClasses({ tablet: false })).toEqual(['bricks-hide--tablet']);
    });

    it('ключ вне контракта имени класса не даёт: имя класса — не место для чужой строки', () => {
        // Ключ уезжает в ИМЯ класса, а схема — внешние данные: пробел в ключе
        // превратил бы один класс в два, и второй оказался бы настоящим
        // правилом скрытия — чужая строка в БД навязала бы элементу свой класс
        expect(buildDeviceVisibilityClasses({ 'x bricks-hide--desktop': false })).toEqual([]);
        expect(buildDeviceVisibilityClasses({ Laptop: false })).toEqual([]);
        expect(buildDeviceVisibilityClasses({ '2k': false })).toEqual([]);
    });
});

describe('shouldAriaHideComponent', () => {
    it('помечает aria-hidden только компоненты, скрытые на базовом устройстве', () => {
        expect(shouldAriaHideComponent({ desktop: false })).toBe(true);
        expect(shouldAriaHideComponent({ mobile: false, tablet: false, laptop: false })).toBe(
            false
        );
        expect(shouldAriaHideComponent(null)).toBe(false);
    });
});
