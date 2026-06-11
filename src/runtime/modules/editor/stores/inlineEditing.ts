// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IMediaItem } from '../../media/types/media';
import type { IInlineEditableProp } from '../../builder/utils/inlineEditableProp';

// Vue
import { ref, computed, shallowRef } from 'vue';

// Pinia
import { defineStore } from 'pinia';
// #endregion

/**
 * Тип редактируемого свойства для inline editing.
 */
export type InlineEditingPropType = 'inline-content' | 'textarea';

/**
 * Управляет состоянием inline-editing на канвасе.
 * Хранит ID активного компонента, имя/тип свойства и экземпляр TipTap-редактора.
 */
export const useInlineEditingStore = defineStore('landingInlineEditing', () => {
    // #region State
    const componentId = ref<string | null>(null);
    const propName = ref<string | null>(null);
    const propType = ref<InlineEditingPropType | null>(null);

    /**
     * Смещение курсора мыши относительно top-left редактируемого элемента в момент dblclick.
     * Overlay привязывается к элементу по этому смещению и следует за ним при скролле.
     */
    const cursorOffset = ref<{ x: number; y: number } | null>(null);

    /**
     * DOM-элемент компонента, на котором произошёл dblclick.
     * Используется overlay для точного позиционирования — особенно важно в Figma Mode,
     * где один компонент рендерится в нескольких viewport-ах одновременно.
     */
    const editingElement = ref<HTMLElement | null>(null);

    /**
     * Экземпляр TipTap Editor, активный в данный момент на канвасе.
     * Используется overlay-тулбаром для управления форматированием.
     * shallowRef — TipTap Editor нельзя делать глубоко реактивным.
     */
    const editor = shallowRef<Editor | null>(null);

    /**
     * Callback, вызываемый при выборе изображения из MediaGallery.
     * Устанавливается через requestMedia(), разрешается через resolveMediaRequest().
     */
    const mediaRequestCallback = ref<((item: IMediaItem) => void) | null>(null);

    /**
     * Все inline-editable свойства текущего компонента.
     */
    const editableProps = ref<IInlineEditableProp[]>([]);

    /**
     * Индекс текущего редактируемого свойства в editableProps.
     */
    const currentPropIndex = ref<number>(0);
    // #endregion

    // #region Getters
    /**
     * Активен ли режим inline editing.
     */
    const isEditing = computed<boolean>(() => componentId.value !== null);

    /**
     * Ожидается ли выбор изображения из MediaGallery.
     */
    const isRequestingMedia = computed<boolean>(() => mediaRequestCallback.value !== null);

    /**
     * Label текущего редактируемого свойства.
     */
    const currentPropLabel = computed<string>(
        () => editableProps.value[currentPropIndex.value]?.label ?? ''
    );

    /**
     * Количество editable свойств у текущего компонента.
     */
    const editablePropsCount = computed<number>(() => editableProps.value.length);

    /**
     * Можно ли переключиться на предыдущее свойство.
     */
    const canSwitchPrev = computed<boolean>(() => currentPropIndex.value > 0);

    /**
     * Можно ли переключиться на следующее свойство.
     */
    const canSwitchNext = computed<boolean>(
        () => currentPropIndex.value < editableProps.value.length - 1
    );
    // #endregion

    // #region Actions
    /**
     * Проверяет, редактируется ли конкретный компонент.
     *
     * @param id - ID компонента.
     */
    function isEditingComponent(id: string): boolean {
        return componentId.value === id;
    }

    /**
     * Активирует inline-editing для компонента.
     *
     * @param cId - ID компонента.
     * @param pName - Имя редактируемого свойства.
     * @param pType - Тип редактируемого свойства.
     * @param allProps - Все inline-editable свойства компонента.
     * @param offset - Смещение курсора относительно top-left элемента в момент dblclick.
     * @param element - DOM-элемент компонента (для точного позиционирования в Figma Mode).
     */
    function startEditing(
        cId: string,
        pName: string,
        pType: InlineEditingPropType,
        allProps: IInlineEditableProp[],
        offset?: { x: number; y: number },
        element?: HTMLElement | null
    ): void {
        componentId.value = cId;
        propName.value = pName;
        propType.value = pType;
        editableProps.value = allProps;
        currentPropIndex.value = Math.max(
            0,
            allProps.findIndex((p) => p.propName === pName)
        );
        cursorOffset.value = offset ?? null;
        editingElement.value = element ?? null;
    }

    /**
     * Деактивирует inline-editing и сбрасывает editor-инстанс.
     */
    function stopEditing(): void {
        componentId.value = null;
        propName.value = null;
        propType.value = null;
        cursorOffset.value = null;
        editingElement.value = null;
        editor.value = null;
        editableProps.value = [];
        currentPropIndex.value = 0;
    }

    /**
     * Переключает на свойство по индексу.
     *
     * @param index - Индекс свойства в editableProps.
     */
    function switchToProp(index: number): void {
        if (index < 0 || index >= editableProps.value.length) {
            return;
        }

        if (editor.value) {
            editor.value = null;
        }

        currentPropIndex.value = index;
        const prop = editableProps.value[index];
        propName.value = prop.propName;
        propType.value = prop.propType;
    }

    /**
     * Переключает на следующее свойство.
     */
    function switchToNextProp(): void {
        if (canSwitchNext.value) {
            switchToProp(currentPropIndex.value + 1);
        }
    }

    /**
     * Переключает на предыдущее свойство.
     */
    function switchToPrevProp(): void {
        if (canSwitchPrev.value) {
            switchToProp(currentPropIndex.value - 1);
        }
    }

    /**
     * Регистрирует активный TipTap editor-инстанс.
     * Вызывается из useInlineEditor после инициализации TipTap.
     *
     * @param e - Инстанс Editor или null при уничтожении.
     */
    function setEditor(e: Editor | null): void {
        editor.value = e;
    }

    /**
     * Запрашивает выбор изображения из MediaGallery.
     * Builder page отслеживает isRequestingMedia и открывает галерею.
     *
     * @param callback - Вызывается с выбранным IMediaItem.
     */
    function requestMedia(callback: (item: IMediaItem) => void): void {
        mediaRequestCallback.value = callback;
    }

    /**
     * Разрешает запрос медиа — передаёт выбранный элемент в callback.
     *
     * @param item - Выбранный медиа-элемент.
     */
    function resolveMediaRequest(item: IMediaItem): void {
        const cb = mediaRequestCallback.value;
        mediaRequestCallback.value = null;
        if (cb) {
            cb(item);
        }
    }

    /**
     * Отменяет запрос медиа (галерея закрыта без выбора).
     */
    function cancelMediaRequest(): void {
        mediaRequestCallback.value = null;
    }
    // #endregion

    return {
        componentId,
        propName,
        propType,
        cursorOffset,
        editingElement,
        editor,
        editableProps,
        currentPropIndex,
        isEditing,
        isRequestingMedia,
        currentPropLabel,
        editablePropsCount,
        canSwitchPrev,
        canSwitchNext,
        isEditingComponent,
        startEditing,
        stopEditing,
        switchToProp,
        switchToNextProp,
        switchToPrevProp,
        setEditor,
        requestMedia,
        resolveMediaRequest,
        cancelMediaRequest,
    };
});
