/**
 * @vitest-environment happy-dom
 *
 * The shared SEO block of the publish settings carries the page code and the noindex
 * flag. Both hosts — the sidebar of the editor and the details panel of the dashboard —
 * bind it through props and `update:*` events, so the block has to report every field
 * under its own event: a field wired to the wrong one would write the head code into
 * the body slot or drop the flag without a word. The bindings inside the hosts are not
 * covered here — no spec mounts either host.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { mount } from '@vue/test-utils';

// Types
import type { IPublishSeoFieldsProps } from '../../src/runtime/modules/builder/publish/types/seoFields';
// #endregion

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

import BuilderPublishSeoFields from '../../src/runtime/modules/builder/publish/components/BuilderPublishSeoFields.vue';
import BricksInput from '../../src/runtime/modules/ui/inputs/BricksInput.vue';
import BricksTagsEditor from '../../src/runtime/modules/ui/inputs/BricksTagsEditor.vue';

const HEAD_CODE = '<script>ym(1, "init");</script>';
const BODY_CODE = '<noscript><img src="https://mc.example.com/watch/1" alt=""></noscript>';

/**
 * Mounts the SEO block with valid defaults.
 *
 * @param overrides - Props on top of the defaults.
 * @returns The wrapper.
 */
function mountFields(overrides: Partial<IPublishSeoFieldsProps> = {}) {
    return mount(BuilderPublishSeoFields, {
        props: {
            title: 'Landing',
            pagename: 'landing',
            description: 'A description',
            keywords: 'promo',
            noindex: false,
            headCode: HEAD_CODE,
            bodyEndCode: BODY_CODE,
            errors: {},
            ...overrides,
        },
        global: { stubs: { BricksIcon: true } },
    });
}

/**
 * Finds a code textarea by its label.
 *
 * @param wrapper - Mounted SEO block.
 * @param label - Locale key of the field label.
 * @returns The textarea element.
 */
function findCodeArea(wrapper: ReturnType<typeof mountFields>, label: string): HTMLTextAreaElement {
    const area = wrapper.find(`textarea[aria-label="${label}"]`);
    if (!area.exists()) {
        throw new Error(`No textarea labeled ${label}`);
    }

    return area.element as HTMLTextAreaElement;
}

describe('page code and noindex in the SEO block', () => {
    it('shows the code of each slot in its own field', () => {
        const wrapper = mountFields();

        expect(findCodeArea(wrapper, 'bricks.publish.code.headLabel').value).toBe(HEAD_CODE);
        expect(findCodeArea(wrapper, 'bricks.publish.code.bodyEndLabel').value).toBe(BODY_CODE);
    });

    it('reports an edit of each code field under its own event', async () => {
        const wrapper = mountFields();

        await wrapper
            .find('textarea[aria-label="bricks.publish.code.headLabel"]')
            .setValue('<b>h</b>');
        await wrapper
            .find('textarea[aria-label="bricks.publish.code.bodyEndLabel"]')
            .setValue('<i>b</i>');

        expect(wrapper.emitted('update:headCode')).toEqual([['<b>h</b>']]);
        expect(wrapper.emitted('update:bodyEndCode')).toEqual([['<i>b</i>']]);
    });

    it('turns the noindex flag on from the checkbox', async () => {
        const wrapper = mountFields();

        await wrapper.find('[role="checkbox"]').trigger('click');

        expect(wrapper.emitted('update:noindex')).toEqual([[true]]);
    });

    it('shows the flag that is set and turns it off', async () => {
        const wrapper = mountFields({ noindex: true });
        const checkbox = wrapper.find('[role="checkbox"]');

        expect(checkbox.attributes('aria-checked')).toBe('true');

        await checkbox.trigger('click');

        expect(wrapper.emitted('update:noindex')).toEqual([[false]]);
    });

    it('puts the length error under the code field it belongs to', () => {
        const wrapper = mountFields({ errors: { bodyEndCode: 'too long' } });

        expect(wrapper.text()).toContain('too long');
        expect(wrapper.findAll('[aria-invalid="true"]')).toHaveLength(1);
        expect(
            wrapper
                .find('textarea[aria-label="bricks.publish.code.bodyEndLabel"]')
                .attributes('aria-invalid')
        ).toBe('true');
    });

    it('blocks the code fields while the form is busy', () => {
        const wrapper = mountFields({ disabled: true });

        for (const area of wrapper.findAll('textarea')) {
            expect(area.attributes('disabled')).toBeDefined();
        }
    });

    it('keeps the spellchecker off the code', () => {
        const wrapper = mountFields();

        // The attribute is inherited by the textarea from the wrapper of the field
        for (const label of ['bricks.publish.code.headLabel', 'bricks.publish.code.bodyEndLabel']) {
            const area = findCodeArea(wrapper, label);
            expect(area.closest('[spellcheck]')?.getAttribute('spellcheck')).toBe('false');
        }
    });
});

describe('the rest of the SEO block keeps its events', () => {
    it('reports the title, the address, the description and the keywords', async () => {
        const wrapper = mountFields();
        const [title, pagename] = wrapper.findAllComponents(BricksInput);

        title?.vm.$emit('update:value', 'New title');
        pagename?.vm.$emit('update:value', 'new-page');
        await wrapper
            .find('textarea[aria-label="bricks.publish.seo.descriptionLabel"]')
            .setValue('New description');
        wrapper.findComponent(BricksTagsEditor).vm.$emit('update:modelValue', ['promo', 'sale']);

        expect(wrapper.emitted('update:title')).toEqual([['New title']]);
        expect(wrapper.emitted('update:pagename')).toEqual([['new-page']]);
        expect(wrapper.emitted('update:description')).toEqual([['New description']]);
        expect(wrapper.emitted('update:keywords')?.[0]?.[0]).toMatch(/promo.*sale/);
    });
});
