/**
 * @vitest-environment happy-dom
 *
 * Editing the caption of a template: what travels to the server and where the form
 * takes its starting values from.
 *
 * The two caption forms share a body, so what is guarded here is the part that must NOT
 * be shared. First, the request: a rename is a PATCH of a record that already exists,
 * addressed by its identifier — a POST would create a second template out of one. The
 * schema and the frame are not part of it: the contents of a template never change.
 * Second, the text of an aborted wait: the outcome is uncertain for a rename too, but a
 * word about saving would name an event that did not happen. Third, the starting values
 * are read at the moment of the reset — one and the same window serves one template
 * after another, and the values of the first would greet the second.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, defineComponent, h, nextTick, ref } from 'vue';

// Test utils
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));
// #endregion

import { resetNuxtStateStub } from '../stubs/nuxt-imports';
import type { TBricksTemplateSummary } from '../../src/runtime/modules/common/types/templates';
import { useTemplateRenameForm } from '../../src/runtime/modules/builder/templates/composables/useTemplateRenameForm';
import { useTemplatesData } from '../../src/runtime/modules/builder/templates/composables/useTemplatesData';

// #region Fixtures
/** The schema of the template: one block — the number of blocks of the summary */
const SCHEMA = {
    components: [
        {
            id: 'text-1',
            type: 'component' as const,
            componentName: 'Text',
            brickPath: 'content/text',
            zIndex: 1,
            props: {},
        },
    ],
};

/**
 * The summary of a template the section holds in its list.
 *
 * @param overrides - The fields that differ from the default ones.
 * @returns The summary of the template.
 */
function buildTemplate(overrides: Partial<TBricksTemplateSummary> = {}): TBricksTemplateSummary {
    return {
        id: 12,
        name: 'Landing page',
        description: 'A hero and a slider',
        thumbnailUrl: 'https://bucket.example/bricks-thumbnails/template-uuid.webp',
        blocksCount: 1,
        createdAt: '2026-08-19T10:00:00.000Z',
        updatedAt: '2026-08-19T10:00:00.000Z',
        ...overrides,
    };
}

/**
 * The answer of the endpoint of the edit: the whole row of the template.
 *
 * @param name - The name after the edit.
 * @returns The whole row of the template.
 */
function buildUpdatedTemplate(name: string) {
    return {
        id: 12,
        name,
        description: 'A hero and a slider',
        thumbnailUrl: 'https://bucket.example/bricks-thumbnails/template-uuid.webp',
        schema: SCHEMA,
        pageMeta: { layout: 'default', backgroundColor: '#fff', viewportConfig: null },
        createdAt: '2026-08-19T10:00:00.000Z',
        updatedAt: '2026-08-20T12:00:00.000Z',
    };
}

/**
 * Mounts the form inside a component: vee-validate lives in a setup context, and a form
 * called from outside one validates no fields at all.
 *
 * @param initialTemplate - The template being edited; `null` — the modal is closed.
 * @returns The form, the reactive template and the callback of a success.
 */
function mountForm(initialTemplate: TBricksTemplateSummary | null = buildTemplate()) {
    const onSaved = vi.fn();
    const template = ref<TBricksTemplateSummary | null>(initialTemplate);
    let form: ReturnType<typeof useTemplateRenameForm> | undefined;

    const wrapper = mount(
        defineComponent({
            setup() {
                form = useTemplateRenameForm({
                    template: computed(() => template.value),
                    onSaved,
                });
                form.resetForm();

                return () => h('div');
            },
        })
    );

    if (!form) {
        throw new Error('The form has not been created');
    }

    return { form, wrapper, onSaved, template };
}
// #endregion

describe('useTemplateRenameForm: editing the caption of a template', () => {
    beforeEach(() => {
        apiFetcherMock.mockReset();
        resetNuxtStateStub();
    });

    it('sends a PATCH of the caption alone, addressed by the identifier', async () => {
        apiFetcherMock.mockResolvedValue(buildUpdatedTemplate('Landing page v2'));

        const { form, onSaved } = mountForm();

        expect(form.name.value).toBe('Landing page');
        expect(form.description.value).toBe('A hero and a slider');

        form.name.value = 'Landing page v2';
        await nextTick();

        await form.submitForm();

        expect(apiFetcherMock).toHaveBeenCalledWith('/api/bricks/templates/12', {
            method: 'PATCH',
            body: { name: 'Landing page v2', description: 'A hero and a slider' },
            timeout: expect.any(Number),
        });
        expect(onSaved).toHaveBeenCalledTimes(1);
    });

    it('puts the edited template into the list as a summary', async () => {
        apiFetcherMock.mockResolvedValue(buildUpdatedTemplate('Landing page v2'));

        const { form } = mountForm();
        const { templates } = useTemplatesData();

        await form.submitForm();

        expect(templates.value).toHaveLength(1);
        expect(templates.value[0]).toEqual(
            expect.objectContaining({ id: 12, name: 'Landing page v2', blocksCount: 1 })
        );
        expect(templates.value[0]).not.toHaveProperty('schema');
    });

    it('a reset reads the template as it is now, not as it was when the form was built', async () => {
        const { form, template } = mountForm();

        template.value = buildTemplate({ id: 34, name: 'Contacts', description: 'A map' });
        await nextTick();

        form.resetForm();

        expect(form.name.value).toBe('Contacts');
        expect(form.description.value).toBe('A map');
    });

    it('an aborted wait tells the outcome is uncertain in the words of a rename', async () => {
        const timeoutError = new Error('Aborted by the waiting ceiling');
        timeoutError.name = 'TimeoutError';

        apiFetcherMock.mockRejectedValueOnce(timeoutError).mockResolvedValueOnce({ templates: [] });

        const { form, onSaved } = mountForm();

        await form.submitForm();

        expect(form.generalError.value).toBe('bricks.templates.errors.renameOutcomeUnknown');
        expect(apiFetcherMock).toHaveBeenCalledTimes(2);
        expect(apiFetcherMock.mock.calls[1]?.[0]).toBe('/api/bricks/templates');
        expect(onSaved).not.toHaveBeenCalled();
        expect(form.isSubmitting.value).toBe(false);
    });

    it('with no template behind it the form sends nothing', async () => {
        const { form, onSaved } = mountForm(null);

        form.name.value = 'Landing page v2';
        await nextTick();

        await form.submitForm();

        expect(apiFetcherMock).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
    });
});
