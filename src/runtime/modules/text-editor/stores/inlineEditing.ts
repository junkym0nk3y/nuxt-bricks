// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IMediaItem } from '../../common/types/media';
import type { IInlineEditableProp, TInlineEditingPropType } from '../../common/types/inlineEditing';

// Vue
import { ref, computed, shallowRef } from 'vue';

// Pinia
import { defineStore } from 'pinia';
// #endregion

/**
 * Owns the state of inline editing on the canvas.
 * Keeps the ID of the active component, the name/type of the property and the
 * TipTap editor instance.
 */
export const useInlineEditingStore = defineStore('bricksInlineEditing', () => {
    // #region State
    const componentId = ref<string | null>(null);
    const propName = ref<string | null>(null);
    const propType = ref<TInlineEditingPropType | null>(null);

    /**
     * Offset of the mouse cursor from the top-left of the edited element at the moment
     * of the dblclick. The overlay pins itself to the element by that offset and follows
     * it on scroll.
     */
    const cursorOffset = ref<{ x: number; y: number } | null>(null);

    /**
     * DOM element of the component the dblclick landed on.
     * The overlay uses it to position itself exactly — which matters most in Figma Mode,
     * where one component is rendered in several viewports at once.
     */
    const editingElement = ref<HTMLElement | null>(null);

    /**
     * TipTap Editor instance currently active on the canvas.
     * The overlay toolbar drives formatting through it.
     * shallowRef — a TipTap Editor must not be made deeply reactive.
     */
    const editor = shallowRef<Editor | null>(null);

    /**
     * Callback fired once an item has been picked in MediaGallery. Any media kind:
     * the consumer routes a video into setVideo and an image into setImage.
     * Set through requestMedia(), settled through resolveMediaRequest().
     */
    const mediaRequestCallback = ref<((item: IMediaItem) => void) | null>(null);

    /** Every inline-editable property of the current component */
    const editableProps = ref<IInlineEditableProp[]>([]);

    /** Index of the property being edited inside editableProps */
    const currentPropIndex = ref<number>(0);
    // #endregion

    // #region Getters
    /** Whether inline editing is active */
    const isEditing = computed<boolean>(() => componentId.value !== null);

    /** Whether a pick from MediaGallery is being awaited */
    const isRequestingMedia = computed<boolean>(() => mediaRequestCallback.value !== null);

    /** Label of the property being edited */
    const currentPropLabel = computed<string>(
        () => editableProps.value[currentPropIndex.value]?.label ?? ''
    );

    /** Number of editable properties of the current component */
    const editablePropsCount = computed<number>(() => editableProps.value.length);

    /** Whether switching to the previous property is possible */
    const canSwitchPrev = computed<boolean>(() => currentPropIndex.value > 0);

    /** Whether switching to the next property is possible */
    const canSwitchNext = computed<boolean>(
        () => currentPropIndex.value < editableProps.value.length - 1
    );
    // #endregion

    // #region Actions
    /**
     * Checks whether a particular component is being edited.
     *
     * @param id - Component ID.
     */
    function isEditingComponent(id: string): boolean {
        return componentId.value === id;
    }

    /**
     * Turns inline editing on for a component.
     *
     * @param cId - Component ID.
     * @param pName - Name of the property being edited.
     * @param pType - Type of the property being edited.
     * @param allProps - Every inline-editable property of the component.
     * @param offset - Cursor offset from the top-left of the element at the dblclick.
     * @param element - DOM element of the component (for exact positioning in Figma Mode).
     */
    function startEditing(
        cId: string,
        pName: string,
        pType: TInlineEditingPropType,
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

    /** Turns inline editing off and drops the editor instance */
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
     * Switches to the property at the given index.
     *
     * @param index - Index of the property inside editableProps.
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

    /** Switches to the next property */
    function switchToNextProp(): void {
        if (canSwitchNext.value) {
            switchToProp(currentPropIndex.value + 1);
        }
    }

    /** Switches to the previous property */
    function switchToPrevProp(): void {
        if (canSwitchPrev.value) {
            switchToProp(currentPropIndex.value - 1);
        }
    }

    /**
     * Registers the active TipTap editor instance.
     * Called from useInlineEditor once TipTap has been initialized.
     *
     * @param e - Editor instance, or null when it is destroyed.
     */
    function setEditor(e: Editor | null): void {
        editor.value = e;
    }

    /**
     * Requests a pick from MediaGallery.
     * The builder page watches isRequestingMedia and opens the gallery.
     *
     * @param callback - Called with the picked IMediaItem.
     */
    function requestMedia(callback: (item: IMediaItem) => void): void {
        mediaRequestCallback.value = callback;
    }

    /**
     * Settles the media request — hands the picked item to the callback.
     *
     * @param item - The picked media item.
     */
    function resolveMediaRequest(item: IMediaItem): void {
        const cb = mediaRequestCallback.value;
        mediaRequestCallback.value = null;
        if (cb) {
            cb(item);
        }
    }

    /** Cancels the media request (the gallery was closed without a pick) */
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
