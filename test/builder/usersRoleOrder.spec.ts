/**
 * @vitest-environment happy-dom
 *
 * The order of the roles in the accounts section.
 *
 * What is guarded here: BOTH surfaces that list the roles — the menu of a row and
 * the select of the creation form — read one derived constant rather than a literal
 * of their own. A literal is a second declaration of the set: a new role becomes
 * valid on the server (it checks against the very same rank) and silently
 * disappears from one of the two surfaces, or from both.
 *
 * The completeness and the descending order are checked together: completeness with
 * no order would admit a scale running from the narrow rights to the wide ones,
 * while order with no completeness would admit a lost role. The surfaces are
 * compared against the constant rather than against a fixed list of three, so that
 * a role added to the rank has to reach them.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { TBricksUserRole } from '../../src/runtime/modules/common/types/auth';

// Vue
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

// The creation form reaches the endpoint through the api client; the role options
// are built by the component itself and do not depend on the form at all
vi.mock('../../src/runtime/modules/builder/users/composables/useUsersCreateForm', async () => {
    const { ref } = await import('vue');

    return {
        useUsersCreateForm: () => ({
            username: ref(''),
            displayName: ref(''),
            password: ref(''),
            role: ref('editor'),
            isActive: ref(true),
            errors: ref({}),
            generalError: ref(''),
            isSubmitting: ref(false),
            generatePassword: vi.fn(),
            submitForm: vi.fn(),
            resetToEmpty: vi.fn(),
        }),
    };
});
// #endregion

import { BRICKS_ROLE_RANK } from '../../src/runtime/modules/common/constants/auth';
import { USER_ROLE_ORDER } from '../../src/runtime/modules/builder/users/constants/roles';
import BricksSelect from '../../src/runtime/modules/ui/inputs/BricksSelect.vue';
import BuilderUsersRolePill from '../../src/runtime/modules/builder/users/components/BuilderUsersRolePill.vue';
import TheBuilderUsersCreateModal from '../../src/runtime/modules/builder/users/components/TheBuilderUsersCreateModal.vue';

/** The global builder icon is registered by the app plugin — a stub stands in here */
const BricksIconStub = defineComponent({
    name: 'BricksIcon',
    props: { icon: { type: String, default: '' } },
    setup: (props) => () => h('i', { 'data-icon': props.icon }),
});

/** The role captions as the surfaces build them out of the translation keys */
const EXPECTED_ROLE_LABELS = USER_ROLE_ORDER.map((role) => `bricks.auth.roles.${role}`);

describe('USER_ROLE_ORDER: the order of the roles of the accounts section', () => {
    it('lists exactly the roles the server accepts', () => {
        expect([...USER_ROLE_ORDER].sort()).toEqual(Object.keys(BRICKS_ROLE_RANK).sort());
    });

    it('does not repeat a role', () => {
        expect(new Set(USER_ROLE_ORDER).size).toBe(USER_ROLE_ORDER.length);
    });

    it('runs from the wide rights to the narrow ones, and the ranks strictly descend', () => {
        const ranks = USER_ROLE_ORDER.map((role: TBricksUserRole) => BRICKS_ROLE_RANK[role]);

        expect(ranks).toEqual([...ranks].sort((left, right) => right - left));
        expect(new Set(ranks).size).toBe(ranks.length);
    });
});

describe('the surfaces listing the roles read the shared constant', () => {
    it('the menu of a row offers exactly its roles, in its order', async () => {
        const wrapper = mount(BuilderUsersRolePill, {
            props: { role: 'editor', userLabel: 'anna.editor' },
            global: { components: { BricksIcon: BricksIconStub } },
        });

        await wrapper.get('button').trigger('click');

        const items = document.querySelectorAll('[role="menuitemradio"]');
        // The caption only: the item carries the description of the role next to it
        const labels = [...items].map(
            (item) => item.querySelector('span > span')?.textContent?.trim() ?? ''
        );

        expect(labels).toEqual(EXPECTED_ROLE_LABELS);

        wrapper.unmount();
    });

    it('the select of the creation form offers exactly its roles, in its order', async () => {
        const wrapper = mount(TheBuilderUsersCreateModal, {
            props: { isOpen: true },
            global: { components: { BricksIcon: BricksIconStub } },
        });

        await flushPromises();

        const select = wrapper.findComponent(BricksSelect);
        const specs = select.props('specs') as { value: string }[];

        expect(specs.map((spec) => spec.value)).toEqual([...USER_ROLE_ORDER]);

        wrapper.unmount();
    });
});
