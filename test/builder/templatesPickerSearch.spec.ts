/**
 * @vitest-environment happy-dom
 *
 * The search of the template picker: the boundary it appears at, and what it filters by.
 *
 * The boundary is guarded alone: five templates get no search field, six do. It is the
 * rule that is checked, not the layout the number comes from — the threshold is derived
 * from the capped height of the list, and a change of that cap or of the height of a row
 * leaves this spec green. The derivation itself is written down beside the constant.
 *
 * The filtering is driven through the real field rather than through the computed: what
 * the user has is an input and a list of names, and a test bound to the internals would
 * survive the field being wired to nothing at all.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { defineComponent, h } from 'vue';

// Test utils
import { mount, type VueWrapper } from '@vue/test-utils';

// Types
import type { TBricksTemplateSummary } from '../../src/runtime/modules/common/types/templates';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

// The rules of the field are registered by a Nuxt plugin of the app, which no unit test
// runs: without the mock every keystroke rejects with "No such validator max exists"
vi.mock('vee-validate', () => ({
    validate: async () => ({ errors: [] as string[] }),
}));
// #endregion

import BuilderTemplatesPickerList from '../../src/runtime/modules/builder/templates/components/BuilderTemplatesPickerList.vue';

// #region Fixtures
/** `BricksIcon` arrives through the auto-import of Nuxt — outside the app it is stubbed */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/**
 * A list of templates of the requested size.
 *
 * @param count - The number of templates.
 * @returns The summaries of the templates.
 */
function buildTemplates(count: number): TBricksTemplateSummary[] {
    return Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        name: `Template ${index + 1}`,
        description: null,
        thumbnailUrl: null,
        blocksCount: 1,
        createdAt: '2026-08-19T10:00:00.000Z',
        updatedAt: '2026-08-19T10:00:00.000Z',
    }));
}

/**
 * A template with the fields the search looks at.
 *
 * @param id - Id of the template.
 * @param name - Name shown in the row.
 * @param description - Description, the second field of the search.
 * @returns The summary of the template.
 */
function buildTemplate(
    id: number,
    name: string,
    description: string | null
): TBricksTemplateSummary {
    return {
        id,
        name,
        description,
        thumbnailUrl: null,
        blocksCount: 1,
        createdAt: '2026-08-19T10:00:00.000Z',
        updatedAt: '2026-08-19T10:00:00.000Z',
    };
}

/**
 * The list the search is checked over: six templates, so the field is on screen.
 *
 * The names deliberately share no word with the descriptions — a match found by the
 * description alone is what tells the two fields apart.
 */
const SEARCHABLE_TEMPLATES: TBricksTemplateSummary[] = [
    buildTemplate(1, 'Landing hero', 'Wide cover with a headline'),
    buildTemplate(2, 'Pricing table', 'Three plans side by side'),
    buildTemplate(3, 'Contact block', null),
    buildTemplate(4, 'Footer wide', 'Links and a copyright line'),
    buildTemplate(5, 'Gallery strip', 'Row of pictures'),
    buildTemplate(6, 'Article body', 'Long read with quotes'),
];

/**
 * Mounts the picker over the searchable list and returns the field plus a reader of the
 * names currently on screen.
 *
 * @returns The wrapper, the search field and the names of the visible rows.
 */
function mountSearchablePicker(): {
    wrapper: VueWrapper;
    search: (query: string) => Promise<void>;
    visibleNames: () => string[];
} {
    const wrapper = mount(BuilderTemplatesPickerList, {
        props: {
            templates: SEARCHABLE_TEMPLATES,
            isLoading: false,
            selectedTemplateId: null,
        },
        global: { components: { BricksIcon: BricksIconStub } },
    });

    const field = wrapper.find('input[placeholder="bricks.publish.dashboard.search.templates"]');

    /**
     * Types a query into the field the way a person does: through the native input, so
     * the whole chain of the kit component takes part.
     *
     * @param query - Text of the query.
     */
    async function search(query: string): Promise<void> {
        await field.setValue(query);
    }

    /**
     * Names of the templates the list shows right now.
     *
     * A row is matched against the fixture by its text rather than by a class: the
     * classes are CSS-module hashes, and the question the assertion asks is which of the
     * known templates reached the screen.
     *
     * @returns The visible names in their display order.
     */
    function visibleNames(): string[] {
        return wrapper
            .findAll('li')
            .map((row) => SEARCHABLE_TEMPLATES.find((item) => row.text().includes(item.name)))
            .filter((item): item is TBricksTemplateSummary => Boolean(item))
            .map((item) => item.name);
    }

    return { wrapper, search, visibleNames };
}

/**
 * Mounts the picker over a list of the given size.
 *
 * @param count - The number of templates.
 * @returns Whether the search field is on screen.
 */
function mountPicker(count: number): boolean {
    const wrapper = mount(BuilderTemplatesPickerList, {
        props: {
            templates: buildTemplates(count),
            isLoading: false,
            selectedTemplateId: null,
        },
        global: { components: { BricksIcon: BricksIconStub } },
    });

    const hasSearch = wrapper
        .find('input[placeholder="bricks.publish.dashboard.search.templates"]')
        .exists();

    wrapper.unmount();

    return hasSearch;
}
// #endregion

describe('BuilderTemplatesPickerList: the boundary the search appears at', () => {
    it('keeps the search away while the whole list fits on screen', () => {
        expect(mountPicker(5)).toBe(false);
    });

    it('shows the search from the template that first makes the list scroll', () => {
        expect(mountPicker(6)).toBe(true);
    });
});

describe('BuilderTemplatesPickerList: what the search filters by', () => {
    it('shows the whole list while the query is empty', async () => {
        const { wrapper, visibleNames } = mountSearchablePicker();

        expect(visibleNames()).toHaveLength(SEARCHABLE_TEMPLATES.length);

        wrapper.unmount();
    });

    it('keeps the templates whose name matches', async () => {
        const { wrapper, search, visibleNames } = mountSearchablePicker();

        await search('wide');

        // `Footer wide` matches by name, `Landing hero` by the word in its description
        expect(visibleNames()).toEqual(['Landing hero', 'Footer wide']);

        wrapper.unmount();
    });

    it('finds a template by its description alone', async () => {
        const { wrapper, search, visibleNames } = mountSearchablePicker();

        await search('quotes');

        // The word is in no name at all: dropping the description from the search would
        // leave the list empty here
        expect(visibleNames()).toEqual(['Article body']);

        wrapper.unmount();
    });

    it('ignores the case and the outer spaces of the query', async () => {
        const { wrapper, search, visibleNames } = mountSearchablePicker();

        await search('  PRICING  ');

        expect(visibleNames()).toEqual(['Pricing table']);

        wrapper.unmount();
    });

    it('says nothing was found instead of showing the whole list', async () => {
        const { wrapper, search, visibleNames } = mountSearchablePicker();

        await search('no such template');

        expect(visibleNames()).toEqual([]);
        expect(wrapper.text()).toContain('bricks.common.notFound');

        wrapper.unmount();
    });

    it('leaves a template with no description out of the way of the search', async () => {
        const { wrapper, search, visibleNames } = mountSearchablePicker();

        // `Contact block` carries `description: null`: the row still has to be findable
        // by its name, and the empty field must not become part of the searchable text
        await search('block');

        expect(visibleNames()).toEqual(['Contact block']);

        wrapper.unmount();
    });
});
