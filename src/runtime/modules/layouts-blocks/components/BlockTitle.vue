<script setup lang="ts">
// #region Imports
// Types
import type { IInlineContentSegment } from '../../common/types/content';
import type { InlineEditingPropType } from '../../text-editor/stores/inlineEditing';

// Vue
import { computed, inject, watch, useCssModule, type ComputedRef } from 'vue';

// Utils
import { applyColorToSvgContent } from '../utils/inlineContent';

// Composables
import { useInlineEditor } from '../../text-editor/composables/useInlineEditor';
// #endregion

// #region Interfaces
interface IBlockTitleProps {
    componentId?: string;
    headingType?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
    fontFamily?: string;
    fontWeight?: string | number;
    lineHeight?: string | number;
    marginTop?: string | number;
    marginBottom?: string | number;
    textAlign?: 'left' | 'center' | 'right';
    fontSize?: string | number;
    letterSpacing?: string | number;
    inlineContent?: IInlineContentSegment[];
}

interface IInlineEditingContext {
    componentId: ComputedRef<string | null>;
    propName: ComputedRef<string | null>;
    propType: ComputedRef<InlineEditingPropType | null>;
    isEditing: ComputedRef<boolean>;
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IBlockTitleProps>(), {
    componentId: '',
    headingType: 'h2',
    fontFamily: '',
    fontWeight: 600,
    lineHeight: 0,
    marginTop: 0,
    marginBottom: 0,
    textAlign: 'left',
    fontSize: '',
    letterSpacing: '',
    inlineContent: () => [],
});
// #endregion

// #region Data
const $style = useCssModule();

const inlineEditingContext = inject<IInlineEditingContext | null>('inlineEditingContext', null);

const inlineEditor = props.componentId
    ? useInlineEditor({
          componentId: props.componentId,
          propName: 'inlineContent',
          propType: 'inline-content',
      })
    : null;
// #endregion

// #region Computed
const headingStyle = computed<Record<string, string>>(() => {
    const style: Record<string, string> = {
        marginTop: typeof props.marginTop === 'number' ? `${props.marginTop}rem` : props.marginTop,
        marginBottom:
            typeof props.marginBottom === 'number'
                ? `${props.marginBottom}rem`
                : props.marginBottom,
        textAlign: props.textAlign,
    };

    if (props.fontFamily) {
        style.fontFamily = `${props.fontFamily}, sans-serif`;
    }

    if (props.fontWeight) {
        style.fontWeight = String(props.fontWeight);
    }

    const hasCustomFontSize =
        (typeof props.fontSize === 'number' && props.fontSize > 0) ||
        (typeof props.fontSize === 'string' && props.fontSize.trim().length > 0);

    if (hasCustomFontSize) {
        style.fontSize =
            typeof props.fontSize === 'number' ? `${props.fontSize}rem` : props.fontSize.trim();
    }

    const hasCustomLetterSpacing =
        (typeof props.letterSpacing === 'number' && props.letterSpacing !== 0) ||
        (typeof props.letterSpacing === 'string' && props.letterSpacing.trim().length > 0);

    const hasCustomLineHeight =
        (typeof props.lineHeight === 'number' && props.lineHeight > 0) ||
        (typeof props.lineHeight === 'string' && props.lineHeight.trim().length > 0);

    if (hasCustomLineHeight) {
        style.lineHeight =
            typeof props.lineHeight === 'number'
                ? String(props.lineHeight)
                : props.lineHeight.trim();
    }

    if (hasCustomLetterSpacing) {
        style.letterSpacing =
            typeof props.letterSpacing === 'number'
                ? `${props.letterSpacing}rem`
                : props.letterSpacing.trim();
    }

    return style;
});

/**
 * Проверяет, активен ли inline-editing для этого компонента.
 */
const isEditing = computed<boolean>(() => {
    if (!inlineEditingContext || !props.componentId) {
        return false;
    }
    return inlineEditingContext.isEditing.value;
});

const headingClasses = computed(() => [
    $style.BlockTitle,
    $style[`_${props.headingType}`],
    { [$style.isEditing]: isEditing.value },
]);

const inlineSegments = computed<IInlineContentSegment[]>(() => {
    if (Array.isArray(props.inlineContent) && props.inlineContent.length > 0) {
        return props.inlineContent;
    }

    return [];
});
// #endregion

// #region Lifecycle
// Активируем TipTap при переходе в режим editing
watch(isEditing, async (editing) => {
    if (editing && inlineEditor) {
        await inlineEditor.initEditor();
    }
});
// #endregion

// #region Methods
/**
 * Возвращает значение размера для inline-медиа.
 *
 * @param value - Значение ширины или высоты.
 * @returns Отформатированная строка или undefined.
 */
function resolveDimension(value?: string | number): string | undefined {
    if (typeof value === 'number') {
        return `${value}rem`;
    }

    return value && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Подготавливает SVG контент с учётом выбранного цвета.
 *
 * @param segment - SVG сегмент.
 * @returns Строка SVG.
 */
function getSegmentSvgContent(segment: IInlineContentSegment): string {
    return applyColorToSvgContent(segment.svgContent || '', segment.color);
}

/**
 * Возвращает стили для SVG обёртки.
 *
 * @param segment - Индивидуальный сегмент.
 * @returns Inline стили.
 */
function getSvgWrapperStyle(segment: IInlineContentSegment): Record<string, string> {
    const style: Record<string, string> = {
        display: 'inline-flex',
        alignItems: 'center',
    };

    if (segment.color) {
        style.color = segment.color;
    }

    const width = resolveDimension(segment.width);
    const height = resolveDimension(segment.height);

    if (width) {
        style.width = width;
    }

    if (height) {
        style.height = height;
    }

    return style;
}

/**
 * Возвращает стили для inline изображения.
 *
 * @param segment - Сегмент изображения.
 * @returns Объект стилей.
 */
function getImageStyle(segment: IInlineContentSegment): Record<string, string> {
    const style: Record<string, string> = {};
    const width = resolveDimension(segment.width);
    const height = resolveDimension(segment.height);

    if (width) {
        style.width = width;
    }

    if (height) {
        style.height = height;
    }

    return style;
}

/**
 * Предотвращает всплытие клика внутри редактора.
 *
 * @param event - Событие клика.
 */
function handleEditorClick(event: MouseEvent): void {
    event.stopPropagation();
}
// #endregion
</script>

<template>
    <component
        :is="props.headingType"
        :class="headingClasses"
        :style="headingStyle"
        @click.stop="isEditing ? handleEditorClick($event) : undefined"
    >
        <!-- Inline editing mode: TipTap -->
        <template
            v-if="isEditing && inlineEditor?.editor.value && inlineEditor?.editorContent.value"
        >
            <component
                :is="inlineEditor.editorContent.value"
                :editor="inlineEditor.editor.value"
                :class="$style.editorContent"
            />
        </template>

        <!-- Normal mode: static segments -->
        <template v-else>
            <template v-for="segment in inlineSegments" :key="segment.id">
                <span
                    v-if="segment.kind === 'text'"
                    :class="$style.inlineSegment"
                    v-text="segment.text"
                />

                <br v-else-if="segment.kind === 'line-break'" :class="$style.lineBreak" />

                <img
                    v-else-if="segment.kind === 'image'"
                    :src="segment.url"
                    :alt="segment.alt || ''"
                    :class="$style.inlineImage"
                    loading="lazy"
                    :style="getImageStyle(segment)"
                />

                <span
                    v-else-if="segment.kind === 'svg'"
                    :class="$style.inlineSvg"
                    :style="getSvgWrapperStyle(segment)"
                    v-html="getSegmentSvgContent(segment)"
                />
            </template>
        </template>
    </component>
</template>

<style module lang="scss">
.BlockTitle {
    line-height: 1.2;
    color: var(--bricks-base-900);

    &._h1,
    &._h2,
    &._h3,
    &._h4,
    &._h5,
    &._h6 {
        letter-spacing: initial;
    }

    &._h1 {
        font-size: 3.2rem;

        @container (min-width: 768px) {
            font-size: 4.8rem;
        }

        @container (min-width: 1024px) {
            font-size: 6.4rem;
        }
    }

    &._h2 {
        font-size: 2.8rem;

        @container (min-width: 768px) {
            font-size: 4rem;
        }

        @container (min-width: 1024px) {
            font-size: 5.2rem;
        }
    }

    &._h3 {
        font-size: 2.4rem;

        @container (min-width: 768px) {
            font-size: 3.2rem;
        }

        @container (min-width: 1024px) {
            font-size: 4rem;
        }
    }

    &._h4 {
        font-size: 2rem;

        @container (min-width: 768px) {
            font-size: 2.8rem;
        }

        @container (min-width: 1024px) {
            font-size: 3.2rem;
        }
    }

    &._h5 {
        font-size: 1.8rem;

        @container (min-width: 768px) {
            font-size: 2.4rem;
        }

        @container (min-width: 1024px) {
            font-size: 2.8rem;
        }
    }

    &._h6 {
        font-size: 1.6rem;

        @container (min-width: 768px) {
            font-size: 2rem;
        }

        @container (min-width: 1024px) {
            font-size: 2.4rem;
        }
    }

    &.isEditing {
        cursor: text;
    }
}

.editorContent {
    display: contents;

    :global(.ProseMirror) {
        outline: none;

        p {
            display: inline;
            margin: 0;
        }
    }
}

.inlineSegment,
.inlineImage,
.inlineSvg {
    display: inline-flex;
    align-items: center;
    margin-right: 0.4rem;

    &:last-child {
        margin-right: 0;
    }
}

.inlineSegment {
    font: inherit;
}

.inlineImage {
    max-height: 100%;
}

.inlineSvg :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
}

.lineBreak {
    content: '';
    display: block;
}
</style>
