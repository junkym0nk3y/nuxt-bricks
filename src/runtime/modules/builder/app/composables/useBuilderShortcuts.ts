// #region Imports
// Pinia
import { useComponentsStore } from '../../core/stores/components';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
// #endregion

/**
 * The hotkeys of the builder: Delete/Backspace (removal), Ctrl/Cmd+C/V (copy and
 * paste), Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (undo/redo), Escape (dropping the
 * selection → hiding the properties panel). It returns the handler for the
 * `keydown` on window — subscribing and unsubscribing is the caller's (the
 * composition root's).
 *
 * A role without the editing right is left with Escape alone: the keyboard is a
 * path around the interface, and hidden buttons are not enough against it (Ctrl+V
 * would paste a block onto a canvas that carries no visible editing button at all).
 */
export function useBuilderShortcuts() {
    const componentsStore = useComponentsStore();
    const { canEdit } = useBuilderPermissions();

    /**
     * Checks whether a keyboard event is to be ignored.
     *
     * Ignored are the events inside input fields, text areas and editable elements,
     * as well as everything that happens inside an open dialog.
     *
     * The dialogs are not a belt-and-braces measure: the handler sits on window
     * while the modals are teleported into body, so Delete on a button of theirs
     * ("Cancel" in the create-page window, for one) used to remove the block
     * selected on the canvas behind the modal, and Ctrl/Cmd+Z used to edit a canvas
     * that is not visible on the screen.
     *
     * @param target - The HTML element the event happened on.
     * @returns true when the event is to be ignored.
     */
    function shouldIgnoreKeyEvent(target: HTMLElement): boolean {
        return (
            target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            Boolean(target.closest('[role="dialog"], [role="alertdialog"]'))
        );
    }

    /**
     * Handles the hotkey removing a component (Delete/Backspace).
     *
     * @param event - The keyboard event.
     * @returns true when the event has been handled.
     */
    function handleDeleteShortcut(event: KeyboardEvent): boolean {
        if (event.key !== 'Delete' && event.key !== 'Backspace') {
            return false;
        }
        if (!componentsStore.selectedComponent) {
            return false;
        }
        event.preventDefault();
        componentsStore.removeComponent(componentsStore.selectedComponent.id);
        return true;
    }

    /**
     * Handles the hotkey copying a component (Ctrl/Cmd+C).
     *
     * @param event - The keyboard event.
     * @returns true when the event has been handled.
     */
    function handleCopyShortcut(event: KeyboardEvent): boolean {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'c') {
            return false;
        }
        if (!componentsStore.selectedComponent) {
            return false;
        }
        event.preventDefault();
        componentsStore.copyComponentToClipboard(componentsStore.selectedComponent.id);
        return true;
    }

    /**
     * Handles the hotkey pasting a component (Ctrl/Cmd+V).
     *
     * @param event - The keyboard event.
     * @returns true when the event has been handled.
     */
    function handlePasteShortcut(event: KeyboardEvent): boolean {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'v') {
            return false;
        }
        event.preventDefault();
        componentsStore.pasteFromClipboard();
        return true;
    }

    /**
     * Handles Escape: drops the selection of a component (the properties panel
     * leaves).
     *
     * @param event - The keyboard event.
     * @returns true when the event has been handled.
     */
    function handleEscapeShortcut(event: KeyboardEvent): boolean {
        if (event.key !== 'Escape') {
            return false;
        }
        // The event has been handled already (by the closing of a modal, for one)
        // — the selection is not dropped
        if (event.defaultPrevented) {
            return true;
        }
        if (!componentsStore.selectedComponent) {
            return false;
        }
        componentsStore.deselectComponent();
        return true;
    }

    /**
     * Handles the undo/redo hotkeys (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
     *
     * @param event - The keyboard event.
     */
    function handleUndoRedoShortcut(event: KeyboardEvent): void {
        if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') {
            return;
        }
        event.preventDefault();
        if (event.shiftKey) {
            componentsStore.redo();
            return;
        }
        componentsStore.undo();
    }

    /**
     * The main handler of the keyboard events. It delegates the handling to the
     * specialized functions depending on the key that was pressed.
     *
     * @param event - The keyboard event.
     */
    function handleKeyDown(event: KeyboardEvent): void {
        const target = event.target as HTMLElement;
        if (shouldIgnoreKeyEvent(target)) {
            return;
        }
        if (!canEdit.value) {
            // Escape merely drops the selection — the only thing available anyway
            handleEscapeShortcut(event);
            return;
        }
        if (handleDeleteShortcut(event)) {
            return;
        }
        if (handleCopyShortcut(event)) {
            return;
        }
        if (handlePasteShortcut(event)) {
            return;
        }
        if (handleEscapeShortcut(event)) {
            return;
        }
        handleUndoRedoShortcut(event);
    }

    return { handleKeyDown };
}
