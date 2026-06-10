// #region Imports
// Tiptap
import { Extension, type ChainedCommands } from '@tiptap/core';
// #endregion

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        fontWeight: {
            /**
             * Set the font weight
             */
            setFontWeight: (fontWeight: string) => ReturnType;
            /**
             * Unset the font weight
             */
            unsetFontWeight: () => ReturnType;
        };
    }
}

/**
 * Кастомное расширение для поддержки fontWeight атрибута в TextStyle
 * Позволяет устанавливать толщину шрифта для выделенного текста
 */
export const FontWeight = Extension.create({
    name: 'fontWeight',

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
                    fontWeight: {
                        default: null,
                        parseHTML: (element) =>
                            element.style.fontWeight?.replace(/['"]+/g, '') || null,
                        renderHTML: (attributes) => {
                            if (!attributes.fontWeight) {
                                return {};
                            }

                            return {
                                style: `font-weight: ${attributes.fontWeight}`,
                            };
                        },
                    },
                },
            },
        ];
    },

    addCommands() {
        return {
            setFontWeight:
                (fontWeight: string) =>
                ({ chain }: { chain: () => ChainedCommands }) => {
                    return chain().setMark('textStyle', { fontWeight }).run();
                },
            unsetFontWeight:
                () =>
                ({ chain }: { chain: () => ChainedCommands }) => {
                    return chain().setMark('textStyle', { fontWeight: null }).run();
                },
        };
    },
});
