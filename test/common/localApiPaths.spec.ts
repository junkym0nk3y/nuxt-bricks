// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    isLocalApiPathname,
    isLocalApiRequest,
    matchesPathPrefix,
} from '../../src/runtime/modules/common/utils/localApiPaths';
// #endregion

describe('matchesPathPrefix', () => {
    it('матчит сам префикс и пути под ним', () => {
        expect(matchesPathPrefix('/api/bricks', '/api/bricks')).toBe(true);
        expect(matchesPathPrefix('/api/bricks/pages', '/api/bricks')).toBe(true);
    });

    it('не матчит похожие префиксы без границы сегмента', () => {
        expect(matchesPathPrefix('/api/bricksmith', '/api/bricks')).toBe(false);
    });
});

describe('isLocalApiPathname', () => {
    it('/api/bricks/** — локальные', () => {
        expect(isLocalApiPathname('/api/bricks')).toBe(true);
        expect(isLocalApiPathname('/api/bricks/health/ready')).toBe(true);
        expect(isLocalApiPathname('/api/bricks/media/upload')).toBe(true);
        expect(isLocalApiPathname('/api/bricks/components')).toBe(true);
        expect(isLocalApiPathname('/api/bricks/media/s3-proxy')).toBe(true);
    });

    it('остальные /api/** и не-API пути — не локальные', () => {
        expect(isLocalApiPathname('/api/items')).toBe(false);
        expect(isLocalApiPathname('/api')).toBe(false);
        expect(isLocalApiPathname('/api/bricksmith')).toBe(false);
        expect(isLocalApiPathname('/bricks')).toBe(false);
        // Бывший /mock-api/** — теперь обычный путь приложения
        expect(isLocalApiPathname('/mock-api')).toBe(false);
        expect(isLocalApiPathname('/mock-api/s3-page-thumbnail')).toBe(false);
        expect(isLocalApiPathname('')).toBe(false);
    });
});

describe('isLocalApiRequest (решение local-vs-external useApiClient)', () => {
    it('bricks-путь локален независимо от наличия БД/PROXY_URL', () => {
        expect(isLocalApiRequest('/api/bricks/pages')).toBe(true);
        expect(isLocalApiRequest('/api/bricks')).toBe(true);
    });

    it('query и hash не влияют на решение', () => {
        expect(isLocalApiRequest('/api/bricks/health/ready?verbose=1')).toBe(true);
        expect(isLocalApiRequest('/api/bricks/media/s3-proxy?url=/api/items')).toBe(true);
        expect(isLocalApiRequest('/api/items?redirect=/api/bricks')).toBe(false);
    });

    it('не-bricks /api/* уходит на внешний endpoint', () => {
        expect(isLocalApiRequest('/api/items')).toBe(false);
        expect(isLocalApiRequest('/api/bricksmith')).toBe(false);
    });

    it('абсолютные URL и пути без ведущего слэша — не локальные', () => {
        expect(isLocalApiRequest('http://example.com/api/bricks/pages')).toBe(false);
        expect(isLocalApiRequest('api/bricks/pages')).toBe(false);
        expect(isLocalApiRequest('')).toBe(false);
    });
});
