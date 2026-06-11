/**
 * Parity-тест registry layout-блоков (шаг B2, ВРЕМЕННЫЙ — удаляется на шаге 14
 * вместе с legacy-файлами layoutComponents.ts / layoutProperties.ts).
 *
 * Сверяет выход registry со старыми ручными конфигами с учётом санкционированных
 * расхождений (см. architecture-cleanup.md, «Сверка дефолтов»): истина — поведение
 * создания (LAYOUT_COMPONENTS).
 */

import { describe, expect, it } from 'vitest';

import { LAYOUT_COMPONENTS } from '../src/runtime/modules/builder/constants/layoutComponents';
import { getLayoutProperties } from '../src/runtime/modules/builder/utils/layoutProperties';
import {
    BLOCK_REGISTRY,
    getBlockDefinition,
    getBlockProperties,
    getLayoutLibraryItems,
    resolveBlockProps,
} from '../src/runtime/modules/layouts-blocks/registry';

const FONTS = ['Inter', 'Golos Text'];

/**
 * Санкционированные правки legacy-defaultProps перед сравнением с derived:
 * remove — мусорные ключи, которых в registry сознательно нет;
 * add — ключи, которые derived даёт из properties, а legacy не имел (нейтрально).
 */
const LEGACY_DEFAULTPROPS_ADJUST: Record<
    string,
    { remove?: string[]; add?: Record<string, unknown> }
> = {
    Grid: { remove: ['padding'] },
    Flex: { remove: ['padding'] },
    Slider: { add: { captions: '[]', captionPosition: 'top', showCaptionNavigation: true } },
};

/**
 * Санкционированные правки дефолтов legacy-properties (истина — поведение создания):
 * Flex.wrap false; Title.marginBottom 0; Text.content RU и Text.marginBottom 0
 * (последнее — расхождение, найденное на шаге B2, тот же принцип).
 */
const LEGACY_PROPERTY_DEFAULT_FIXES: Record<string, Record<string, unknown>> = {
    Flex: { wrap: false },
    Title: { marginBottom: 0 },
    Text: { content: '<p>Введите текст</p>', marginBottom: 0 },
};

/**
 * Рекурсивно вычищает случайные id из inline-сегментов для стабильного сравнения.
 */
function stripSegmentIds(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(stripSegmentIds);
    }
    if (value && typeof value === 'object') {
        const entries = Object.entries(value as Record<string, unknown>)
            .filter(([key]) => !(key === 'id' && 'kind' in (value as Record<string, unknown>)))
            .map(([key, val]) => [key, stripSegmentIds(val)]);
        return Object.fromEntries(entries);
    }
    return value;
}

describe('block registry parity', () => {
    it('содержит все 10 блоков в порядке библиотеки', () => {
        expect(Object.keys(BLOCK_REGISTRY)).toEqual(LAYOUT_COMPONENTS.map((item) => item.name));
    });

    it('getLayoutLibraryItems совпадает с LAYOUT_COMPONENTS (с учётом сверки дефолтов)', () => {
        const derivedItems = getLayoutLibraryItems();

        for (const legacyItem of LAYOUT_COMPONENTS) {
            const derived = derivedItems.find((item) => item.name === legacyItem.name);
            expect(derived, legacyItem.name).toBeDefined();

            const adjust = LEGACY_DEFAULTPROPS_ADJUST[legacyItem.name] ?? {};
            const expectedDefaults: Record<string, unknown> = {
                ...legacyItem.defaultProps,
                ...adjust.add,
            };
            for (const key of adjust.remove ?? []) {
                delete expectedDefaults[key];
            }

            expect(stripSegmentIds(derived?.defaultProps), legacyItem.name).toEqual(
                stripSegmentIds(expectedDefaults)
            );

            expect(derived?.category).toBe(legacyItem.category);
            expect(derived?.storyPath).toBe(legacyItem.storyPath);
            expect(derived?.description).toBe(legacyItem.description);
            expect(derived?.thumbnail).toBe(legacyItem.thumbnail);
            expect(Boolean(derived?.isInteractive)).toBe(Boolean(legacyItem.isInteractive));
        }
    });

    it('getBlockProperties совпадает с getLayoutProperties (с учётом сверки дефолтов)', () => {
        for (const name of Object.keys(BLOCK_REGISTRY)) {
            const fixes = LEGACY_PROPERTY_DEFAULT_FIXES[name] ?? {};
            const expected = getLayoutProperties(name.toLowerCase(), FONTS).map((property) =>
                property.name in fixes ? { ...property, default: fixes[property.name] } : property
            );
            const actual = getBlockProperties(name, { availableFonts: FONTS });

            expect(stripSegmentIds(actual), name).toEqual(stripSegmentIds(expected));
        }
    });

    it('getBlockDefinition регистронезависим (канвас оперирует lowercase)', () => {
        expect(getBlockDefinition('grid')).toBe(BLOCK_REGISTRY.Grid);
        expect(getBlockDefinition('Grid')).toBe(BLOCK_REGISTRY.Grid);
        expect(getBlockDefinition('unknown')).toBeUndefined();
    });
});

describe('resolveBlockProps', () => {
    it('мержит responsive-overrides при responsiveMode all', () => {
        const resolved = resolveBlockProps(
            'Grid',
            { columns: 4, gap: 24, responsive: { tablet: { columns: 2 } } },
            'tablet'
        );
        expect(resolved.columns).toBe(2);
        expect(resolved.gap).toBe(24);
    });

    it('не мержит overrides при responsiveMode none и на desktop', () => {
        const slider = resolveBlockProps(
            'Slider',
            { spaceBetween: 16, responsive: { tablet: { spaceBetween: 8 } } },
            'tablet'
        );
        expect(slider.spaceBetween).toBe(16);

        const grid = resolveBlockProps(
            'Grid',
            { columns: 4, responsive: { tablet: { columns: 2 } } },
            'desktop'
        );
        expect(grid.columns).toBe(4);
    });

    it('коэрция: number clamp по min, select-валидация (normalizeGridRowHeight)', () => {
        const resolved = resolveBlockProps(
            'Grid',
            { columns: -3, rowHeight: 'bogus', variant: 'lead-left' },
            'desktop'
        );
        expect(resolved.columns).toBe(1);
        expect(resolved.rowHeight).toBe('auto');
        expect(resolved.variant).toBe('lead-left');
    });

    it('коэрция: boolean и select-guard для Flex justify/align', () => {
        const resolved = resolveBlockProps(
            'Flex',
            { wrap: 1, justify: 'weird', align: 'center' },
            'desktop'
        );
        expect(resolved.wrap).toBe(true);
        expect(resolved.justify).toBe('start');
        expect(resolved.align).toBe('center');
    });
});
