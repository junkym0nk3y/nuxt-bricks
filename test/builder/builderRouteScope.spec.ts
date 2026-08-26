// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { routerMock, requestUrlMock } = vi.hoisted(() => ({
    routerMock: {
        beforeResolve: vi.fn(),
    },
    requestUrlMock: { pathname: '/' },
}));

vi.mock('#imports', () => ({
    useRouter: () => routerMock,
    useRuntimeConfig: () => ({ public: {}, app: { baseURL: '/' } }),
    useRequestURL: () => requestUrlMock,
}));
// #endregion

import {
    runOnBricksSurface,
    runOnBuilderRoute,
} from '../../src/runtime/plugins/utils/builderRouteScope';

/** A deferred installation: the test decides when it ends and how. */
interface IDeferredInstall {
    install: () => Promise<void>;
    calls: () => number;
    settle: (index: number, error?: Error) => void;
}

/**
 * Builds an installation that can be finished by hand on any attempt.
 *
 * @returns The install function, the call counter and the settling of an attempt.
 */
function createDeferredInstall(): IDeferredInstall {
    const resolvers: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];

    return {
        install: () =>
            new Promise<void>((resolve, reject) => {
                resolvers.push({ resolve, reject });
            }),
        calls: () => resolvers.length,
        settle: (index: number, error?: Error) => {
            const resolver = resolvers[index];

            if (error) {
                resolver.reject(error);
                return;
            }

            resolver.resolve();
        },
    };
}

/**
 * Returns the handler registered in `router.beforeResolve`.
 *
 * @returns The navigation handler.
 */
function getBeforeResolve(): (to: { path: string }) => Promise<void> {
    return routerMock.beforeResolve.mock.calls[0][0] as (to: { path: string }) => Promise<void>;
}

/**
 * Gives the microtasks a chance to run, so that "still pending" and "already
 * finished" are told apart for real.
 */
async function flushMicrotasks(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('lazy installation on the builder routes', () => {
    beforeEach(() => {
        routerMock.beforeResolve.mockReset();
        requestUrlMock.pathname = '/';
    });

    it('makes parallel navigations wait for one installation rather than a flag', async () => {
        const deferred = createDeferredInstall();
        await runOnBuilderRoute(deferred.install);

        const beforeResolve = getBeforeResolve();
        let isSecondSettled = false;
        const first = beforeResolve({ path: '/bricks/page-a' });
        const second = beforeResolve({ path: '/bricks/page-b' }).then(() => {
            isSecondSettled = true;
        });

        await flushMicrotasks();

        expect(deferred.calls()).toBe(1);
        // A flag raised before the await let the second navigation through at once:
        // the page rendered with no toolbar provider and no validation rules
        expect(isSecondSettled).toBe(false);

        deferred.settle(0);
        await Promise.all([first, second]);

        expect(isSecondSettled).toBe(true);
        expect(deferred.calls()).toBe(1);
    });

    it('retries a refused installation on the next navigation', async () => {
        const deferred = createDeferredInstall();
        await runOnBuilderRoute(deferred.install);

        const beforeResolve = getBeforeResolve();
        const failing = beforeResolve({ path: '/bricks/page-a' });
        deferred.settle(0, new Error('ChunkLoadError'));

        await expect(failing).rejects.toThrow('ChunkLoadError');

        const retried = beforeResolve({ path: '/bricks/page-a' });
        await flushMicrotasks();

        expect(deferred.calls()).toBe(2);

        deferred.settle(1);
        await expect(retried).resolves.toBeUndefined();
    });

    it('does not run a successful installation a second time', async () => {
        const deferred = createDeferredInstall();
        requestUrlMock.pathname = '/bricks/page-a';

        const bootstrap = runOnBuilderRoute(deferred.install);
        deferred.settle(0);
        await bootstrap;

        const beforeResolve = getBeforeResolve();
        await beforeResolve({ path: '/bricks/page-b' });

        expect(deferred.calls()).toBe(1);
    });

    it('leaves the routes of the consumer application alone', async () => {
        const deferred = createDeferredInstall();
        await runOnBuilderRoute(deferred.install);

        await getBeforeResolve()({ path: '/pricing' });

        expect(deferred.calls()).toBe(0);
    });
});

/**
 * The two entry points differ in the path predicate alone — the mechanics of the
 * one-time installation are already covered above through `runOnBuilderRoute`, so
 * what is checked here is the difference itself: the preview surface belongs to the
 * kit (the glyph of the chosen device is drawn by its banner), while a published
 * page of the consumer must not pull the builder chunks in.
 */
describe('lazy installation on the builder and preview surfaces', () => {
    beforeEach(() => {
        routerMock.beforeResolve.mockReset();
        requestUrlMock.pathname = '/';
    });

    it('installs on the preview route, which the builder-only scope leaves out', async () => {
        const install = vi.fn(() => Promise.resolve());
        await runOnBricksSurface(install);

        await getBeforeResolve()({ path: '/bricks-preview/blog/post' });

        expect(install).toHaveBeenCalledTimes(1);
    });

    it('leaves a published page of the consumer alone', async () => {
        const install = vi.fn(() => Promise.resolve());
        await runOnBricksSurface(install);

        await getBeforeResolve()({ path: '/blog/post' });

        expect(install).not.toHaveBeenCalled();
    });
});
