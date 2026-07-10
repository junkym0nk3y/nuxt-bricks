// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    DEFAULT_BRICKS_ROUTE_PREFIXES,
    getBuilderLoginPath,
    getPreviewPagePath,
    isBuilderPath,
    isProtectedBricksHtmlPath,
    joinPathBase,
    stripPathBase,
    validateBricksRoutePrefixes,
} from '../src/runtime/modules/common/utils/bricks/routePaths';
// #endregion

const CUSTOM_PREFIXES = { builderPrefix: '/admin/builder', previewPrefix: '/look' };

describe('routePaths: построение путей', () => {
    it('строит login и preview пути из префиксов', () => {
        expect(getBuilderLoginPath(DEFAULT_BRICKS_ROUTE_PREFIXES)).toBe('/bricks/login');
        expect(getBuilderLoginPath(CUSTOM_PREFIXES)).toBe('/admin/builder/login');
        expect(getPreviewPagePath(DEFAULT_BRICKS_ROUTE_PREFIXES, 'my-page')).toBe(
            '/preview/my-page'
        );
        expect(getPreviewPagePath(CUSTOM_PREFIXES, 'my-page')).toBe('/look/my-page');
    });
});

describe('routePaths: матчинг поверхностей', () => {
    it('isBuilderPath матчит префикс и его поддерево, но не похожие пути', () => {
        expect(isBuilderPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks')).toBe(true);
        expect(isBuilderPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks/my-page')).toBe(true);
        expect(isBuilderPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks-like-page')).toBe(false);
        expect(isBuilderPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/')).toBe(false);

        expect(isBuilderPath(CUSTOM_PREFIXES, '/admin/builder/my-page')).toBe(true);
        expect(isBuilderPath(CUSTOM_PREFIXES, '/admin')).toBe(false);
        expect(isBuilderPath(CUSTOM_PREFIXES, '/bricks')).toBe(false);
    });

    it('isProtectedBricksHtmlPath покрывает билдер и превью', () => {
        expect(isProtectedBricksHtmlPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/bricks')).toBe(true);
        expect(isProtectedBricksHtmlPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/preview/x')).toBe(true);
        expect(isProtectedBricksHtmlPath(DEFAULT_BRICKS_ROUTE_PREFIXES, '/my-landing')).toBe(false);

        expect(isProtectedBricksHtmlPath(CUSTOM_PREFIXES, '/look/x')).toBe(true);
        expect(isProtectedBricksHtmlPath(CUSTOM_PREFIXES, '/preview/x')).toBe(false);
    });
});

describe('routePaths: baseURL', () => {
    it('stripPathBase убирает base и не трогает чужие пути', () => {
        expect(stripPathBase('/app/bricks/page', '/app/')).toBe('/bricks/page');
        expect(stripPathBase('/app/bricks/page', '/app')).toBe('/bricks/page');
        expect(stripPathBase('/app', '/app/')).toBe('/');
        expect(stripPathBase('/bricks', '/')).toBe('/bricks');
        expect(stripPathBase('/bricks', '')).toBe('/bricks');
        expect(stripPathBase('/other/bricks', '/app/')).toBe('/other/bricks');
        // Похожий, но чужой корень не срезается
        expect(stripPathBase('/application/bricks', '/app/')).toBe('/application/bricks');
    });

    it('joinPathBase добавляет base без дублирования слэшей', () => {
        expect(joinPathBase('/app/', '/bricks/login')).toBe('/app/bricks/login');
        expect(joinPathBase('/app', '/bricks/login')).toBe('/app/bricks/login');
        expect(joinPathBase('/', '/bricks')).toBe('/bricks');
        expect(joinPathBase('', '/bricks')).toBe('/bricks');
    });

    it('strip и join взаимно обратны на путях под base', () => {
        const base = '/app/';
        const path = '/bricks/my-page';
        expect(stripPathBase(joinPathBase(base, path), base)).toBe(path);
    });
});

describe('routePaths: валидация префиксов (fail-fast module.ts)', () => {
    it('принимает валидные конфигурации', () => {
        expect(() => validateBricksRoutePrefixes(DEFAULT_BRICKS_ROUTE_PREFIXES)).not.toThrow();
        expect(() => validateBricksRoutePrefixes(CUSTOM_PREFIXES)).not.toThrow();
    });

    it('отклоняет невалидный формат', () => {
        const cases = ['bricks', '/bricks/', '/Bricks', '/bricks page', '/', '/bricks//x'];

        for (const builderPrefix of cases) {
            expect(() =>
                validateBricksRoutePrefixes({ builderPrefix, previewPrefix: '/preview' })
            ).toThrow('builderPrefix');
        }
    });

    it('отклоняет зарезервированные корневые сегменты', () => {
        expect(() =>
            validateBricksRoutePrefixes({ builderPrefix: '/api/builder', previewPrefix: '/look' })
        ).toThrow('reserved');
        expect(() =>
            validateBricksRoutePrefixes({ builderPrefix: '/admin', previewPrefix: '/mock-api/x' })
        ).toThrow('reserved');
    });

    it('отклоняет равные и вложенные префиксы', () => {
        expect(() =>
            validateBricksRoutePrefixes({ builderPrefix: '/bricks', previewPrefix: '/bricks' })
        ).toThrow('must not overlap');
        expect(() =>
            validateBricksRoutePrefixes({
                builderPrefix: '/bricks',
                previewPrefix: '/bricks/preview',
            })
        ).toThrow('must not overlap');
        expect(() =>
            validateBricksRoutePrefixes({
                builderPrefix: '/preview/builder',
                previewPrefix: '/preview',
            })
        ).toThrow('must not overlap');
    });
});
