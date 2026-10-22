// #region Imports
// Tiptap
import { Extension, type ChainedCommands } from '@tiptap/core';
// #endregion

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontSize: {
            /**
             * Set the font size
             */
            setFontSize: (fontSize: string) => ReturnType;
            /**
             * Unset the font size
             */
            unsetFontSize: () => ReturnType;
        };
    }
}

/**
 * Custom extension adding the fontSize attribute to TextStyle.
 * Lets the font size be set on the selected text.
 */
export const FontSize = Extension.create({
    name: 'fontSize',

    addOptions() {
        return {
            types: ['textStyle'],
        };
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: (element) =>
                            element.style.fontSize?.replace(/['"]+/g, '') || null,
                        renderHTML: (attributes) => {
                            if (!attributes.fontSize) {
                                return {};
                            }

                            return {
                                style: `font-size: ${attributes.fontSize}`,
                            };
                        },
                    },
                },
            },
        ];
    },

    addCommands() {
        return {
            setFontSize:
                (fontSize: string) =>
                ({ chain }: { chain: () => ChainedCommands }) => {
                    return chain().setMark('textStyle', { fontSize }).run();
                },
            unsetFontSize:
                () =>
                ({ chain }: { chain: () => ChainedCommands }) => {
                    return chain().setMark('textStyle', { fontSize: null }).run();
                },
        };
    },
});
