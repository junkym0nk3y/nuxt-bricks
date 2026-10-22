// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { IBricksComponent, IBricksSchema } from '../../src/runtime/modules/common/types/brick';

// Utils
import {
    findRemovedDeviceKeys,
    stripDeviceKeysFromSchema,
} from '../../src/runtime/modules/builder/core/utils/deviceKeyCleanup';
import {
    countDeviceOverrides,
    describeAbsorbedRange,
} from '../../src/runtime/modules/builder/publish/utils/deviceImpact';
// #endregion

/**
 * Собирает компонент схемы.
 *
 * @param overrides - Поля компонента поверх дефолтов.
 * @returns Компонент схемы.
 */
function buildComponent(overrides: Partial<IBricksComponent> = {}): IBricksComponent {
    return {
        id: 'grid-1',
        type: 'layout',
        componentName: 'Grid',
        brickPath: 'layout/grid',
        zIndex: 1,
        props: {},
        ...overrides,
    };
}

/**
 * Собирает схему из одного компонента.
 *
 * @param component - Компонент схемы.
 * @returns Схема страницы.
 */
function buildSchema(component: IBricksComponent): IBricksSchema {
    return { components: [component] };
}

describe('findRemovedDeviceKeys', () => {
    it('находит ключи, исчезнувшие из набора', () => {
        expect([
            ...findRemovedDeviceKeys(['mobile', 'laptop', 'desktop'], ['mobile', 'desktop']),
        ]).toEqual(['laptop']);
    });

    it('переименование подписи ключей не трогает: набор ключей тот же', () => {
        expect(findRemovedDeviceKeys(['mobile', 'desktop'], ['mobile', 'desktop']).size).toBe(0);
    });
});

describe('stripDeviceKeysFromSchema', () => {
    it('убирает переопределения и флаг видимости удалённого устройства', () => {
        const schema = buildSchema(
            buildComponent({
                props: {
                    columns: 4,
                    responsive: { laptop: { columns: 2 }, mobile: { columns: 1 } },
                },
                deviceVisibility: { laptop: false, mobile: false },
            })
        );

        const cleaned = stripDeviceKeysFromSchema(schema, new Set(['laptop']));

        expect(cleaned.components[0].props).toEqual({
            columns: 4,
            responsive: { mobile: { columns: 1 } },
        });
        expect(cleaned.components[0].deviceVisibility).toEqual({ mobile: false });
    });

    it('пустой responsive не остаётся ключом-пустышкой', () => {
        const schema = buildSchema(
            buildComponent({ props: { columns: 4, responsive: { laptop: { columns: 2 } } } })
        );

        expect(stripDeviceKeysFromSchema(schema, new Set(['laptop'])).components[0].props).toEqual({
            columns: 4,
        });
    });

    it('пустая видимость снимается целиком, а не остаётся пустым объектом', () => {
        const schema = buildSchema(buildComponent({ deviceVisibility: { laptop: false } }));

        expect(
            stripDeviceKeysFromSchema(schema, new Set(['laptop'])).components[0].deviceVisibility
        ).toBeUndefined();
    });

    it('пустой список удалённых ключей возвращает схему как есть', () => {
        const schema = buildSchema(buildComponent({ props: { columns: 4 } }));

        expect(stripDeviceKeysFromSchema(schema, new Set())).toBe(schema);
    });
});

describe('countDeviceOverrides', () => {
    it('считает значения переопределений, а не блоки: так обещает подтверждение', () => {
        const components = [
            buildComponent({
                id: 'a',
                props: { responsive: { laptop: { columns: 2, gap: 8 } } },
            }),
            buildComponent({ id: 'b', props: { responsive: { laptop: { gap: 4 } } } }),
        ];

        expect(countDeviceOverrides(components, 'laptop')).toBe(3);
    });

    it('флаг видимости — тоже переопределение устройства', () => {
        const components = [buildComponent({ deviceVisibility: { laptop: false } })];

        expect(countDeviceOverrides(components, 'laptop')).toBe(1);
    });

    it('переопределения других устройств не считаются', () => {
        const components = [buildComponent({ props: { responsive: { mobile: { gap: 1 } } } })];

        expect(countDeviceOverrides(components, 'laptop')).toBe(0);
    });
});

describe('describeAbsorbedRange', () => {
    const DEVICES = [
        { key: 'mobile', label: 'Мобильный', width: 375 },
        { key: 'laptop', label: 'Ноутбук', width: 1280 },
        { key: 'desktop', label: 'Десктоп', width: 1600 },
    ];

    it('диапазон удаляемого устройства переходит соседу слева', () => {
        expect(describeAbsorbedRange(DEVICES, 'laptop')).toEqual({
            label: 'Мобильный',
            range: '1280–1599',
        });
    });

    it('у самого узкого соседа слева нет — описывать нечего', () => {
        expect(describeAbsorbedRange(DEVICES, 'mobile')).toEqual({ label: '', range: '' });
    });
});
