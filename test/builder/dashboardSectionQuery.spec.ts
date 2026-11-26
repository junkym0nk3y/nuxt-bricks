/**
 * @vitest-environment happy-dom
 *
 * The open section of the dashboard in the URL: a reload reopens the same section, a
 * switch replaces the entry and keeps the other query parameters, and the accounts
 * section named by the URL waits for the role instead of falling back to the pages.
 *
 * The router is the real one over a memory history: the races the URL write has to
 * survive (a replace still in flight, a route frozen by Suspense) live in its
 * navigation, and a mocked `replace` would pass them all.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { computed, defineComponent, h, nextTick, ref, type Ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import {
    createMemoryHistory,
    createRouter,
    type RouteLocationNormalizedLoaded,
    type Router,
} from 'vue-router';
// #endregion

// #region Mocks
const { routing } = vi.hoisted(() => ({
    routing: {
        router: null as Router | null,
        route: null as RouteLocationNormalizedLoaded | null,
    },
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    return {
        ...actual,
        useRoute: () => routing.route,
        useRouter: () => routing.router,
    };
});
// #endregion

import { usePublishDashboardSections } from '../../src/runtime/modules/builder/publish/composables/usePublishDashboardSections';

// #region Helpers
const EMPTY_PAGE = defineComponent({ render: () => null });

interface IMountedSections {
    sections: ReturnType<typeof usePublishDashboardSections>;
    router: Router;
}

/**
 * Mounts the composable on a dashboard opened at the given URL.
 *
 * @param url - The address the dashboard is opened at.
 * @param isUsersVisible - The visibility of the accounts section, changeable later.
 * @param isRouteFrozen - Hands the composable a snapshot of the route, the way Nuxt
 *   freezes the route of a page that Suspense keeps on screen while the next one loads.
 * @returns The composable and the router.
 */
async function mountSections(
    url: string,
    isUsersVisible: Ref<boolean> = ref(true),
    isRouteFrozen = false
): Promise<IMountedSections> {
    const router = createRouter({
        history: createMemoryHistory(),
        routes: [
            { path: '/bricks', component: EMPTY_PAGE },
            { path: '/bricks/template/:id', component: EMPTY_PAGE },
        ],
    });

    await router.push(url);
    routing.router = router;
    routing.route = isRouteFrozen
        ? { ...router.currentRoute.value }
        : new Proxy({} as RouteLocationNormalizedLoaded, {
              get: (_, key: keyof RouteLocationNormalizedLoaded) => router.currentRoute.value[key],
          });

    let sections: ReturnType<typeof usePublishDashboardSections> | null = null;

    mount(
        defineComponent({
            setup() {
                sections = usePublishDashboardSections({
                    pagesSearchQuery: ref(''),
                    isUsersSectionVisible: computed(() => isUsersVisible.value),
                    onEnterMedia: () => undefined,
                    onLeaveMedia: () => undefined,
                });

                return () => h('div');
            },
        })
    );
    await flushPromises();

    if (!sections) {
        throw new Error('The sections composable was not created');
    }

    return { sections, router };
}
// #endregion

describe('dashboard section in the URL', () => {
    it('reopens every section named by the URL, and the pages on an unknown name', async () => {
        const named: string[] = ['templates', 'users', 'media'];

        for (const section of named) {
            const { sections } = await mountSections(`/bricks?section=${section}`);

            expect(sections.activeSection.value).toBe(section);
        }

        const { sections, router } = await mountSections('/bricks?section=settings&q=promo');

        expect(sections.activeSection.value).toBe('pages');
        // The unknown name leaves the URL, the foreign parameter stays
        expect(router.currentRoute.value.fullPath).toBe('/bricks?q=promo');
    });

    it('writes a switch by replacing the entry and keeps the other parameters', async () => {
        const { sections, router } = await mountSections('/bricks?q=promo');
        const push = vi.spyOn(router, 'push');

        sections.selectSection('media');
        await flushPromises();

        expect(router.currentRoute.value.fullPath).toBe('/bricks?q=promo&section=media');

        sections.selectSection('pages');
        await flushPromises();

        expect(router.currentRoute.value.fullPath).toBe('/bricks?q=promo');
        expect(push).not.toHaveBeenCalled();
    });

    it('keeps the section switched back to before the first replace has landed', async () => {
        const { sections, router } = await mountSections('/bricks?section=media');

        sections.selectSection('templates');
        await nextTick();
        sections.selectSection('media');
        await flushPromises();

        expect(router.currentRoute.value.fullPath).toBe('/bricks?section=media');
    });

    it('leaves alone the address of a page the router has already moved to', async () => {
        const { sections, router } = await mountSections('/bricks', ref(true), true);

        await router.push('/bricks/template/5');
        sections.selectSection('media');
        await flushPromises();

        expect(router.currentRoute.value.fullPath).toBe('/bricks/template/5');
    });

    it('opens the accounts section once the role arrives, not the pages for good', async () => {
        const isUsersVisible = ref(false);
        const { sections } = await mountSections('/bricks?section=users', isUsersVisible);

        expect(sections.activeSection.value).toBe('pages');

        isUsersVisible.value = true;
        await nextTick();

        expect(sections.activeSection.value).toBe('users');
    });
});
