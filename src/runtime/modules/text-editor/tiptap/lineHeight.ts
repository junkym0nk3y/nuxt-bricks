// #region Imports
// Tiptap
import { Extension, type ChainedCommands } from '@tiptap/core';
// #endregion

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        lineHeight: {
            /**
             * Set the line height
             */
            setLineHeight: (lineHeight: string) => ReturnType;
            /**
             * Unset the line height
             */
            unsetLineHeight: () => ReturnType;
        };
    }
}

/**
 * Custom extension adding the lineHeight attribute.
 * Lets the line height be set on paragraphs and headings.
 */
export const LineHeight = Extension.create({
    name: 'lineHeight',

    addOptions() {
        return {
            types: ['paragraph', 'heading'],
            defaultLineHeight: null,
        };
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    lineHeight: {
                        default: this.options.defaultLineHeight,
                        parseHTML: (element) =>
                            element.style.lineHeight?.replace(/['"]+/g, '') || null,
                        renderHTML: (attributes) => {
                            if (!attributes.lineHeight) {
                                return {};
                            }

                            return {
                                style: `line-height: ${attributes.lineHeight}`,
                            };
                        },
                    },
                },
            },
        ];
    },

    addCommands() {
        return {
            setLineHeight:
                (lineHeight: string) =>
                ({ chain }: { chain: () => ChainedCommands }) => {
                    return this.options.types
                        .reduce(
                            (commands: ChainedCommands, type: string) =>
                                commands.updateAttributes(type, { lineHeight }),
                            chain()
                        )
                        .run();
                },
            unsetLineHeight:
                () =>
                ({ chain }: { chain: () => ChainedCommands }) => {
                    return this.options.types
                        .reduce(
                            (commands: ChainedCommands, type: string) =>
                                commands.resetAttributes(type, 'lineHeight'),
                            chain()
                        )
                        .run();
                },
        };
    },
});
