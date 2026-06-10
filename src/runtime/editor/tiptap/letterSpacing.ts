// #region Imports
// Tiptap
import { Extension, type ChainedCommands } from '@tiptap/core';
// #endregion

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        letterSpacing: {
            /**
             * Set the letter spacing
             */
            setLetterSpacing: (letterSpacing: string) => ReturnType;
            /**
             * Unset the letter spacing
             */
            unsetLetterSpacing: () => ReturnType;
        };
    }
}

/**
 * Кастомное расширение для поддержки letterSpacing атрибута
 * Позволяет устанавливать межбуквенный интервал для параграфов и заголовков
 */
export const LetterSpacing = Extension.create({
    name: 'letterSpacing',

    addOptions() {
        return {
            types: ['paragraph', 'heading'],
            defaultLetterSpacing: null,
        };
    },

    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    letterSpacing: {
                        default: this.options.defaultLetterSpacing,
                        parseHTML: (element) =>
                            element.style.letterSpacing?.replace(/['"]+/g, '') || null,
                        renderHTML: (attributes) => {
                            if (!attributes.letterSpacing) {
                                return {};
                            }

                            return {
                                style: `letter-spacing: ${attributes.letterSpacing}`,
                            };
                        },
                    },
                },
            },
        ];
    },

    addCommands() {
        return {
            setLetterSpacing:
                (letterSpacing: string) =>
                ({ chain }: { chain: () => ChainedCommands }) => {
                    return this.options.types
                        .reduce(
                            (commands: ChainedCommands, type: string) =>
                                commands.updateAttributes(type, { letterSpacing }),
                            chain()
                        )
                        .run();
                },
            unsetLetterSpacing:
                () =>
                ({ chain }: { chain: () => ChainedCommands }) => {
                    return this.options.types
                        .reduce(
                            (commands: ChainedCommands, type: string) =>
                                commands.resetAttributes(type, 'letterSpacing'),
                            chain()
                        )
                        .run();
                },
        };
    },
});
