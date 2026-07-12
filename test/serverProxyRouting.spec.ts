// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    buildProxyTargetUrl,
    resolveRequestPathname,
    resolveRequestPathWithQuery,
    shouldProxyRequest,
} from '../src/runtime/server/utils/proxyRouting';
// #endregion

describe('resolveRequestPathname', () => {
    it('отбрасывает query и hash', () => {
        expect(resolveRequestPathname('/api/bricks/health?probe=1')).toBe('/api/bricks/health');
        expect(resolveRequestPathname('/api/items?x=/api/other#frag')).toBe('/api/items');
    });

    it('пустой/отсутствующий URL → пустая строка', () => {
        expect(resolveRequestPathname(undefined)).toBe('');
        expect(resolveRequestPathname('')).toBe('');
    });

    it('absolute-form URL → pathname', () => {
        expect(resolveRequestPathname('http://example.com/api/items?x=1')).toBe('/api/items');
    });
});

describe('resolveRequestPathWithQuery', () => {
    it('сохраняет query, отбрасывает hash', () => {
        expect(resolveRequestPathWithQuery('/api/items?x=1&y=2#frag')).toBe('/api/items?x=1&y=2');
        expect(resolveRequestPathWithQuery('/api/items')).toBe('/api/items');
    });

    it('пустой/отсутствующий URL → пустая строка', () => {
        expect(resolveRequestPathWithQuery(undefined)).toBe('');
        expect(resolveRequestPathWithQuery('')).toBe('');
    });

    it('absolute-form URL → путь с query', () => {
        expect(resolveRequestPathWithQuery('http://example.com/api/items?x=1')).toBe(
            '/api/items?x=1'
        );
    });
});

describe('shouldProxyRequest', () => {
    it('/api/bricks/** никогда не проксируется (persistence выбирает backend.mode)', () => {
        expect(shouldProxyRequest('/api/bricks')).toBe(false);
        expect(shouldProxyRequest('/api/bricks/page-1')).toBe(false);
        expect(shouldProxyRequest('/api/bricks/health')).toBe(false);
        expect(shouldProxyRequest('/api/bricks/health/ready')).toBe(false);
        expect(shouldProxyRequest('/api/bricks/media/upload')).toBe(false);
    });

    it('bricks-путь с query остаётся локальным (pathname разбирается до матчинга)', () => {
        const pathname = resolveRequestPathname('/api/bricks/health/ready?verbose=1');
        expect(shouldProxyRequest(pathname)).toBe(false);
    });

    it('mock-api никогда не проксируется', () => {
        expect(shouldProxyRequest('/mock-api/s3-page-thumbnail')).toBe(false);
        expect(shouldProxyRequest('/mock-api')).toBe(false);
    });

    it('остальные /api/** проксируются, не-API пути — нет', () => {
        expect(shouldProxyRequest('/api/items')).toBe(true);
        expect(shouldProxyRequest('/api/health')).toBe(true);
        expect(shouldProxyRequest('/api')).toBe(true);
        expect(shouldProxyRequest('/bricks')).toBe(false);
        expect(shouldProxyRequest('')).toBe(false);
    });

    it('границы сегментов: похожие префиксы не матчатся', () => {
        expect(shouldProxyRequest('/apifoo')).toBe(false);
        expect(shouldProxyRequest('/mock-apifoo')).toBe(false);
        // /api/bricksmith — не bricks-путь: проксируется
        expect(shouldProxyRequest('/api/bricksmith')).toBe(true);
    });
});

describe('buildProxyTargetUrl', () => {
    it('PROXY_URL без завершающего слэша — валидный target (источник прежнего 502)', () => {
        expect(buildProxyTargetUrl('http://localhost:8000', '/api/items')).toBe(
            'http://localhost:8000/api/items'
        );
    });

    it('PROXY_URL с завершающим слэшем — тот же target', () => {
        expect(buildProxyTargetUrl('http://localhost:8000/', '/api/items')).toBe(
            'http://localhost:8000/api/items'
        );
    });

    it('base path в PROXY_URL сохраняется', () => {
        expect(buildProxyTargetUrl('http://localhost:8000/backend', '/api/items')).toBe(
            'http://localhost:8000/backend/api/items'
        );
        expect(buildProxyTargetUrl('http://localhost:8000/backend/', '/api/items')).toBe(
            'http://localhost:8000/backend/api/items'
        );
    });

    it('query доезжает до upstream как есть', () => {
        expect(buildProxyTargetUrl('http://localhost:8000', '/api/items?x=1&url=/api/z')).toBe(
            'http://localhost:8000/api/items?x=1&url=/api/z'
        );
    });
});
