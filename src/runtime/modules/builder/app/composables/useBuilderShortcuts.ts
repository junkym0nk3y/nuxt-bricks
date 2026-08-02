// #region Imports
// Pinia
import { useComponentsStore } from '../../core/stores/components';
// #endregion

/**
 * Горячие клавиши билдера: Delete/Backspace (удаление), Ctrl/Cmd+C/V (копирование/вставка),
 * Ctrl/Cmd+Z и Ctrl/Cmd+Shift+Z (undo/redo), Escape (сброс выбора → скрытие панели свойств).
 * Возвращает обработчик для `keydown` на window — подписку/отписку выполняет вызывающий
 * (composition root).
 */
export function useBuilderShortcuts() {
    const componentsStore = useComponentsStore();

    /**
     * Проверяет, следует ли игнорировать событие клавиатуры.
     *
     * Игнорируются события в полях ввода, текстовых областях и редактируемых
     * элементах, а также всё, что происходит внутри открытого диалога.
     *
     * Диалоги — не перестраховка: обработчик висит на window, а модалки
     * телепортированы в body, поэтому Delete на их кнопке (например, «Отмена» в
     * окне создания страницы) удалял выбранный на канвасе блок за модалкой, а
     * Ctrl/Cmd+Z правил канвас, которого на экране не видно.
     *
     * @param target - HTML-элемент, на котором произошло событие.
     * @returns true, если событие следует игнорировать.
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
     * Обрабатывает горячую клавишу удаления компонента (Delete/Backspace).
     *
     * @param event - Событие клавиатуры.
     * @returns true, если событие было обработано.
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
     * Обрабатывает горячую клавишу копирования компонента (Ctrl/Cmd+C).
     *
     * @param event - Событие клавиатуры.
     * @returns true, если событие было обработано.
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
     * Обрабатывает горячую клавишу вставки компонента (Ctrl/Cmd+V).
     *
     * @param event - Событие клавиатуры.
     * @returns true, если событие было обработано.
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
     * Обрабатывает Escape: сбрасывает выбор компонента (панель свойств уезжает).
     *
     * @param event - Событие клавиатуры.
     * @returns true, если событие было обработано.
     */
    function handleEscapeShortcut(event: KeyboardEvent): boolean {
        if (event.key !== 'Escape') {
            return false;
        }
        // Событие уже обработано (например, закрытием модалки) — выбор не сбрасываем
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
     * Обрабатывает горячие клавиши отмены/повтора действий (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z).
     *
     * @param event - Событие клавиатуры.
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
     * Главный обработчик событий клавиатуры.
     * Делегирует обработку специализированным функциям в зависимости от нажатой клавиши.
     *
     * @param event - Событие клавиатуры.
     */
    function handleKeyDown(event: KeyboardEvent): void {
        const target = event.target as HTMLElement;
        if (shouldIgnoreKeyEvent(target)) {
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
