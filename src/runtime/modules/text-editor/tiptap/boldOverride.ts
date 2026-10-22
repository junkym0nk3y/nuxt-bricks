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
 * Custom Bold mark written from scratch instead of extending @tiptap/extension-bold.
 *
 * The native Bold of TipTap v3 treats an inline font-weight of 500 or above as bold
 * on its own and wraps the text into <strong>. Even Bold.extend() inherits the input
 * rules, the paste rules and the keyboard shortcuts that produce <strong> tags.
 *
 * This mark:
 * - parses only explicit <strong> and plain <b> tags (no inline font-weight)
 * - has NO input rules (no auto-bold on **text**)
 * - has NO paste rules
 * - toggles the bold mark on the Mod-b keyboard shortcut
 * - renders as <strong>
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

                    // <b> with any explicit font-weight style: the FontWeight extension takes it
                    if (el.style.fontWeight) {
                        return false;
                    }

                    // Plain <b> without an inline style: an ordinary bold tag
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
