/**
 * @vitest-environment happy-dom
 *
 * Inline-редактор layout-компонента: что попадает в стор после конца правки.
 *
 * `initEditor` тянет TipTap динамическими импортами, а оба сторожа, которые сносят
 * редактор при уходе с компонента или смене свойства, требуют `editor.value` — пока
 * идёт импорт, он ещё `null`. Значит, `stopEditing()` внутри окна импорта не
 * уничтожал ничего, а доехавший следом редактор вставал в стор уже без активной
 * правки. Дальше — молчаливый отказ: следующее inline-редактирование видело непустой
 * `inlineEditingStore.editor` и своего редактора не создавало, то есть overlay
 * открывался, а править было нечем.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { computed, defineComponent, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';
// #endregion

// #region Mocks
const { stores, createTiptapEditorMock, editorFactory } = vi.hoisted(() => ({
    stores: {} as Record<string, Record<string, unknown>>,
    createTiptapEditorMock: vi.fn(),
    editorFactory: { destroyed: [] as string[] },
}));

vi.mock('../../src/runtime/modules/text-editor/stores/inlineEditing', async () => {
    const { reactive } = await import('vue');

    stores.inlineEditing = reactive({
        componentId: null as string | null,
        propName: null as string | null,
        propType: null as string | null,
        editor: null as unknown,
        /**
         * Кладёт редактор в стор так же, как настоящее действие.
         *
         * @param editor - Экземпляр редактора.
         */
        setEditor(editor: unknown): void {
            stores.inlineEditing.editor = editor;
        },
        /** Гасит правку так же, как настоящее действие */
        stopEditing(): void {
            stores.inlineEditing.componentId = null;
            stores.inlineEditing.propName = null;
            stores.inlineEditing.propType = null;
            stores.inlineEditing.editor = null;
        },
    });

    return { useInlineEditingStore: () => stores.inlineEditing };
});

vi.mock('../../src/runtime/modules/text-editor/utils/createTiptapEditor', () => ({
    createTiptapEditor: createTiptapEditorMock,
}));
// #endregion

import { INLINE_EDITOR_HOST_KEY } from '../../src/runtime/modules/common/constants/injectionKeys';
import { useInlineEditor } from '../../src/runtime/modules/text-editor/composables/useInlineEditor';
import BlockText from '../../src/runtime/modules/layouts-blocks/components/BlockText.vue';

/** Управляемое создание редактора: тест сам решает, когда оно закончится. */
interface IEditorCreation {
    resolve: (id: string) => void;
    reject: (error: Error) => void;
}

const creations: IEditorCreation[] = [];

/** Записи, которые редактор оставил в состоянии билдера. */
const propWrites: { componentId: string; propName: string; value: unknown }[] = [];

/**
 * Заглушка хоста: через него композабл читает и пишет свойство компонента.
 */
const host = {
    /**
     * @param _componentId - Идентификатор компонента.
     * @param _propName - Имя свойства.
     * @returns Значение свойства из состояния билдера.
     */
    getPropValue: (_componentId: string, _propName: string) => '<p>Из схемы</p>',
    /**
     * @param componentId - Идентификатор компонента.
     * @param propName - Имя свойства.
     * @param value - Записываемое значение.
     */
    updateProp: (componentId: string, propName: string, value: unknown) => {
        propWrites.push({ componentId, propName, value });
    },
    /** Точка истории правки */
    commitHistory: vi.fn(),
};

/**
 * Собирает заглушку редактора TipTap.
 *
 * @param id - Метка экземпляра: по ней видно, какой из них уничтожен.
 * @returns Редактор и его компонент содержимого, как их отдаёт настоящий сборщик.
 */
function buildEditorStub(id: string): Record<string, unknown> {
    return {
        editor: {
            id,
            getHTML: () => `<p>${id}</p>`,
            commands: { focus: vi.fn(), setContent: vi.fn() },
            destroy: () => {
                editorFactory.destroyed.push(id);
            },
        },
        EditorContent: { name: 'EditorContent' },
    };
}

/**
 * Монтирует компонент-носитель композабла: `inject` хоста работает только внутри
 * setup, а `onBeforeUnmount` должен цепляться к настоящему экземпляру.
 *
 * @param componentId - Идентификатор компонента схемы.
 * @param propName - Имя редактируемого свойства.
 * @returns Обёртка теста с API композабла на `vm`.
 */
function mountEditorHost(componentId = 'component-1', propName = 'content') {
    const Host = defineComponent({
        name: 'InlineEditorHost',
        setup: () => ({
            inlineEditor: useInlineEditor({ componentId, propName, propType: 'textarea' }),
        }),
        render: () => null,
    });

    return mount(Host, {
        global: { provide: { [INLINE_EDITOR_HOST_KEY as unknown as string]: host } },
    });
}

/**
 * Возвращает API композабла смонтированного носителя.
 *
 * @param wrapper - Обёртка носителя.
 */
function editorApi(wrapper: ReturnType<typeof mountEditorHost>) {
    return (wrapper.vm as unknown as { inlineEditor: ReturnType<typeof useInlineEditor> })
        .inlineEditor;
}

/**
 * Начинает правку компонента и свойства.
 *
 * @param componentId - Идентификатор компонента.
 * @param propName - Имя свойства.
 */
function startEditing(componentId = 'component-1', propName = 'content'): void {
    stores.inlineEditing.componentId = componentId;
    stores.inlineEditing.propName = propName;
    stores.inlineEditing.propType = 'textarea';
}

/** Гасит правку в сторе-заглушке (у заглушки поля типизированы как unknown) */
function stopEditing(): void {
    (stores.inlineEditing.stopEditing as () => void)();
}

/** Даёт цепочке создания дописать результат */
async function flushCreation(): Promise<void> {
    await nextTick();
    await nextTick();
}

describe('useInlineEditor: публикация редактора в стор', () => {
    beforeEach(() => {
        creations.length = 0;
        editorFactory.destroyed.length = 0;
        propWrites.length = 0;
        host.commitHistory.mockClear();
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
        stopEditing();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('редактор, доехавший после конца правки, уничтожается и в стор не встаёт', async () => {
        const wrapper = mountEditorHost();
        const api = editorApi(wrapper);

        startEditing();
        api.initEditor();
        await nextTick();

        stopEditing();
        creations[0].resolve('editor-late');
        await flushCreation();

        expect(editorFactory.destroyed).toEqual(['editor-late']);
        expect(api.editor.value).toBeNull();
        expect(api.editorContent.value).toBeNull();
        expect(stores.inlineEditing.editor).toBeNull();
        expect(propWrites).toEqual([]);

        wrapper.unmount();
    });

    it('чужой редактор в сторе не перезаписывается', async () => {
        const wrapper = mountEditorHost();
        const api = editorApi(wrapper);

        startEditing();
        api.initEditor();
        await nextTick();

        // Fallback overlay успел собрать свой редактор, пока шёл импорт
        stores.inlineEditing.editor = { id: 'fallback-editor' };

        creations[0].resolve('editor-layout');
        await flushCreation();

        expect(editorFactory.destroyed).toEqual(['editor-layout']);
        expect(stores.inlineEditing.editor).toMatchObject({ id: 'fallback-editor' });
        expect(api.editor.value).toBeNull();

        wrapper.unmount();
    });

    it('переезд правки на другой компонент с тем же свойством тоже отбраковка', async () => {
        const wrapper = mountEditorHost('component-1', 'content');
        const api = editorApi(wrapper);

        startEditing('component-1', 'content');
        api.initEditor();
        await nextTick();

        startEditing('component-2', 'content');
        creations[0].resolve('editor-component-1');
        await flushCreation();

        expect(editorFactory.destroyed).toEqual(['editor-component-1']);
        expect(api.editor.value).toBeNull();
        expect(stores.inlineEditing.editor).toBeNull();

        wrapper.unmount();
    });

    it('правка, начатая заново по той же цели, получает свой редактор', async () => {
        const wrapper = mountEditorHost();
        const api = editorApi(wrapper);

        startEditing();
        api.initEditor();
        await nextTick();

        // Стоп и старт в одном тике: цель та же, поэтому только поколение и различает
        // редактор прошлой сессии от нового
        stopEditing();
        startEditing();
        api.initEditor();
        await nextTick();

        expect(createTiptapEditorMock).toHaveBeenCalledTimes(2);

        creations[0].resolve('editor-first');
        await flushCreation();

        expect(editorFactory.destroyed).toEqual(['editor-first']);
        expect(stores.inlineEditing.editor).toBeNull();

        creations[1].resolve('editor-second');
        await flushCreation();

        expect(stores.inlineEditing.editor).toMatchObject({ id: 'editor-second' });
        expect(api.editor.value).toMatchObject({ id: 'editor-second' });

        wrapper.unmount();
    });

    it('перезапуск правки при живом редакторе возвращает его в стор', async () => {
        const wrapper = mountEditorHost();
        const api = editorApi(wrapper);

        startEditing();
        api.initEditor();
        await nextTick();
        creations[0].resolve('editor-first');
        await flushCreation();

        expect(stores.inlineEditing.editor).toMatchObject({ id: 'editor-first' });

        // Escape и новый двойной клик в одном кадре: `stopEditing` уносит редактор из
        // стора, а экземпляр компонента остаётся жив. Без возврата текст оставался
        // редактируемым, а тулбар overlay не вёл ничего — ни форматирования, ни медиа
        stopEditing();
        startEditing();
        api.initEditor();
        await flushCreation();

        expect(stores.inlineEditing.editor).toMatchObject({ id: 'editor-first' });
        expect(api.editor.value).toMatchObject({ id: 'editor-first' });
        expect(createTiptapEditorMock).toHaveBeenCalledTimes(1);
        expect(editorFactory.destroyed).toEqual([]);

        wrapper.unmount();
    });

    it('уход неактивного компонента с канваса не гасит чужой редактор', async () => {
        const active = mountEditorHost('component-1', 'content');
        const idle = mountEditorHost('component-2', 'content');

        startEditing('component-1', 'content');
        editorApi(active).initEditor();
        await nextTick();
        creations[0].resolve('editor-active');
        await flushCreation();

        expect(stores.inlineEditing.editor).toMatchObject({ id: 'editor-active' });

        // Второй экземпляр своего редактора не создавал: стирать чужой ему нечем
        idle.unmount();

        expect(stores.inlineEditing.editor).toMatchObject({ id: 'editor-active' });
        expect(editorFactory.destroyed).toEqual([]);

        active.unmount();
    });
});

describe('BlockText: перезапуск правки по той же цели', () => {
    beforeEach(() => {
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
        stopEditing();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('стоп и старт в одном тике поднимают вторую инициализацию', async () => {
        const isEditing = ref(false);
        const wrapper = mount(BlockText, {
            props: { componentId: 'component-1', content: '<p>Из схемы</p>' },
            global: {
                provide: {
                    [INLINE_EDITOR_HOST_KEY as unknown as string]: host,
                    inlineEditingContext: {
                        componentId: computed(() => (isEditing.value ? 'component-1' : null)),
                        propName: computed(() => (isEditing.value ? 'content' : null)),
                        propType: computed(() => (isEditing.value ? 'textarea' : null)),
                        isEditing: computed(() => isEditing.value),
                    },
                },
            },
        });

        startEditing();
        isEditing.value = true;
        await nextTick();

        expect(createTiptapEditorMock).toHaveBeenCalledTimes(1);

        // Escape и новый двойной клик, уложившиеся в один тик: при обычном flush
        // watcher увидел бы одно неизменившееся значение и второй раз не сработал
        stopEditing();
        startEditing();
        await nextTick();

        expect(createTiptapEditorMock).toHaveBeenCalledTimes(2);

        wrapper.unmount();
    });
});
