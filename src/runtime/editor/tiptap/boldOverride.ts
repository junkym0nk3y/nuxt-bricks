// #region Imports
// Tiptap
import { Mark, mergeAttributes } from '@tiptap/core';
// #endregion

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        bold: {
            /**
             * Set a bold mark
             */
            setBold: () => ReturnType;
            /**
             * Toggle a bold mark
             */
            toggleBold: () => ReturnType;
            /**
             * Unset a bold mark
             */
            unsetBold: () => ReturnType;
        };
    }
}

/**
 * Кастомный Bold mark, написанный с нуля без наследования от @tiptap/extension-bold.
 *
 * Нативный Bold из TipTap v3 автоматически распознаёт inline font-weight >= 500
 * как bold и оборачивает текст в <strong>. Даже Bold.extend() наследует input rules,
 * paste rules и keyboard shortcuts, которые создают <strong> теги.
 *
 * Этот mark:
 * - Парсит только явные <strong> и чистые <b> теги (без inline font-weight)
 * - НЕ имеет input rules (нет авто-bold при **text**)
 * - НЕ имеет paste rules
 * - Keyboard shortcut Mod-b переключает bold mark
 * - Рендерит как <strong>
 */
export const BoldOverride = Mark.create({
    name: 'bold',

    parseHTML() {
        return [
            {
                tag: 'strong',
            },
            {
                tag: 'b',
                getAttrs: (node) => {
                    const el = node as HTMLElement;

                    // <b> с любым явным font-weight стилем — FontWeight extension обработает
                    if (el.style.fontWeight) {
                        return false;
                    }

                    // Чистый <b> без inline стиля — обычный bold тег
                    return null;
                },
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['strong', mergeAttributes(HTMLAttributes), 0];
    },

    addCommands() {
        return {
            setBold:
                () =>
                ({ commands }) => {
                    return commands.setMark(this.name);
                },
            toggleBold:
                () =>
                ({ commands }) => {
                    return commands.toggleMark(this.name);
                },
            unsetBold:
                () =>
                ({ commands }) => {
                    return commands.unsetMark(this.name);
                },
        };
    },

    addKeyboardShortcuts() {
        return {
            'Mod-b': () => this.editor.commands.toggleBold(),
            'Mod-B': () => this.editor.commands.toggleBold(),
        };
    },
});
