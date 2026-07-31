// #region Imports
// Types
import type { IBricksManifest } from '../../src/runtime/modules/common/types/brickManifest';

// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
// bricksComponents → nitropack/runtime (вне Nitro не резолвится)
const { getItemMock } = vi.hoisted(() => ({
    getItemMock: vi.fn<(key: string) => Promise<unknown>>(),
}));

vi.mock('nitropack/runtime', () => ({
    useStorage: () => ({ getItem: getItemMock }),
}));

const { resolveBricksComponents } = await import('../../src/runtime/server/utils/bricksComponents');
// #endregion

/**
 * Собирает манифест из пар «имя → категория» и кладёт его в мок server assets.
 *
 * @param entries - Пары «имя компонента → категория».
 * @returns Манифест, отданный ручке.
 */
function mockManifest(entries: Array<[name: string, category: string]>): IBricksManifest {
    const manifest: IBricksManifest = {
        bricks: entries.map(([name, category]) => ({
            name,
            category,
            brickPath: `/components/${name}.brick.ts`,
            values: {},
        })),
        hash: 'test-hash',
    };

    getItemMock.mockResolvedValue(manifest);

    return manifest;
}

afterEach(() => {
    vi.restoreAllMocks();
    getItemMock.mockReset();
});

describe('resolveBricksComponents: группировка по категориям', () => {
    // Категория берётся из brick-файла: на обычном объекте-аккумуляторе такой
    // ключ читается как член Object.prototype, и группировка падает
    it('категория __proto__ не роняет ручку', async () => {
        mockManifest([['Hero', '__proto__']]);

        await expect(resolveBricksComponents('__proto__')).resolves.toEqual([
            { name: 'Hero', brickPath: '/components/Hero.brick.ts' },
        ]);
    });

    it('категории, различающиеся регистром, сливаются в одну', async () => {
        mockManifest([
            ['Hero', 'Marketing'],
            ['Footer', 'marketing'],
        ]);

        await expect(resolveBricksComponents('MARKETING')).resolves.toEqual([
            { name: 'Hero', brickPath: '/components/Hero.brick.ts' },
            { name: 'Footer', brickPath: '/components/Footer.brick.ts' },
        ]);
    });

    it('без категории отдаётся манифест целиком', async () => {
        const manifest = mockManifest([['Hero', 'Marketing']]);

        await expect(resolveBricksComponents()).resolves.toEqual(manifest);
    });

    it('неизвестная категория → 404', async () => {
        mockManifest([['Hero', 'Marketing']]);

        await expect(resolveBricksComponents('Unknown')).rejects.toMatchObject({
            statusCode: 404,
        });
    });

    it('несгенерированный манифест → пустой список без падения', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        getItemMock.mockResolvedValue(null);

        await expect(resolveBricksComponents()).resolves.toEqual({ bricks: [], hash: '' });
        await expect(resolveBricksComponents('Marketing')).rejects.toMatchObject({
            statusCode: 404,
        });
    });
});
