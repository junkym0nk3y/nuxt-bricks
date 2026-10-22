// #region Imports
// Types
import type {
    IToolbarGroup,
    ITextEditorToolbar,
    ITextEditorToolbarConfigParams,
    IToolbarStateRefs,
} from '../../modules/ui/inputs/textEditorToolbar.d.ts';
import type { Editor } from '@tiptap/core';
import type { Composer } from 'vue-i18n';
import type { NuxtApp } from '#app';

// Nuxt
import { useNuxtApp } from '#imports';
// #endregion

/**
 * Translates a key through the global i18n. The toolbar config is recomputed on
 * every editor transaction (`useToolbarStateSync`), so the strings are resolved
 * lazily and follow the current locale.
 */
function t(key: string): string {
    const i18n = useNuxtApp().$i18n as Composer | undefined;
    return i18n ? i18n.t(key) : key;
}

const FONT_WEIGHT_PRESETS = Object.freeze([
    { label: 'Thin', value: '100' },
    { label: 'Extra Light', value: '200' },
    { label: 'Light', value: '300' },
    { label: 'Regular', value: '400' },
    { label: 'Medium', value: '500' },
    { label: 'Semi Bold', value: '600' },
    { label: 'Bold', value: '700' },
    { label: 'Extra Bold', value: '800' },
    { label: 'Black', value: '900' },
]);

const FONT_SIZE_PRESETS_PX = Object.freeze([
    12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 50, 52, 54, 58, 60,
]);
const LINE_HEIGHT_PRESETS = Object.freeze([1, 1.2, 1.5, 1.8, 2, 2.4]);
const LETTER_SPACING_PRESETS_PX = Object.freeze([-1, 0, 1, 2, 3, 5]);
const PX_TO_REM_RATIO = 10;

/**
 * Converts px value to rem string using 10px = 1rem ratio
 */
function pxToRem(px: number): string {
    return `${px / PX_TO_REM_RATIO}rem`;
}

/**
 * Syncs the toolbar state with the current cursor position in the editor.
 * Mark attributes are read through getAttributes('textStyle'), node attributes
 * straight off the parent node ($anchor.parent.attrs).
 */
export function syncToolbarState(editor: Editor, refs: IToolbarStateRefs): void {
    const textStyle = editor.getAttributes('textStyle');
    refs.currentFontSize.value = textStyle.fontSize || '1.6rem';
    refs.currentFontWeight.value = textStyle.fontWeight || '';
    refs.currentColor.value = textStyle.color || '#000000';
    refs.currentFontFamily.value = textStyle.fontFamily || '';

    const parentAttrs = editor.state.selection.$anchor.parent.attrs;
    refs.currentLineHeight.value = parentAttrs.lineHeight || '';
    refs.currentLetterSpacing.value = parentAttrs.letterSpacing || '';
}

/**
 * Builds the toolbar configuration for the Text Editor.
 *
 * @param params.editor - The Tiptap editor instance.
 * @param params.availableFonts - List of the fonts available from the config.
 * @param params.currentFontSize - Ref holding the current font size.
 * @param params.currentFontWeight - Ref holding the current font weight.
 * @param params.currentColor - Ref holding the current text color.
 * @param params.currentFontFamily - Ref holding the currently chosen font family.
 * @param params.currentLineHeight - Ref holding the current line height.
 * @param params.currentLetterSpacing - Ref holding the current letter spacing.
 * @param params.onRequestLink - Opens the link modal; without it the toolbar has no
 * link button at all.
 * @returns Array of toolbar item groups.
 */
export function createToolbarConfig({
    editor,
    availableFonts,
    currentFontSize,
    currentFontWeight,
    currentColor,
    currentFontFamily,
    currentLineHeight,
    currentLetterSpacing,
    onRequestLink,
}: ITextEditorToolbarConfigParams): IToolbarGroup[] {
    /**
     * Sets the font weight and syncs the select.
     * Setting a weight also removes the Bold mark (<strong>/<b>), so that weight is
     * driven by the inline font-weight alone. Clearing the weight only drops the
     * inline value — a Bold mark set earlier survives it.
     */
    function setFontWeight(weight: string): void {
        const chain = editor.chain().focus();
        if (!weight) {
            chain.unsetFontWeight().run();
            currentFontWeight.value = '';
            return;
        }

        chain.unsetBold().setFontWeight(weight).run();
        currentFontWeight.value = weight;
    }

    /**
     * Sets the font size and syncs the select
     */
    function setFontSize(size: string): void {
        editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
        currentFontSize.value = size;
    }

    /**
     * Sets the text color
     */
    function setTextColor(color: string): void {
        editor.chain().focus().setColor(color).run();
        currentColor.value = color;
    }

    /**
     * Sets or clears the font family
     */
    function setFontFamily(font: string): void {
        const chain = editor.chain().focus();
        if (!font) {
            chain.unsetFontFamily().run();
            currentFontFamily.value = '';
            return;
        }

        chain.setFontFamily(font).run();
        currentFontFamily.value = font;
    }

    /**
     * Sets the line height
     */
    function setLineHeight(lineHeight: string): void {
        const chain = editor.chain().focus();
        if (!lineHeight) {
            chain.unsetLineHeight().run();
            currentLineHeight.value = '';
            return;
        }

        chain.setLineHeight(lineHeight).run();
        currentLineHeight.value = lineHeight;
    }

    /**
     * Sets the letter spacing
     */
    function setLetterSpacing(letterSpacing: string): void {
        const chain = editor.chain().focus();
        if (!letterSpacing) {
            chain.unsetLetterSpacing().run();
            currentLetterSpacing.value = '';
            return;
        }

        chain.setLetterSpacing(letterSpacing).run();
        currentLetterSpacing.value = letterSpacing;
    }

    return [
        // Text formatting (B, I, U) and the link
        {
            name: 'marks',
            items: [
                {
                    label: 'B',
                    title: 'Bold',
                    run: () => editor.chain().focus().toggleBold().run(),
                    isActive: () => editor.isActive('bold'),
                },
                {
                    label: 'I',
                    title: 'Italic',
                    run: () => editor.chain().focus().toggleItalic().run(),
                    isActive: () => editor.isActive('italic'),
                },
                {
                    label: 'U',
                    title: 'Underline',
                    run: () => editor.chain().focus().toggleUnderline().run(),
                    isActive: () => editor.isActive('underline'),
                },
                // The link sits with the rest of the marks; the button is absent on
                // the surfaces that have not mounted the link modal
                ...(onRequestLink
                    ? [
                          {
                              icon: 'ta:outline-link',
                              title: 'Link',
                              run: onRequestLink,
                              isActive: () => editor.isActive('link'),
                          },
                      ]
                    : []),
            ],
        },

        // Font choice
        {
            name: 'font-family',
            items: [
                {
                    type: 'select',
                    title: 'Font Family',
                    icon: 'ta:outline-typography',
                    value: currentFontFamily.value,
                    options: [
                        { label: 'Default', value: '' },
                        ...availableFonts.map((font) => ({ label: font, value: font })),
                    ],
                    onChange: setFontFamily,
                },
            ],
        },

        // Font size
        {
            name: 'font-size',
            items: [
                {
                    type: 'editable-select',
                    title: 'Font Size',
                    icon: 'ta:outline-text-size',
                    value: currentFontSize.value,
                    options: FONT_SIZE_PRESETS_PX.map((size) => {
                        const remValue = pxToRem(size);
                        return {
                            label: remValue,
                            value: remValue,
                        };
                    }),
                    onChange: setFontSize,
                    customInputPlaceholder: t('bricks.textEditor.fontSizePlaceholder'),
                    transformInput: (raw: string) => {
                        return `${Number.parseFloat(raw)}rem`;
                    },
                    validateInput: (raw: string) => {
                        const num = Number.parseFloat(raw);
                        return Number.isFinite(num) && num > 0;
                    },
                },
            ],
        },

        // Font metrics: weight, line height and letter spacing
        {
            name: 'typography-adjust',
            items: [
                {
                    type: 'editable-select',
                    title: 'Font Weight',
                    icon: 'la:text-width-solid',
                    value: currentFontWeight.value,
                    options: [
                        { label: t('bricks.textEditor.auto'), value: '' },
                        ...FONT_WEIGHT_PRESETS.map((preset) => ({
                            label: `${preset.value} ${preset.label}`,
                            value: preset.value,
                        })),
                    ],
                    onChange: setFontWeight,
                    customInputPlaceholder: t('bricks.textEditor.fontWeightPlaceholder'),
                    transformInput: (raw: string) => {
                        return String(Math.round(Number.parseFloat(raw)));
                    },
                    validateInput: (raw: string) => {
                        const num = Number.parseFloat(raw);
                        return Number.isFinite(num) && num >= 1 && num <= 1000;
                    },
                },
                {
                    type: 'editable-select',
                    title: 'Line Height',
                    icon: 'ta:outline-line-height',
                    hideValue: true,
                    value: currentLineHeight.value,
                    options: [
                        { label: t('bricks.textEditor.auto'), value: '' },
                        ...LINE_HEIGHT_PRESETS.map((lh) => ({
                            label: String(lh),
                            value: String(lh),
                        })),
                        { label: '100%', value: '100%' },
                        { label: '120%', value: '120%' },
                        { label: '150%', value: '150%' },
                    ],
                    onChange: setLineHeight,
                    customInputPlaceholder: t('bricks.textEditor.lineHeightPlaceholder'),
                    transformInput: (raw: string) => {
                        if (raw.endsWith('%')) {
                            return `${Number.parseFloat(raw)}%`;
                        }
                        if (raw.endsWith('rem')) {
                            return `${Number.parseFloat(raw)}rem`;
                        }
                        return String(Number.parseFloat(raw));
                    },
                    validateInput: (raw: string) => {
                        const num = Number.parseFloat(raw);
                        return Number.isFinite(num) && num > 0;
                    },
                },
                {
                    type: 'editable-select',
                    title: 'Letter Spacing',
                    icon: 'ta:outline-letter-spacing',
                    hideValue: true,
                    value: currentLetterSpacing.value,
                    options: [
                        { label: t('bricks.textEditor.normal'), value: '' },
                        ...LETTER_SPACING_PRESETS_PX.map((spacing) => {
                            const remValue = pxToRem(spacing);
                            return {
                                label: remValue,
                                value: remValue,
                            };
                        }),
                    ],
                    onChange: setLetterSpacing,
                    customInputPlaceholder: t('bricks.textEditor.letterSpacingPlaceholder'),
                    transformInput: (raw: string) => {
                        if (raw.endsWith('%')) {
                            return `${Number.parseFloat(raw)}%`;
                        }
                        return `${Number.parseFloat(raw)}rem`;
                    },
                    validateInput: (raw: string) => {
                        const num = Number.parseFloat(raw);
                        return Number.isFinite(num);
                    },
                },
            ],
        },

        // Text color
        {
            name: 'text-color',
            items: [
                {
                    type: 'color',
                    title: 'Text Color',
                    value: currentColor.value,
                    onChange: setTextColor,
                },
            ],
        },

        // Text alignment
        {
            name: 'text-align',
            items: [
                {
                    icon: 'ta:outline-align-left',
                    title: 'Align Left',
                    run: () => editor.chain().focus().setTextAlign('left').run(),
                    isActive: () => editor.isActive({ textAlign: 'left' }),
                },
                {
                    icon: 'ta:outline-align-center',
                    title: 'Align Center',
                    run: () => editor.chain().focus().setTextAlign('center').run(),
                    isActive: () => editor.isActive({ textAlign: 'center' }),
                },
                {
                    icon: 'ta:outline-align-right',
                    title: 'Align Right',
                    run: () => editor.chain().focus().setTextAlign('right').run(),
                    isActive: () => editor.isActive({ textAlign: 'right' }),
                },
                {
                    icon: 'ta:outline-align-justified',
                    title: 'Align Justify',
                    run: () => editor.chain().focus().setTextAlign('justify').run(),
                    isActive: () => editor.isActive({ textAlign: 'justify' }),
                },
            ],
        },

        // Lists
        {
            name: 'lists',
            items: [
                {
                    icon: 'ta:outline-list',
                    title: 'Bullet List',
                    run: () => editor.chain().focus().toggleBulletList().run(),
                    isActive: () => editor.isActive('bulletList'),
                },
                {
                    icon: 'ta:outline-list-numbers',
                    title: 'Numbered List',
                    run: () => editor.chain().focus().toggleOrderedList().run(),
                    isActive: () => editor.isActive('orderedList'),
                },
            ],
        },

        // Divider (a horizontal rule)
        {
            name: 'divider',
            items: [
                {
                    icon: 'ta:outline-separator',
                    title: 'Divider',
                    run: () => editor.chain().focus().setHorizontalRule().run(),
                    isActive: () => false,
                },
            ],
        },
    ];
}

/**
 * Provides `$textEditorToolbar` (the configuration utilities of the text editor
 * toolbar). Called by a lazy chunk from plugins/text-editor-toolbar.ts on the
 * first hit of a builder route.
 *
 * @param nuxtApp - The Nuxt application instance.
 */
export function installTextEditorToolbar(nuxtApp: NuxtApp): void {
    const textEditorToolbar: ITextEditorToolbar = {
        createToolbarConfig,
        syncToolbarState,
    };

    nuxtApp.provide('textEditorToolbar', textEditorToolbar);
}
