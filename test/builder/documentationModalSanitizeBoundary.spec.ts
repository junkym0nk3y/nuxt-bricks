/**
 * @vitest-environment happy-dom
 *
 * The sanitizer boundary of the documentation modal.
 *
 * The profile of the guide is checked separately (`documentationSanitize.spec.ts`),
 * but on its own it guarantees nothing: the article reaches the DOM through
 * `v-html`, and binding the raw string in the template instead of the sanitized one
 * is enough to leave the profile working and unused. The cases below look at that
 * very binding — through the rendered markup rather than through the text of the
 * file.
 *
 * Here too is the intercept of clicks on the links of an article: a cross-link
 * `./NN-name.md` leads around the guide inside the modal, a fragment link scrolls the
 * article to its heading, and everything else is left to the browser.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const articleContent = ref('');
const activeArticlePath = ref('../docs/guide/ru/01-getting-started.md');
const navigateToMock = vi.fn();

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock(
    '../../src/runtime/modules/builder/documentation/composables/useDocumentationArticles',
    async () => {
        const { computed } = await import('vue');

        return {
            useDocumentationArticles: () => ({
                articles: computed(() => [
                    {
                        path: '../docs/guide/ru/01-getting-started.md',
                        title: 'Start',
                        order: 1,
                        slug: 'start',
                    },
                ]),
                activeArticlePath,
                articleContent,
                isContentLoading: ref(false),
                navigateTo: navigateToMock,
                initFirstArticle: vi.fn(),
                hasArticles: computed(() => true),
            }),
        };
    }
);
// #endregion

import TheBuilderDocumentationModal from '../../src/runtime/modules/builder/documentation/components/TheBuilderDocumentationModal.vue';

/** The modal of the kit draws its content with no teleport — otherwise the wrapper holds no markup. */
const BricksModalStub = defineComponent({
    props: { isOpen: { type: Boolean, default: false }, title: { type: String, default: '' } },
    setup(props, { slots }) {
        return () => (props.isOpen ? h('div', slots.default?.()) : null);
    },
});

/** The header of the kit carries the close button — the modal passes its event up. */
const BricksModalHeaderStub = defineComponent({
    emits: ['close'],
    setup:
        (_props, { emit }) =>
        () =>
            h('button', { onClick: () => emit('close') }, 'close'),
});

/**
 * Mounts the modal with the stubs of the kit.
 *
 * @returns The @vue/test-utils wrapper.
 */
function mountModal(): ReturnType<typeof mount> {
    return mount(TheBuilderDocumentationModal, {
        props: { isOpen: true },
        global: {
            stubs: {
                BricksModal: BricksModalStub,
                BricksModalHeader: BricksModalHeaderStub,
            },
        },
    });
}

describe('documentation modal: the article reaches the DOM sanitized', () => {
    it('executable markup of an article never reaches the markup of the modal', () => {
        articleContent.value =
            '<p>safe</p><script>alert(1)</script><img src="/x.png" onerror="alert(2)">';

        const wrapper = mountModal();

        const html = wrapper.html();

        expect(html).toContain('safe');
        expect(html).not.toContain('<script');
        expect(html).not.toContain('alert(1)');
        expect(html).not.toContain('onerror');

        wrapper.unmount();
    });

    it('a table of the article stays in place all the same', () => {
        articleContent.value = '<table><tbody><tr><td>cell</td></tr></tbody></table>';

        const wrapper = mountModal();

        // The sanitizer at the boundary must not turn out to be the shared profile:
        // that one would cut the tables of the whole guide out, and silently
        expect(wrapper.html()).toContain('<table>');
        expect(wrapper.html()).toContain('cell');

        wrapper.unmount();
    });

    it('a link to a neighboring article leads inside the modal, not into the browser', async () => {
        articleContent.value = '<p><a href="./02-interface.md">next</a></p>';
        navigateToMock.mockClear();

        const wrapper = mountModal();
        await wrapper.get('a').trigger('click');

        expect(navigateToMock).toHaveBeenCalledWith('./02-interface.md');

        wrapper.unmount();
    });

    it('an external link stays with the browser even when it ends in .md', async () => {
        // The address is chosen on purpose: an "ends with .md" test would intercept
        // it, cancel the navigation and find no such article — the link would simply
        // stop working. The handler and the sanitizer ask one predicate about it
        articleContent.value = '<p><a href="https://example.com/manual.md">out</a></p><p>plain</p>';
        navigateToMock.mockClear();

        const wrapper = mountModal();
        await wrapper.get('a').trigger('click');
        // A click beside a link starts no navigation either
        await wrapper.get('p:last-of-type').trigger('click');

        expect(navigateToMock).not.toHaveBeenCalled();

        wrapper.unmount();
    });

    it('a fragment link scrolls the article to its heading', async () => {
        // The heading carries a Cyrillic id, and markdown-it writes the fragment into
        // the href percent-encoded: compared raw the two sides would never meet
        articleContent.value =
            '<p>lead</p><h2 id="слой">Слой</h2><p><a href="#%D1%81%D0%BB%D0%BE%D0%B9">go</a></p>';
        navigateToMock.mockClear();

        const wrapper = mountModal();
        const content = wrapper.get('[class*="content"]').element as HTMLElement;
        const scrollTo = vi.fn();
        content.scrollTo = scrollTo;
        content.scrollTop = 40;
        content.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
        (wrapper.get('h2').element as HTMLElement).getBoundingClientRect = () =>
            ({ top: 500 }) as DOMRect;

        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        wrapper.get('a').element.dispatchEvent(event);

        // The offset is computed against the scrollbox of the modal rather than
        // handed to `scrollIntoView`: that one is free to scroll the page under it
        expect(scrollTo).toHaveBeenCalledWith({ top: 440 });
        // The fragment is taken away from the browser: native navigation would write
        // it into the address of the builder, and the router of the SPA would then be
        // free to treat it as a navigation of its own
        expect(event.defaultPrevented).toBe(true);
        expect(navigateToMock).not.toHaveBeenCalled();

        wrapper.unmount();
    });

    it('a fragment nothing answers still stays out of the address bar', async () => {
        articleContent.value = '<p><a href="#missing">go</a></p>';
        navigateToMock.mockClear();

        const wrapper = mountModal();
        const content = wrapper.get('[class*="content"]').element as HTMLElement;
        const scrollTo = vi.fn();
        content.scrollTo = scrollTo;

        const event = new MouseEvent('click', { bubbles: true, cancelable: true });
        wrapper.get('a').element.dispatchEvent(event);

        expect(scrollTo).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
        expect(navigateToMock).not.toHaveBeenCalled();

        wrapper.unmount();
    });

    it('the heading is looked for inside the modal, not across the document', async () => {
        // The slug of a heading is its plain text, so the builder underneath the
        // modal is free to carry a node with the same id — and scrolling to it would
        // move a surface the reader is not looking at
        articleContent.value = '<p><a href="#duplicate">go</a></p>';
        const outsider = document.createElement('h2');
        outsider.id = 'duplicate';
        document.body.appendChild(outsider);

        const wrapper = mountModal();
        const content = wrapper.get('[class*="content"]').element as HTMLElement;
        const scrollTo = vi.fn();
        content.scrollTo = scrollTo;

        await wrapper.get('a').trigger('click');

        expect(scrollTo).not.toHaveBeenCalled();

        outsider.remove();
        wrapper.unmount();
    });

    it('a middle click on a cross-link does not leave for the browser either', async () => {
        // An article has no address of its own, so a new tab would show the builder
        // with the guide closed — and a cross-link resolved by the browser lands on
        // the editor route of a page by that name, which opens an empty draft
        articleContent.value = '<p><a href="./02-interface.md">next</a></p>';
        navigateToMock.mockClear();

        const wrapper = mountModal();
        const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
        wrapper.get('a').element.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(true);
        expect(navigateToMock).toHaveBeenCalledWith('./02-interface.md');

        wrapper.unmount();
    });

    it('a mouse history button is left alone', async () => {
        // The back and forward buttons arrive as `auxclick` as well, and cancelling a
        // navigation of the history is not ours to do
        articleContent.value = '<p><a href="./02-interface.md">next</a></p>';
        navigateToMock.mockClear();

        const wrapper = mountModal();
        const event = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 3 });
        wrapper.get('a').element.dispatchEvent(event);

        expect(event.defaultPrevented).toBe(false);
        expect(navigateToMock).not.toHaveBeenCalled();

        wrapper.unmount();
    });

    it('the close of the header reaches the host', async () => {
        articleContent.value = '<p>x</p>';

        const wrapper = mountModal();
        await wrapper.get('button').trigger('click');

        expect(wrapper.emitted('close')).toHaveLength(1);

        wrapper.unmount();
    });

    it('switching an article returns the scroll to the top', async () => {
        articleContent.value = '<p>first</p>';

        const wrapper = mountModal();
        const content = wrapper.get('[class*="content"]').element as HTMLElement;
        const scrollTo = vi.fn();
        content.scrollTo = scrollTo;

        activeArticlePath.value = '../docs/guide/ru/02-interface.md';
        await nextTick();

        // Otherwise a new article opens in the middle of the previous one
        expect(scrollTo).toHaveBeenCalledWith({ top: 0 });

        wrapper.unmount();
    });
});
