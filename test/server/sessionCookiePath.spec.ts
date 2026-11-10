/**
 * The session cookie lives under the application's base path.
 *
 * With the root path an application mounted under a prefix next to another site
 * (`/landings/` on a shared domain) sent the editor's session token with every request to
 * that site. Setting and deleting must use the same path: a deletion on another path
 * leaves the cookie in the browser.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
// #endregion

// #region Mocks
const { setCookieMock, deleteCookieMock, runtimeConfig } = vi.hoisted(() => ({
    setCookieMock: vi.fn(),
    deleteCookieMock: vi.fn(),
    runtimeConfig: { app: { baseURL: '/' } } as { app?: { baseURL?: string } },
}));

vi.mock('h3', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    setCookie: setCookieMock,
    deleteCookie: deleteCookieMock,
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
}));

import {
    clearSessionCookie,
    resolveSessionCookiePath,
    setSessionCookie,
} from '../../src/runtime/server/utils/auth/sessionCookie';
// #endregion

const EVENT = {} as H3Event;

describe('session cookie path', () => {
    beforeEach(() => {
        setCookieMock.mockReset();
        deleteCookieMock.mockReset();
        runtimeConfig.app = { baseURL: '/' };
    });

    it('keeps the root path without a base', () => {
        setSessionCookie(EVENT, 'token', 60);

        expect(setCookieMock.mock.calls[0][3]).toMatchObject({ path: '/', httpOnly: true });
    });

    it('sets and deletes the cookie under app.baseURL', () => {
        runtimeConfig.app = { baseURL: '/landings/' };

        setSessionCookie(EVENT, 'token', 60);
        clearSessionCookie(EVENT);

        expect(setCookieMock.mock.calls[0][3]).toMatchObject({ path: '/landings/' });
        expect(deleteCookieMock.mock.calls[0][2]).toEqual({ path: '/landings/' });
    });

    it.each([
        ['no app config', undefined],
        ['an empty base', { baseURL: '' }],
        ['a relative base', { baseURL: './' }],
    ])('falls back to the root path: %s', (_label, app) => {
        runtimeConfig.app = app;

        expect(resolveSessionCookiePath()).toBe('/');
    });
});
