// #region Imports
// Node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Vitest
import { describe, expect, it } from 'vitest';

// Manifest
import { BRICKS_API_HANDLERS } from '../../src/api-handlers';
// #endregion

const RUNTIME_DIR = resolve(__dirname, '../../src/runtime');

describe('BRICKS_API_HANDLERS: манифест /api/bricks/**', () => {
    it('каждый file манифеста существует на диске (строковые пути type-check не ловит)', () => {
        for (const { file } of BRICKS_API_HANDLERS) {
            expect(existsSync(resolve(RUNTIME_DIR, `${file}.ts`)), file).toBe(true);
        }
    });

    it('builder-ручки (бывший /mock-api/**) присутствуют с ожидаемыми route/method/file', () => {
        expect(BRICKS_API_HANDLERS).toContainEqual(
            expect.objectContaining({
                route: '/api/bricks/components',
                method: 'get',
                file: 'server/api/bricks/components.get',
            })
        );
        expect(BRICKS_API_HANDLERS).toContainEqual(
            expect.objectContaining({
                route: '/api/bricks/media/s3-proxy',
                method: 'post',
                file: 'server/api/bricks/media/s3-proxy.post',
            })
        );
        expect(BRICKS_API_HANDLERS).toContainEqual(
            expect.objectContaining({
                route: '/api/bricks/media/s3-page-thumbnail',
                method: 'post',
                file: 'server/api/bricks/media/s3-page-thumbnail.post',
            })
        );
    });

    it('builder-ручки не помечены isPublic (в render-only режиме не регистрируются)', () => {
        const builderRoutes = [
            '/api/bricks/components',
            '/api/bricks/media/s3-proxy',
            '/api/bricks/media/s3-page-thumbnail',
        ];

        for (const route of builderRoutes) {
            const handler = BRICKS_API_HANDLERS.find((entry) => entry.route === route);
            expect(handler?.isPublic, route).toBeUndefined();
        }
    });
});
