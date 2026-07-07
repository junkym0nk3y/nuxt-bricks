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
 * Переводит ключ через глобальный i18n. Конфиг тулбара пересобирается на каждый
 * рендер, поэтому строки резолвятся лениво и следуют текущей локали.
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
 * Синхронизирует toolbar state с текущей позицией курсора в редакторе.
 * Читает mark-атрибуты через getAttributes('textStyle'),
 * node-атрибуты — напрямую из parent-узла ($anchor.parent.attrs).
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
 * Создает конфигурацию toolbar для Text Editor
 *
 * @param params.editor - Экземпляр Tiptap редактора
 * @param params.availableFonts - Список доступных шрифтов из конфига
 * @param params.currentFontSize - Ref с текущим размером шрифта
 * @param params.currentColor - Ref с текущим цветом текста
 * @param params.currentFontFamily - Ref с текущим выбранным семейством шрифта
 * @returns Массив групп элементов toolbar
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
}: ITextEditorToolbarConfigParams): IToolbarGroup[] {
    /**
     * Устанавливает толщину шрифта и синхронизирует select.
     * Также снимает Bold mark (<strong>/<b>), чтобы жирность
     * управлялась только через inline font-weight.
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
     * Устанавливает размер шрифта и синхронизирует select
     */
    function setFontSize(size: string): void {
        editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
        currentFontSize.value = size;
    }

    /**
     * Устанавливает цвет текста
     */
    function setTextColor(color: string): void {
        editor.chain().focus().setColor(color).run();
        currentColor.value = color;
    }

    /**
     * Устанавливает или сбрасывает семейство шрифта
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
     * Устанавливает межстрочный интервал
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
     * Устанавливает межбуквенный интервал
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
        // Форматирование текста (B, I, U)
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
            ],
        },

        // Выбор шрифта
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

        // Размер шрифта
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

        // Метрики шрифта: толщина, межстрочный и межбуквенный интервалы
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

        // Цвет текста
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

        // Выравнивание текста
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

        // Списки
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

        // Разделитель (горизонтальная линия)
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
 * Провайдит `$textEditorToolbar` (утилиты конфигурации toolbar'а текстового
 * редактора). Вызывается lazy-чанком из plugins/text-editor-toolbar.ts
 * при первом заходе на /bricks.
 *
 * @param nuxtApp - Экземпляр Nuxt-приложения.
 */
export function installTextEditorToolbar(nuxtApp: NuxtApp): void {
    const textEditorToolbar: ITextEditorToolbar = {
        createToolbarConfig,
        syncToolbarState,
    };

    nuxtApp.provide('textEditorToolbar', textEditorToolbar);
}
