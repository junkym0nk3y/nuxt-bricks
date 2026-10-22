// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { effectScope, nextTick, type EffectScope } from 'vue';
// #endregion

/**
 * `isFallbackMode` used to be raised before the editor was created. A refused import
 * of TipTap left the flag up with no editor, and leaving the editing wrote a
 * snapshot holding no change into the history: undo became available having changed
 * nothing (`historyStore.capture` compares nothing with the previous state).
 *
 * The asynchronous creation has a second edge of its own: over the await the editing
 * can end, the target can be switched or a layout component can publish an editor of
 * its own — an editor built for a state that is gone must not reach the store.
 */

// #region Mocks
const { stores, createTiptapEditorMock, editorFactory } = vi.hoisted(() => ({
    stores: {} as Record<string, Record<string, unknown>>,
    createTiptapEditorMock: vi.fn(),
    editorFactory: { destroyed: [] as string[] },
}));

vi.mock('../../src/runtime/modules/text-editor/stores/inlineEditing', async () => {
    const { reactive } = await import('vue');

    stores.inlineEditing = reactive({
        isEditing: false,
        componentId: null as string | null,
        propName: null as string | null,
        propType: null as string | null,
        editor: null as unknown,
        /**
         * Puts the editor into the store, the way the real action does.
         *
         * @param editor - The editor instance.
         */
        setEditor(editor: unknown): void {
            stores.inlineEditing.editor = editor;
        },
    });

    return { useInlineEditingStore: () => stores.inlineEditing };
});

vi.mock('../../src/runtime/modules/builder/core/stores/components', async () => {
    const { reactive } = await import('vue');

    stores.components = reactive({
        getComponentById: vi.fn(() => ({ props: { text: 'The value out of the schema' } })),
        updateComponentProp: vi.fn(),
        saveToHistory: vi.fn(),
    });

    return { useComponentsStore: () => stores.components };
});

vi.mock('../../src/runtime/modules/text-editor/utils/createTiptapEditor', () => ({
    createTiptapEditor: createTiptapEditorMock,
}));
// #endregion

import { useInlineEditingFallback } from '../../src/runtime/modules/builder/canvas/editing/composables/useInlineEditingFallback';

/** How long the overlay waits for an editor from a layout component (see the composable). */
const FALLBACK_INIT_DELAY_MS = 300;

/** A controlled creation of an editor: the test decides when it ends and how. */
interface IEditorCreation {
    resolve: (id: string) => void;
    reject: (error: Error) => void;
}

const creations: IEditorCreation[] = [];

/**
 * Builds a stub of a TipTap editor.
 *
 * @param id - The label of the instance: it shows which one was destroyed.
 * @returns The editor plus its content component, as the real creator returns them.
 */
function buildEditorStub(id: string): Record<string, unknown> {
    return {
        editor: {
            id,
            getHTML: () => `<p>${id}</p>`,
            commands: { focus: vi.fn() },
            destroy: () => {
                editorFactory.destroyed.push(id);
            },
        },
        EditorContent: { name: 'EditorContent' },
    };
}

/**
 * Mounts the composable in a scope of its own.
 *
 * @returns The scope and the API of the composable.
 */
function mountFallback(): {
    scope: EffectScope;
    fallback: ReturnType<typeof useInlineEditingFallback>;
} {
    const scope = effectScope();
    const fallback = scope.run(() => useInlineEditingFallback()) as ReturnType<
        typeof useInlineEditingFallback
    >;

    return { scope, fallback };
}

/**
 * Starts the inline editing of a property and carries it up to the attempt to build
 * the fallback editor.
 *
 * @param propName - The name of the property being edited.
 * @param componentId - The component being edited.
 */
async function startEditing(propName = 'text', componentId = 'component-1'): Promise<void> {
    stores.inlineEditing.componentId = componentId;
    stores.inlineEditing.propName = propName;
    stores.inlineEditing.propType = 'textarea';
    stores.inlineEditing.isEditing = true;
    await nextTick();
    vi.advanceTimersByTime(FALLBACK_INIT_DELAY_MS);
    await nextTick();
}

/** Lets the chain of the creation settle: two awaits of the composable plus its tick. */
async function flushCreation(): Promise<void> {
    await nextTick();
    await nextTick();
}

describe('the fallback editor of inline editing', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        creations.length = 0;
        editorFactory.destroyed.length = 0;
        createTiptapEditorMock.mockReset();
        createTiptapEditorMock.mockImplementation(
            () =>
                new Promise((resolve, reject) => {
                    creations.push({
                        resolve: (id: string) => resolve(buildEditorStub(id)),
                        reject,
                    });
                })
        );
        stores.inlineEditing.isEditing = false;
        stores.inlineEditing.componentId = null;
        stores.inlineEditing.propName = null;
        stores.inlineEditing.propType = null;
        stores.inlineEditing.editor = null;
        (stores.components.saveToHistory as ReturnType<typeof vi.fn>).mockClear();
        (stores.components.updateComponentProp as ReturnType<typeof vi.fn>).mockClear();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('writes no empty edit into the history when the creation is refused', async () => {
        const { scope, fallback } = mountFallback();

        await startEditing();
        creations[0].reject(new Error('ChunkLoadError'));
        await flushCreation();

        expect(fallback.isFallbackMode.value).toBe(false);

        stores.inlineEditing.isEditing = false;
        await nextTick();

        // A snapshot holding no change made undo available having changed nothing
        expect(stores.components.saveToHistory).not.toHaveBeenCalled();
        expect(stores.components.updateComponentProp).not.toHaveBeenCalled();

        scope.stop();
    });

    it('raises the mode only once there is an editor behind it', async () => {
        const { scope, fallback } = mountFallback();

        await startEditing();

        expect(createTiptapEditorMock).toHaveBeenCalledTimes(1);
        expect(fallback.isFallbackMode.value).toBe(false);

        creations[0].resolve('editor-1');
        await flushCreation();

        expect(fallback.isFallbackMode.value).toBe(true);
        expect(stores.inlineEditing.editor).toMatchObject({ id: 'editor-1' });

        stores.inlineEditing.isEditing = false;
        await nextTick();

        expect(stores.components.saveToHistory).toHaveBeenCalledTimes(1);

        scope.stop();
    });

    it('destroys an editor that arrives after the editing has ended', async () => {
        const { scope, fallback } = mountFallback();

        await startEditing();
        stores.inlineEditing.isEditing = false;
        await nextTick();

        creations[0].resolve('editor-late');
        await flushCreation();

        expect(editorFactory.destroyed).toEqual(['editor-late']);
        expect(fallback.isFallbackMode.value).toBe(false);
        expect(stores.inlineEditing.editor).toBeNull();
        expect(stores.components.saveToHistory).not.toHaveBeenCalled();

        scope.stop();
    });

    it('rebuilds the editor when the property is switched mid-creation', async () => {
        const { scope, fallback } = mountFallback();

        await startEditing('text');
        stores.inlineEditing.propName = 'title';
        await nextTick();

        expect(createTiptapEditorMock).toHaveBeenCalledTimes(2);

        // The first instance belongs to the property left behind: published, it
        // would carry its value into the other one
        creations[0].resolve('editor-text');
        await flushCreation();

        expect(editorFactory.destroyed).toEqual(['editor-text']);
        expect(fallback.isFallbackMode.value).toBe(false);

        creations[1].resolve('editor-title');
        await flushCreation();

        expect(fallback.isFallbackMode.value).toBe(true);
        expect(stores.inlineEditing.editor).toMatchObject({ id: 'editor-title' });

        scope.stop();
    });

    it('yields to a layout editor that wins the race', async () => {
        const { scope, fallback } = mountFallback();

        await startEditing();
        // A layout component finished its own initialization while this one was
        // still importing: overwriting it would leave the overlay driving an editor
        // nobody else knows about
        stores.inlineEditing.editor = { id: 'layout-editor' };

        creations[0].resolve('editor-fallback');
        await flushCreation();

        expect(editorFactory.destroyed).toEqual(['editor-fallback']);
        expect(stores.inlineEditing.editor).toMatchObject({ id: 'layout-editor' });
        expect(fallback.isFallbackMode.value).toBe(false);

        scope.stop();
    });

    it('destroys an editor whose component was switched under the same property name', async () => {
        const { scope, fallback } = mountFallback();

        await startEditing('text', 'component-1');
        // The move onto another component keeping the property name leaves both
        // watchers silent, so the generation alone would let this editor through
        stores.inlineEditing.componentId = 'component-2';
        await nextTick();

        creations[0].resolve('editor-component-1');
        await flushCreation();

        expect(editorFactory.destroyed).toEqual(['editor-component-1']);
        expect(fallback.isFallbackMode.value).toBe(false);
        expect(stores.inlineEditing.editor).toBeNull();

        scope.stop();
    });
});
