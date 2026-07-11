import { describe, expect, it } from 'vitest';

import {
    BRICKS_PUBLIC_ASSETS_BASE,
    resolveBricksAssetUrl,
} from '../src/runtime/modules/common/utils/bricks/assetPaths';

describe('resolveBricksAssetUrl', () => {
    it('строит URL ассета под /_bricks/ при дефолтном baseURL', () => {
        expect(resolveBricksAssetUrl('/', 'images/layouts/grid.svg')).toBe(
            '/_bricks/images/layouts/grid.svg'
        );
    });

    it('учитывает app.baseURL', () => {
        expect(resolveBricksAssetUrl('/app/', 'images/brick-empty.webp')).toBe(
            '/app/_bricks/images/brick-empty.webp'
        );
        expect(resolveBricksAssetUrl('/app', 'docs/guide/images/canvas.png')).toBe(
            '/app/_bricks/docs/guide/images/canvas.png'
        );
    });

    it('нормализует ведущий слэш asset-пути', () => {
        expect(resolveBricksAssetUrl('/app/', '/images/layouts/flex.svg')).toBe(
            '/app/_bricks/images/layouts/flex.svg'
        );
    });

    it('не трогает абсолютные внешние URL', () => {
        for (const external of [
            'https://cdn.example.com/images/logo.svg',
            'http://example.com/a.png',
            '//cdn.example.com/a.png',
            'data:image/png;base64,AAAA',
        ]) {
            expect(resolveBricksAssetUrl('/app/', external)).toBe(external);
        }
    });

    it('пустой baseURL эквивалентен корню', () => {
        expect(resolveBricksAssetUrl('', 'images/a.svg')).toBe(
            `${BRICKS_PUBLIC_ASSETS_BASE}images/a.svg`
        );
    });
});
