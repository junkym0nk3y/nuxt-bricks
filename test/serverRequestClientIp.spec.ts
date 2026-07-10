// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
// #endregion

// #region Mocks
const runtimeConfig: Record<string, unknown> = {};

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
}));

const { parseTrustProxyFlag, resolveClientIp, resolveRequestClientIp } =
    await import('../src/runtime/server/utils/requestClientIp');

/**
 * Минимальный фейковый H3Event с заголовками и socket-адресом.
 */
function makeEvent(headers: Record<string, string>, remoteAddress?: string): H3Event {
    return {
        node: { req: { headers, socket: { remoteAddress } } },
    } as unknown as H3Event;
}
// #endregion

describe('requestClientIp: parseTrustProxyFlag', () => {
    it('boolean проходит как есть', () => {
        expect(parseTrustProxyFlag(true)).toBe(true);
        expect(parseTrustProxyFlag(false)).toBe(false);
    });

    it('env-строки: truthy-варианты включают, остальные — нет', () => {
        expect(parseTrustProxyFlag('true')).toBe(true);
        expect(parseTrustProxyFlag('1')).toBe(true);
        expect(parseTrustProxyFlag(' TRUE ')).toBe(true);
        expect(parseTrustProxyFlag('on')).toBe(true);

        expect(parseTrustProxyFlag('false')).toBe(false);
        expect(parseTrustProxyFlag('0')).toBe(false);
        expect(parseTrustProxyFlag('')).toBe(false);
    });

    it('не-строки/не-boolean — false (fail-closed)', () => {
        expect(parseTrustProxyFlag(undefined)).toBe(false);
        expect(parseTrustProxyFlag(null)).toBe(false);
        expect(parseTrustProxyFlag(1)).toBe(false);
    });
});

describe('requestClientIp: resolveClientIp', () => {
    it('без trustProxy заголовок игнорируется — только socket-адрес', () => {
        expect(resolveClientIp('6.6.6.6', '10.0.0.2', false)).toBe('10.0.0.2');
    });

    it('c trustProxy берётся последний элемент x-forwarded-for (дописан прокси)', () => {
        // Клиент прислал собственный XFF '6.6.6.6', аппендящий прокси добавил реальный IP
        expect(resolveClientIp('6.6.6.6, 203.0.113.7', '10.0.0.2', true)).toBe('203.0.113.7');
        expect(resolveClientIp('203.0.113.7', '10.0.0.2', true)).toBe('203.0.113.7');
    });

    it('c trustProxy, но без заголовка — socket-адрес', () => {
        expect(resolveClientIp(undefined, '10.0.0.2', true)).toBe('10.0.0.2');
        expect(resolveClientIp(' , ', '10.0.0.2', true)).toBe('10.0.0.2');
    });

    it('нет ни заголовка, ни socket-адреса — "unknown"', () => {
        expect(resolveClientIp(undefined, undefined, false)).toBe('unknown');
        expect(resolveClientIp(undefined, '', true)).toBe('unknown');
    });
});

describe('requestClientIp: resolveRequestClientIp (runtimeConfig + event)', () => {
    it('bricksTrustProxy из env-строки включает разбор заголовка', () => {
        runtimeConfig.bricksTrustProxy = 'true';

        const event = makeEvent({ 'x-forwarded-for': '6.6.6.6, 203.0.113.7' }, '10.0.0.2');
        expect(resolveRequestClientIp(event)).toBe('203.0.113.7');
    });

    it('без флага (дефолт) — socket-адрес, заголовок игнорируется', () => {
        runtimeConfig.bricksTrustProxy = false;

        const event = makeEvent({ 'x-forwarded-for': '6.6.6.6' }, '10.0.0.2');
        expect(resolveRequestClientIp(event)).toBe('10.0.0.2');
    });
});
