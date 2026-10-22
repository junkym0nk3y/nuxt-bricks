// #region Imports
// Types
import type { ICanvasItemProps, ICanvasContextMenuPosition } from '../../types/components';
import type { TBricksDeviceKey } from '../../../../common/types/brick';
import type { TComponentSiblingContext } from '../../../core/types/componentMove';

// Vue
import { computed, nextTick, ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useComponentsStore } from '../../../core/stores/components';
import { useCanvasStore } from '../../../core/stores/canvas';
import { useSidebarStore } from '../../../core/stores/sidebar';

// Composables
import { useComponentEditorMetadata } from '../../../core/composables/useComponentEditorMetadata';
import { useBuilderToast } from '../../../core/composables/useBuilderToast';
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Utils
import { scrollToComponentOnCanvas } from '../../../core/utils/scrollToComponent';
import { resolveComponentSiblingContext } from '../../../core/utils/componentSiblings';
// #endregion

/**
 * Context menu handlers and selection logic of a canvas item: the actions (delete,
 * clipboard, hiding, moving, favorites), the click handler that loads the properties, and
 * the state of the context menu.
 */
export function useCanvasItemActions(
    props: ICanvasItemProps,
    figmaViewport: Ref<TBricksDeviceKey> | null
) {
    const componentsStore = useComponentsStore();
    const canvasStore = useCanvasStore();
    const sidebarStore = useSidebarStore();
    const { resolveComponentEditorMetadata } = useComponentEditorMetadata();
    const { showToast } = useBuilderToast();
    const { canEdit } = useBuilderPermissions();
    const { t } = useI18n();

    // #region Data
    /** Position of the open context menu (null means the menu is closed) */
    const contextMenuPosition = ref<ICanvasContextMenuPosition | null>(null);
    // #endregion

    // #region Computed
    /**
     * Whether the component is in interactive preview mode.
     */
    const isInteractivePreview = computed<boolean>(
        () => componentsStore.interactivePreviewId === props.component.id
    );

    /**
     * Whether the component is a favorite, matched by name.
     */
    const isFavorite = computed<boolean>(() =>
        componentsStore.favorites.includes(props.component.componentName)
    );

    /**
     * Position of the component among its siblings, whichever list it lies in: the root
     * level, the children of a layout or the children of a slot.
     */
    const siblingContext = computed<TComponentSiblingContext | null>(() =>
        resolveComponentSiblingContext(componentsStore.components, props.component.id)
    );

    /**
     * Whether the component can move up (it is not the first among its siblings).
     */
    const canMoveUp = computed<boolean>(() => (siblingContext.value?.index ?? 0) > 0);

    /**
     * Whether the component can move down (it is not the last among its siblings).
     */
    const canMoveDown = computed<boolean>(() => {
        const context = siblingContext.value;

        return context !== null && context.index < context.count - 1;
    });

    /**
     * Whether pasting from the component clipboard is available.
     */
    const canPaste = computed<boolean>(() => componentsStore.clipboard !== null);
    // #endregion

    // #region Methods
    /**
     * Selects the component: takes its properties from the manifest metadata or from the
     * layout definitions, and syncs the active viewport in Figma mode.
     */
    function selectSelf(): void {
        const { properties, description } = resolveComponentEditorMetadata(props.component);

        componentsStore.selectComponent(props.component.id, properties, description);

        if (canvasStore.isFigmaMode && figmaViewport) {
            canvasStore.activeViewport = figmaViewport.value;
        }
    }

    /**
     * Selects the component and scrolls the canvas to it (opening it for editing).
     */
    async function openEditor(): Promise<void> {
        // Whether the properties panel has to animate open (that changes the canvas size)
        const sidebarAlreadyOpen = sidebarStore.right.visible;

        selectSelf();

        // Scroll to the component once the sidebar is open.
        // If the sidebar was open already, nextTick is enough; if it had to open, wait
        // out the animation (a 300ms transition plus a buffer).
        // In Figma mode the search is scoped to the active viewport
        const componentId = props.component.id;
        const scrollViewport =
            canvasStore.isFigmaMode && figmaViewport ? figmaViewport.value : undefined;

        if (sidebarAlreadyOpen) {
            await nextTick();
            scrollToComponentOnCanvas(componentId, scrollViewport);
        } else {
            setTimeout(async () => {
                await nextTick();
                scrollToComponentOnCanvas(componentId, scrollViewport);
            }, 350);
        }
    }

    /**
     * Handles a click on the component: selects it and scrolls the canvas to it.
     * A component in interactive preview mode lets the click through to its children.
     */
    async function handleClick(event: MouseEvent): Promise<void> {
        event.stopPropagation();

        if (isInteractivePreview.value) {
            return;
        }

        await openEditor();
    }

    /**
     * Opens the context menu at the cursor. The component is NOT selected — only the
     * "Edit" item opens the properties panel.
     *
     * For a role without edit rights the menu does not open at all: most of its items
     * change the schema, and taking those away one by one would leave the four read-only
     * ones (open the panel, copy, favorite, interactive preview) and keep the list of
     * exceptions in two places. Right-click then falls through to the browser context
     * menu.
     */
    function handleContextMenu(event: MouseEvent): void {
        if (isInteractivePreview.value || !canEdit.value) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        contextMenuPosition.value = { x: event.clientX, y: event.clientY };
    }

    /** The "Edit" item: selects the component and opens the properties panel */
    async function handleEdit(): Promise<void> {
        await openEditor();
    }

    /** Closes the context menu */
    function closeContextMenu(): void {
        contextMenuPosition.value = null;
    }

    /** Deletes the component from the canvas */
    function handleDelete(): void {
        componentsStore.removeComponent(props.component.id);
        showToast(t('bricks.canvas.toastDeleted'));
    }

    /** Copies the component into the component clipboard */
    function handleCopy(): void {
        componentsStore.copyComponentToClipboard(props.component.id);
        showToast(t('bricks.canvas.toastCopied'));
    }

    /** Pastes the component tree from the clipboard */
    function handlePaste(): void {
        componentsStore.pasteFromClipboard();
        showToast(t('bricks.canvas.toastPasted'));
    }

    /** Duplicates the component */
    function handleDuplicate(): void {
        componentsStore.duplicateComponent(props.component.id);
        showToast(t('bricks.canvas.toastPasted'));
    }

    /** Toggles hiding of the component (the toast shows only when it is switched off) */
    function handleToggleHidden(): void {
        const willHide = !props.component.isHidden;
        componentsStore.setComponentHidden(props.component.id, willHide);

        if (willHide) {
            showToast(t('bricks.canvas.toastDisabled'));
        }
    }

    /** Toggles visibility on one device */
    function handleToggleDevice(device: TBricksDeviceKey): void {
        const current = props.component.deviceVisibility?.[device] !== false;
        componentsStore.setComponentDeviceVisibilityFlag(props.component.id, device, !current);
    }

    /** Moves the component up */
    function handleMoveUp(): void {
        componentsStore.moveComponentUp(props.component.id);
    }

    /** Moves the component down */
    function handleMoveDown(): void {
        componentsStore.moveComponentDown(props.component.id);
    }

    /** Toggles the favorite mark (the toast shows only when it is added) */
    function handleToggleFavorite(): void {
        const willAdd = !isFavorite.value;
        componentsStore.toggleFavorite(props.component.componentName);

        if (willAdd) {
            showToast(t('bricks.canvas.toastFavoriteAdded'));
        }
    }

    /**
     * Toggles interactive preview mode for the component.
     */
    function handleToggleInteractivePreview(): void {
        componentsStore.toggleInteractivePreview(props.component.id);
    }
    // #endregion

    return {
        isFavorite,
        canMoveUp,
        canMoveDown,
        canPaste,
        contextMenuPosition,
        isInteractivePreview,
        handleClick,
        handleContextMenu,
        closeContextMenu,
        handleEdit,
        handleDelete,
        handleCopy,
        handlePaste,
        handleDuplicate,
        handleToggleHidden,
        handleToggleDevice,
        handleMoveUp,
        handleMoveDown,
        handleToggleFavorite,
        handleToggleInteractivePreview,
    };
}
