/**
 * @vitest-environment happy-dom
 *
 * The controls of the editor header carry a name that holds what they show. A link made of
 * a picture alone had no name at all, and a button named apart from its visible text fails
 * voice control, where a person says what they see. The browser gate of axe saw neither
 * for a long time: it ran while the loader held the header under `inert`.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';

// Components
import BuilderLogo from '../../src/runtime/modules/builder/core/components/BuilderLogo.vue';
import BuilderShellToolbarVerticalNav from '../../src/runtime/modules/builder/shell/toolbar/components/BuilderShellToolbarVerticalNav.vue';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
        locale: ref('en'),
    }),
}));

vi.mock('../../src/runtime/modules/builder/core/composables/useBuilderPermissions', async () => {
    const { computed } = await import('vue');

    return { useBuilderPermissions: () => ({ canEdit: computed(() => true) }) };
});
// #endregion

// #region Helpers
/** The tooltip draws its activator alone: the hint is not what the name is made of */
const BricksTooltipStub = defineComponent({
    name: 'BricksTooltip',
    setup:
        (_, { slots }) =>
        () =>
            h('div', slots.activator?.()),
});
// #endregion

describe('BuilderLogo: the name of the link', () => {
    it('names the link and hides the picture from a screen reader', () => {
        const wrapper = mount(BuilderLogo, { props: { to: '/bricks', label: 'All pages' } });
        const link = wrapper.find('a');

        expect(link.attributes('aria-label')).toBe('All pages');
        expect(link.attributes('href')).toBe('/bricks');
        expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
    });

    it('stays a plain picture without an address', () => {
        const wrapper = mount(BuilderLogo, { props: { label: 'All pages' } });

        expect(wrapper.find('a').exists()).toBe(false);
        expect(wrapper.find('[aria-label]').exists()).toBe(false);
    });
});

describe('BuilderShellToolbarVerticalNav: the language button', () => {
    it('holds the code it shows in its name', () => {
        const wrapper = mount(BuilderShellToolbarVerticalNav, {
            global: { stubs: { BricksTooltip: BricksTooltipStub, BricksIcon: true } },
        });
        const button = wrapper.findAll('button').find((candidate) => candidate.text() === 'EN');

        expect(button?.attributes('aria-label')).toBe('EN bricks.nav.language');
    });
});
