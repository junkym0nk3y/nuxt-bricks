/**
 * @vitest-environment happy-dom
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';

// Types
import type { IPublishedPage } from '../../src/runtime/modules/common/types/bricks-api';
import type { IRendererHtmlParts } from '../../src/runtime/modules/render/types/render';

// Fixtures
import { createPageBuilder } from '../helpers/publishFixtures';
// #endregion

const { requestEventMock } = vi.hoisted(() => ({ requestEventMock: vi.fn() }));

vi.mock('#imports', () => ({ useRequestEvent: requestEventMock }));

vi.mock('nitropack/runtime', () => ({
    defineNitroPlugin: (plugin: unknown) => plugin,
}));

import {
    appendPageCodeToHtml,
    mountPageCode,
} from '../../src/runtime/modules/render/utils/pageCode';
import { useRendererPageCode } from '../../src/runtime/modules/render/composables/useRendererPageCode';
import bricksPageCodePlugin from '../../src/runtime/server/plugins/bricksPageCode';

const buildPage = createPageBuilder();

const HEAD_CODE = '<script>window.counter = 1;</script>';
const BODY_CODE = '<noscript><img src="https://mc.example.com/watch/1" alt=""></noscript>';

/**
 * Builds empty parts of an SSR document.
 *
 * @returns The parts the hook appends to.
 */
function buildHtmlParts(): IRendererHtmlParts {
    return { head: ['<title>Page</title>'], bodyAppend: ['<script src="/entry.js"></script>'] };
}

/**
 * Counts the elements matching a selector in the whole document.
 *
 * @param selector - CSS selector.
 * @returns Number of matches.
 */
function countInDocument(selector: string): number {
    return document.querySelectorAll(selector).length;
}

/**
 * Mounts a component running the composable over a reactive page.
 *
 * @param initial - The page at mount, or none.
 * @param isPreview - Whether this is the preview surface.
 * @returns The wrapper and the ref of the page.
 */
function mountWithPage(initial: IPublishedPage | null, isPreview: boolean) {
    const pageRef = ref<IPublishedPage | null>(initial);
    const wrapper = mount(
        defineComponent({
            setup() {
                useRendererPageCode({ page: computed(() => pageRef.value), isPreview });

                return () => h('div');
            },
        })
    );

    return { wrapper, pageRef };
}

afterEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    requestEventMock.mockReset();
    vi.unstubAllGlobals();
});

describe('appendPageCodeToHtml', () => {
    it('appends the head code after the head tags and the body code after the Nuxt scripts', () => {
        const html = buildHtmlParts();

        appendPageCodeToHtml(html, { head: HEAD_CODE, bodyEnd: BODY_CODE });

        expect(html.head).toEqual(['<title>Page</title>', HEAD_CODE]);
        expect(html.bodyAppend).toEqual(['<script src="/entry.js"></script>', BODY_CODE]);
    });

    it('leaves the document alone for missing or blank code', () => {
        const html = buildHtmlParts();

        appendPageCodeToHtml(html, { head: null, bodyEnd: '  \n ' });

        expect(html).toEqual(buildHtmlParts());
    });

    it('trims the code before writing it', () => {
        const html = buildHtmlParts();

        appendPageCodeToHtml(html, { head: `\n  ${HEAD_CODE}  \n`, bodyEnd: null });

        expect(html.head.at(-1)).toBe(HEAD_CODE);
    });
});

describe('mountPageCode', () => {
    it('appends the parsed nodes after the existing children and returns them', () => {
        document.head.innerHTML = '<meta name="existing">';

        const nodes = mountPageCode(`${HEAD_CODE}<noscript>pixel</noscript>`, document.head);

        expect(nodes.map((node) => node.nodeName)).toEqual(['SCRIPT', 'NOSCRIPT']);
        expect(Array.from(document.head.children).map((node) => node.nodeName)).toEqual([
            'META',
            'SCRIPT',
            'NOSCRIPT',
        ]);
    });

    it('inserts nothing for blank code', () => {
        expect(mountPageCode('   ', document.body)).toEqual([]);
        expect(document.body.childNodes).toHaveLength(0);
    });
});

describe('bricksPageCode Nitro plugin', () => {
    /**
     * Registers the plugin against a fake Nitro app and returns its render:html hook.
     *
     * @returns The registered hook.
     */
    function registerHook(): (html: IRendererHtmlParts, context: { event: unknown }) => void {
        const hooks = new Map<
            string,
            (html: IRendererHtmlParts, context: { event: unknown }) => void
        >();
        const nitroApp = {
            hooks: {
                hook: (
                    name: string,
                    handler: (html: IRendererHtmlParts, context: { event: unknown }) => void
                ) => {
                    hooks.set(name, handler);
                },
            },
        };

        (bricksPageCodePlugin as unknown as (app: typeof nitroApp) => void)(nitroApp);

        const hook = hooks.get('render:html');
        if (!hook) {
            throw new Error('render:html hook was not registered');
        }

        return hook;
    }

    it('writes the code the render page put into the request context', () => {
        const hook = registerHook();
        const html = buildHtmlParts();

        hook(html, {
            event: { context: { bricksPageCode: { head: HEAD_CODE, bodyEnd: BODY_CODE } } },
        });

        expect(html.head).toContain(HEAD_CODE);
        expect(html.bodyAppend).toContain(BODY_CODE);
    });

    it('leaves a request that rendered no published page alone', () => {
        const hook = registerHook();
        const html = buildHtmlParts();

        hook(html, { event: { context: {} } });

        expect(html).toEqual(buildHtmlParts());
    });
});

describe('useRendererPageCode on the client', () => {
    it('runs the code in the preview: the head part into head, the body part into body', () => {
        mountWithPage(buildPage({ headCode: HEAD_CODE, bodyEndCode: BODY_CODE }), true);

        expect(document.head.querySelectorAll('script')).toHaveLength(1);
        expect(document.body.querySelectorAll('noscript')).toHaveLength(1);
    });

    it('does not rerun the code when only the schema of the preview changes', async () => {
        const { pageRef } = mountWithPage(buildPage({ headCode: HEAD_CODE }), true);

        pageRef.value = buildPage({
            headCode: HEAD_CODE,
            schema: { components: [] },
            title: 'Edited',
        });
        await nextTick();

        expect(countInDocument('script')).toBe(1);
    });

    it('runs the code once even when the live sync rebuilds the page from the saved data', async () => {
        const { pageRef } = mountWithPage(buildPage({ headCode: HEAD_CODE }), true);
        const inserted = document.head.querySelector('script');

        // The live sync answers the first schema request with the saved page: its code
        // must not run over the unsaved code the preview was opened with
        pageRef.value = buildPage({ headCode: '<script>window.saved = 1;</script>' });
        await nextTick();

        expect(document.head.querySelector('script')).toBe(inserted);
        expect(countInDocument('script')).toBe(1);
    });

    it('removes the code when the preview unmounts', () => {
        const { wrapper } = mountWithPage(
            buildPage({ headCode: HEAD_CODE, bodyEndCode: BODY_CODE }),
            true
        );

        wrapper.unmount();

        expect(countInDocument('script')).toBe(0);
        expect(countInDocument('noscript')).toBe(0);
    });

    it('inserts nothing while the preview has no page yet', async () => {
        const { pageRef } = mountWithPage(null, true);

        expect(countInDocument('script')).toBe(0);

        pageRef.value = buildPage({ headCode: HEAD_CODE });
        await nextTick();

        expect(countInDocument('script')).toBe(1);
    });

    it('leaves the published page alone on the client: the code came with the served HTML', () => {
        mountWithPage(buildPage({ headCode: HEAD_CODE, bodyEndCode: BODY_CODE }), false);

        expect(countInDocument('script')).toBe(0);
        expect(countInDocument('noscript')).toBe(0);
        expect(requestEventMock).not.toHaveBeenCalled();
    });
});

describe('useRendererPageCode on the server', () => {
    beforeEach(() => {
        vi.stubGlobal('__BRICKS_TEST_SERVER__', true);
    });

    it('hands the code of the published page to the render:html hook through the request context', () => {
        const event = { context: {} as Record<string, unknown> };
        requestEventMock.mockReturnValue(event);

        mountWithPage(buildPage({ headCode: HEAD_CODE, bodyEndCode: BODY_CODE }), false);

        expect(event.context.bricksPageCode).toEqual({ head: HEAD_CODE, bodyEnd: BODY_CODE });
        expect(countInDocument('script')).toBe(0);
    });

    it('leaves the server render of the preview without the code', () => {
        mountWithPage(buildPage({ headCode: HEAD_CODE }), true);

        expect(requestEventMock).not.toHaveBeenCalled();
        expect(countInDocument('script')).toBe(0);
    });

    it('puts nothing into the context when there is no page to render', () => {
        const event = { context: {} as Record<string, unknown> };
        requestEventMock.mockReturnValue(event);

        mountWithPage(null, false);

        expect(event.context).toEqual({});
    });
});
