// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { TBricksPageDeviceSet } from '../../src/runtime/modules/common/types/devices';

// Constants
import {
    DEFAULT_BRICKS_DEVICES,
    DEVICE_CHOICES,
} from '../../src/runtime/modules/common/constants/devices';

// Utils
import {
    deviceRanges,
    resolveDeviceIcon,
    resolveDeviceSet,
    validateDeviceSet,
} from '../../src/runtime/modules/common/utils/bricks/devices';
// #endregion

// #region Helpers
/**
 * Собирает запись устройства с валидными дефолтами.
 *
 * @param overrides - Поля, которые нужно переопределить.
 * @returns Запись устройства.
 */
function device(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        key: 'tablet',
        label: 'Планшет',
        icon: 'device-tablet',
        width: 768,
        aside: 0.8,
        ...overrides,
    };
}

/** Минимальный валидный набор: только крайние устройства. */
function pair(): Record<string, unknown>[] {
    return [
        device({
            key: 'mobile',
            label: 'Мобильный',
            icon: 'device-mobile',
            width: 375,
            aside: 0.4,
        }),
        device({ key: 'desktop', label: 'Десктоп', icon: 'device-desktop', width: 1600, aside: 2 }),
    ];
}

/**
 * Вставляет промежуточное устройство между крайними.
 *
 * @param overrides - Поля промежуточной записи.
 * @returns Набор из трёх устройств.
 */
function trio(overrides: Record<string, unknown> = {}): Record<string, unknown>[] {
    const [narrow, wide] = pair();
    return [narrow, device(overrides), wide];
}
// #endregion

describe('resolveDeviceIcon', () => {
    it('строит имя глифа префиксом, а не таблицей соответствий', () => {
        expect(resolveDeviceIcon('device-laptop')).toBe('ta:outline-device-laptop');
        expect(resolveDeviceIcon('device-mobile')).toBe('ta:outline-device-mobile');
    });

    it('неизвестный глиф отдаёт десктопный, а не «иконка не найдена»', () => {
        // Ключ приходит из схемы: файл чужого набора мог принести глиф, которого
        // в каталоге нет, а пустое место в баре и табах заметнее неточной иконки
        expect(resolveDeviceIcon('device-tv')).toBe('ta:outline-device-desktop');
        expect(resolveDeviceIcon('')).toBe('ta:outline-device-desktop');
    });
});

describe('каталог устройств', () => {
    it('дефолтный набор проекта собран из каталога и не несёт UI-полей', () => {
        expect(DEFAULT_BRICKS_DEVICES.map((device) => device.key)).toEqual([
            'mobile',
            'tablet',
            'desktop',
        ]);
        // canvasHeight — свойство интерфейса, в наборе страницы его быть не должно
        expect(DEFAULT_BRICKS_DEVICES.every((device) => !('canvasHeight' in device))).toBe(true);
    });

    it('подписи каталога английские: набор уезжает в схему, а не в интерфейс', () => {
        expect(DEFAULT_BRICKS_DEVICES.map((device) => device.label)).toEqual([
            'Mobile',
            'Tablet',
            'Desktop',
        ]);
    });

    it('в выборе добавления нет крайних устройств: они уже в наборе', () => {
        expect(DEVICE_CHOICES.map((choice) => choice.key)).toEqual(['tablet', 'laptop']);
    });
});

describe('validateDeviceSet', () => {
    it('принимает минимальную пару и набор из четырёх', () => {
        expect(validateDeviceSet(pair()).ok).toBe(true);
        expect(
            validateDeviceSet([
                ...trio({ key: 'tablet', width: 768 }).slice(0, 2),
                device({
                    key: 'laptop',
                    label: 'Ноутбук',
                    icon: 'device-laptop',
                    width: 1280,
                    aside: 1.2,
                }),
                device({
                    key: 'desktop',
                    label: 'Десктоп',
                    icon: 'device-desktop',
                    width: 1600,
                    aside: 2,
                }),
            ]).ok
        ).toBe(true);
    });

    it('отклоняет ширину меньше 320: под таким окном не рассчитан ни один блок', () => {
        expect(validateDeviceSet(trio({ width: 300 })).ok).toBe(false);
    });

    it('отклоняет набор короче двух и длиннее четырёх устройств', () => {
        expect(validateDeviceSet([pair()[0]]).ok).toBe(false);
        expect(
            validateDeviceSet([
                pair()[0],
                device({ key: 'tablet', width: 768 }),
                device({ key: 'laptop', width: 1000 }),
                device({ key: 'imac', width: 1280 }),
                pair()[1],
            ]).ok
        ).toBe(false);
    });

    it('отклоняет дубли ключа и дубли ширины', () => {
        const [narrow, wide] = pair();
        expect(validateDeviceSet([narrow, device({ key: 'mobile', width: 768 }), wide]).ok).toBe(
            false
        );
        expect(validateDeviceSet([narrow, device({ key: 'tablet', width: 375 }), wide]).ok).toBe(
            false
        );
    });

    it('требует mobile первым и desktop последним', () => {
        const swapped = [
            device({
                key: 'desktop',
                label: 'Десктоп',
                icon: 'device-desktop',
                width: 375,
                aside: 2,
            }),
            device({
                key: 'mobile',
                label: 'Мобильный',
                icon: 'device-mobile',
                width: 1600,
                aside: 0.4,
            }),
        ];
        expect(validateDeviceSet(swapped).ok).toBe(false);

        const withoutDesktop = [pair()[0], device({ key: 'tablet', width: 768 })];
        expect(validateDeviceSet(withoutDesktop).ok).toBe(false);
    });

    it('отклоняет несортированный массив: диапазон считается от соседа по позиции', () => {
        const [narrow, wide] = pair();
        const unsorted = [
            narrow,
            device({ key: 'tablet', width: 1400 }),
            device({
                key: 'laptop',
                label: 'Ноутбук',
                icon: 'device-laptop',
                width: 1280,
                aside: 1.2,
            }),
            wide,
        ];
        expect(validateDeviceSet(unsorted).ok).toBe(false);
    });

    it('отклоняет лишнее поле и remBase в наборе страницы', () => {
        expect(validateDeviceSet(trio({ canvasHeight: 900 })).ok).toBe(false);
        expect(validateDeviceSet(trio({ remBase: '0.6944vw' })).ok).toBe(false);
    });

    it('разрешает remBase в наборе проекта', () => {
        expect(validateDeviceSet(trio({ remBase: '0.6944vw' }), 'project').ok).toBe(true);
    });

    it('отклоняет строковые CSS-длины в rem-полях: они уезжают в генерируемый style', () => {
        expect(validateDeviceSet(trio({ aside: '0;}</style><script>' })).ok).toBe(false);
        expect(validateDeviceSet(trio({ aside: '0.8rem' })).ok).toBe(false);
    });

    it('отклоняет rem не кратный 0.2 и отрицательный', () => {
        expect(validateDeviceSet(trio({ aside: 0.9 })).ok).toBe(false);
        expect(validateDeviceSet(trio({ aside: -0.4 })).ok).toBe(false);
        expect(validateDeviceSet(trio({ aside: 0.6 })).ok).toBe(true);
    });

    it('отклоняет нечисловые и нецелые ширины', () => {
        expect(validateDeviceSet(trio({ width: Number.POSITIVE_INFINITY })).ok).toBe(false);
        expect(validateDeviceSet(trio({ width: Number.NaN })).ok).toBe(false);
        expect(validateDeviceSet(trio({ width: 768.5 })).ok).toBe(false);
    });

    it('отклоняет ключ base и ключ вне контракта имени', () => {
        expect(validateDeviceSet(trio({ key: 'base' })).ok).toBe(false);
        expect(validateDeviceSet(trio({ key: '4k' })).ok).toBe(false);
        expect(validateDeviceSet(trio({ key: 'Tablet' })).ok).toBe(false);
    });

    it('отклоняет пустую подпись и иконку вне набора', () => {
        expect(validateDeviceSet(trio({ label: '   ' })).ok).toBe(false);
        expect(validateDeviceSet(trio({ icon: 'ta:outline-device-tablet' })).ok).toBe(false);
    });
});

describe('resolveDeviceSet', () => {
    it('null — страница наследует набор проекта', () => {
        const { devices, usedFallback } = resolveDeviceSet(null, DEFAULT_BRICKS_DEVICES);
        expect(devices.map((d) => d.key)).toEqual(['mobile', 'tablet', 'desktop']);
        expect(usedFallback).toBe(false);
    });

    it('повреждённый набор заменяется проектным целиком, а не чинится по частям', () => {
        const { devices, usedFallback } = resolveDeviceSet(
            [{ key: 'mobile', label: 'M', icon: 'device-mobile', width: 100, aside: 0 }],
            DEFAULT_BRICKS_DEVICES
        );
        expect(devices.map((d) => d.key)).toEqual(['mobile', 'tablet', 'desktop']);
        expect(usedFallback).toBe(true);
    });

    it('подмешивает project-only remBase по совпадающему ключу и дефолт остальным', () => {
        const project = [
            { key: 'mobile', label: 'Мобильный', icon: 'device-mobile', width: 375, aside: 0.4 },
            {
                key: 'desktop',
                label: 'Десктоп',
                icon: 'device-desktop',
                width: 1600,
                aside: 2,
                remBase: '0.6944vw',
            },
        ];
        const { devices } = resolveDeviceSet(trio({ key: 'laptop', width: 1280 }), project);

        expect(devices.find((d) => d.key === 'desktop')?.remBase).toBe('0.6944vw');
        expect(devices.find((d) => d.key === 'laptop')?.remBase).toBe('10px');
    });

    it('высота листа канваса не хранится у страницы, а берётся по ключу', () => {
        const { devices } = resolveDeviceSet(null, DEFAULT_BRICKS_DEVICES);
        expect(devices.find((d) => d.key === 'mobile')?.canvasHeight).toBe(812);
        expect(devices.find((d) => d.key === 'desktop')?.canvasHeight).toBe(1080);
    });
});

describe('deviceRanges', () => {
    it('покрывает 0..∞ без дыр и наложений', () => {
        const set = [
            { key: 'mobile', label: 'M', icon: 'device-mobile', width: 375, aside: 0.4 },
            { key: 'tablet', label: 'T', icon: 'device-tablet', width: 768, aside: 0.8 },
            { key: 'laptop', label: 'L', icon: 'device-laptop', width: 1280, aside: 1.2 },
            { key: 'desktop', label: 'D', icon: 'device-desktop', width: 1600, aside: 2 },
        ] satisfies TBricksPageDeviceSet;

        expect(deviceRanges(set)).toEqual([
            { key: 'mobile', min: 0, max: 767 },
            { key: 'tablet', min: 768, max: 1279 },
            { key: 'laptop', min: 1280, max: 1599 },
            { key: 'desktop', min: 1600, max: Number.POSITIVE_INFINITY },
        ]);
    });

    it('ноутбук закрывает дыру 1024–1599, из-за которой окно получало планшетную раскладку', () => {
        const withoutLaptop = deviceRanges([
            { key: 'mobile', label: 'M', icon: 'device-mobile', width: 375, aside: 0.4 },
            { key: 'tablet', label: 'T', icon: 'device-tablet', width: 768, aside: 0.8 },
            { key: 'desktop', label: 'D', icon: 'device-desktop', width: 1600, aside: 2 },
        ]);
        expect(withoutLaptop[1]).toEqual({ key: 'tablet', min: 768, max: 1599 });
    });
});
