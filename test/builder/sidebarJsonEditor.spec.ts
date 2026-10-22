/**
 * @vitest-environment happy-dom
 *
 * The JSON property editor: what leaves it and what it does with the text.
 *
 * The rules being guarded are the ones a rewrite loses first. The value leaves the
 * editor parsed rather than as a string, and only when the text parses — a schema
 * that got a half-typed line into a property would stop rendering. The echo of our
 * own emit must not reformat the field: the parent hands the value straight back,
 * and reformatting on that moves the caret out from under the fingers.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key: string) => key,
    }),
}));
// #endregion

// #region Imports
import BuilderShellSidebarPropertyJsonEditor from '../../src/runtime/modules/builder/shell/sidebar/components/property-editors/BuilderShellSidebarPropertyJsonEditor.vue';
// #endregion

// #region Methods
/**
 * Mounts the editor over a value.
 *
 * @param modelValue - The value of the property.
 */
function mountEditor(modelValue: unknown = {}) {
    return mount(BuilderShellSidebarPropertyJsonEditor, {
        props: { modelValue, label: 'Payload' },
    });
}

/**
 * Types the text into the field.
 *
 * @param wrapper - The mounted editor.
 * @param text - The whole new text of the field.
 */
async function typeText(wrapper: ReturnType<typeof mountEditor>, text: string): Promise<void> {
    const field = wrapper.get('textarea');
    (field.element as HTMLTextAreaElement).value = text;
    await field.trigger('input');
}
// #endregion

describe('sidebar json editor', () => {
    it('fills the field with the indented value of the property', () => {
        const wrapper = mountEditor({ title: 'Hi', items: [1, 2] });

        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
            JSON.stringify({ title: 'Hi', items: [1, 2] }, null, 2)
        );
    });

    it('emits the parsed object rather than the text of the field', async () => {
        const wrapper = mountEditor({});

        await typeText(wrapper, '{"a": 1}');

        expect(wrapper.emitted('update:modelValue')).toEqual([[{ a: 1 }]]);
    });

    it('emits a non-primitive array as an array', async () => {
        const wrapper = mountEditor([]);

        await typeText(wrapper, '[{"id": 1}, {"id": 2}]');

        expect(wrapper.emitted('update:modelValue')).toEqual([[[{ id: 1 }, { id: 2 }]]]);
    });

    it('keeps the text and emits nothing while it does not parse', async () => {
        const wrapper = mountEditor({});

        await typeText(wrapper, '{"a": ');

        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('{"a": ');
        expect(wrapper.get('[role="alert"]').text()).toContain('bricks.properties.json.invalid');
        expect(wrapper.get('textarea').attributes('aria-invalid')).toBe('true');
        // The message alone leaves the field itself without a signal; the kit marks an
        // invalid field by its border, and this one reads as part of that family
        expect(wrapper.get('textarea').element.parentElement?.className).toContain('_invalid');
    });

    it('refuses a top-level primitive: the property holds an object or an array', async () => {
        const wrapper = mountEditor({});

        await typeText(wrapper, '42');

        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
        expect(wrapper.get('[role="alert"]').text()).toBe('bricks.properties.json.notObject');
    });

    it('does not reformat the field on the echo of its own emit', async () => {
        const wrapper = mountEditor({});

        await typeText(wrapper, '{"a":1}');
        await wrapper.setProps({ modelValue: { a: 1 } });

        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('{"a":1}');
        expect(wrapper.emitted('update:modelValue')).toHaveLength(1);
    });

    it('takes over a value that came from the outside', async () => {
        const wrapper = mountEditor({ a: 1 });

        await wrapper.setProps({ modelValue: { b: 2 } });

        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
            JSON.stringify({ b: 2 }, null, 2)
        );
        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('does not emit an edit that changed the whitespace only', async () => {
        const wrapper = mountEditor({ a: 1 });

        await typeText(wrapper, '{\n    "a": 1\n}');

        expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    });

    it('indents the text by the format button and leaves an unparsable one alone', async () => {
        const wrapper = mountEditor({});

        await typeText(wrapper, '{"a":[1,2]}');
        await wrapper.get('button').trigger('click');

        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe(
            JSON.stringify({ a: [1, 2] }, null, 2)
        );

        await typeText(wrapper, '{"a":');
        await wrapper.get('button').trigger('click');

        expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toBe('{"a":');
    });

    it('paints the highlight with text nodes: markup in a value stays text', async () => {
        const wrapper = mountEditor({});

        await typeText(wrapper, '{"tag": "<script>alert(1)</script>"}');

        const highlight = wrapper.get('pre');

        expect(highlight.element.querySelectorAll('script')).toHaveLength(0);
        expect(highlight.text()).toContain('<script>alert(1)</script>');
    });

    it('carries the whole text of the field into the highlight layer', async () => {
        const wrapper = mountEditor({});
        const source = '{\n    "a": [1, true, null]\n}';

        await typeText(wrapper, source);

        expect(wrapper.get('pre').element.textContent).toBe(`${source}\n`);
    });

    it('names the field for a screen reader and hides the decorative layer', () => {
        const wrapper = mountEditor({});
        const field = wrapper.get('textarea');
        const label = wrapper.get('label');

        expect(label.text()).toBe('Payload');
        expect(label.attributes('for')).toBe(field.attributes('id'));
        expect(field.attributes('id')).toBeTruthy();
        expect(wrapper.get('pre').attributes('aria-hidden')).toBe('true');
        expect(wrapper.get('button').attributes('type')).toBe('button');
    });
});
