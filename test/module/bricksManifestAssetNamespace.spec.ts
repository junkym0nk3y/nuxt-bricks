// #region Imports
// Node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Pathe
import { join } from 'pathe';

// Package
import packageMetadata from '../../package.json' with { type: 'json' };

// Manifest
import { resolveBricksManifestDir } from '../../src/bricks-manifest';
import {
    BRICKS_MANIFEST_ASSET_BASE,
    BRICKS_MANIFEST_DIR,
    BRICKS_MANIFEST_FILENAME,
} from '../../src/runtime/modules/common/constants/brickManifest';
// #endregion

// #region Mocks
// bricksComponents → nitropack/runtime (вне Nitro не резолвится)
const { getItemMock, useStorageMock } = vi.hoisted(() => {
    const getItem = vi.fn<(key: string) => Promise<unknown>>();

    return {
        getItemMock: getItem,
        useStorageMock: vi.fn<(base: string) => unknown>(() => ({ getItem })),
    };
});

vi.mock('nitropack/runtime', () => ({
    useStorage: useStorageMock,
}));

const { resolveBricksComponents } = await import('../../src/runtime/server/utils/bricksComponents');
// #endregion

// Монтирование живёт в module.ts, поднять которое из теста можно только с
// полным фейком Nuxt — поэтому третья сторона транспорта проверяется по
// исходнику: хардкод литерала вместо константы иначе остался бы незамеченным
const MODULE_SOURCE = readFileSync(
    fileURLToPath(new URL('../../src/module.ts', import.meta.url)),
    'utf8'
);

afterEach(() => {
    getItemMock.mockReset();
    useStorageMock.mockClear();
});

describe('namespace и каталог server asset манифеста', () => {
    // Коллизия baseName ведёт себя по-разному в dev и prod: в dev unstorage
    // бросает на занятой базе и модуль Nitro не загружается вовсе, в prod ключи
    // baseName + '/' + file сливаются пофайлово и коллизия проходит
    // незамеченной. Каталог в buildDir сканируется целиком, поэтому и он не
    // должен быть generic. Привязка к имени пакета не делает коллизию
    // невозможной (никто не мешает потребителю занять ровно это имя), но
    // закрывает реалистичный случай — совпадение на общем слове `bricks`
    it('namespace и каталог в buildDir начинаются с имени пакета', () => {
        expect(packageMetadata.name).toBe('nuxt-bricks');
        expect(BRICKS_MANIFEST_ASSET_BASE.startsWith(`${packageMetadata.name}-`)).toBe(true);
        expect(BRICKS_MANIFEST_DIR.startsWith(`${packageMetadata.name}-`)).toBe(true);
    });

    it('генератор пишет в каталог из константы', () => {
        expect(resolveBricksManifestDir('/tmp/build')).toBe(
            join('/tmp/build', BRICKS_MANIFEST_DIR)
        );
    });

    it('монтирование server asset берёт namespace из константы, а не литералом', () => {
        expect(MODULE_SOURCE).toMatch(/baseName:\s*BRICKS_MANIFEST_ASSET_BASE/);
    });

    it('читатель манифеста берёт тот же namespace и то же имя файла', async () => {
        getItemMock.mockResolvedValue({ bricks: [] });

        await resolveBricksComponents();

        expect(useStorageMock).toHaveBeenCalledWith(`assets:${BRICKS_MANIFEST_ASSET_BASE}`);
        expect(getItemMock).toHaveBeenCalledWith(BRICKS_MANIFEST_FILENAME);
    });
});
