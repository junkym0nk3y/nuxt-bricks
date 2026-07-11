// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    resolveRequestPathname,
    shouldProxyRequest,
} from '../src/runtime/server/utils/proxyRouting';
// #endregion

/**
 * Сокращение для shouldProxyRequest с дефолтами (GET, без локальной БД).
 */
function proxied(
    pathname: string,
    overrides: Partial<{ method: string; hasLocalDatabase: boolean }> = {}
): boolean {
    return shouldProxyRequest(pathname, {
        method: 'GET',
        hasLocalDatabase: false,
        ...overrides,
    });
}

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

describe('shouldProxyRequest', () => {
    it('health-пробы всегда локальные — даже без локальной БД в proxy-режиме', () => {
        expect(proxied('/api/bricks/health')).toBe(false);
        expect(proxied('/api/bricks/health/ready')).toBe(false);
        expect(proxied('/api/bricks/health', { method: 'HEAD' })).toBe(false);
        expect(proxied('/api/bricks/health', { hasLocalDatabase: true })).toBe(false);
    });

    it('health с query остаётся локальным (pathname разбирается до матчинга)', () => {
        const pathname = resolveRequestPathname('/api/bricks/health/ready?verbose=1');
        expect(proxied(pathname)).toBe(false);
    });

    it('похожие на health пути — обычные проксируемые', () => {
        expect(proxied('/api/bricks/healthcheck')).toBe(true);
        expect(proxied('/api/bricks/health/ready/extra')).toBe(true);
        expect(proxied('/api/health')).toBe(true);
    });

    it('не-GET/HEAD методы health-путей идут по общим правилам', () => {
        expect(proxied('/api/bricks/health', { method: 'POST' })).toBe(true);
        expect(proxied('/api/bricks/health', { method: 'POST', hasLocalDatabase: true })).toBe(
            false
        );
    });

    it('/api/bricks/**: локально при БД, на прокси без БД', () => {
        expect(proxied('/api/bricks/page-1', { hasLocalDatabase: true })).toBe(false);
        expect(proxied('/api/bricks', { hasLocalDatabase: true })).toBe(false);
        expect(proxied('/api/bricks/page-1')).toBe(true);
    });

    it('mock-api никогда не проксируется', () => {
        expect(proxied('/mock-api/s3-page-thumbnail')).toBe(false);
        expect(proxied('/mock-api/s3-page-thumbnail', { hasLocalDatabase: true })).toBe(false);
    });

    it('остальные /api/** проксируются, не-API пути — нет', () => {
        expect(proxied('/api/items')).toBe(true);
        expect(proxied('/api/items', { hasLocalDatabase: true })).toBe(true);
        expect(proxied('/bricks')).toBe(false);
        expect(proxied('')).toBe(false);
    });

    it('границы сегментов: похожие префиксы не матчатся', () => {
        expect(proxied('/apifoo')).toBe(false);
        expect(proxied('/mock-apifoo')).toBe(false);
        // /api/bricksmith — не bricks-путь: проксируется даже при локальной БД
        expect(proxied('/api/bricksmith', { hasLocalDatabase: true })).toBe(true);
    });
});
