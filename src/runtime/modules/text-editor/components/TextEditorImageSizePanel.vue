<script setup lang="ts">
// #region Imports
// Types
import type { ITextEditorImageSizePanelProps } from './types';

// Utils
import {
    SIZE_UNITS,
    DEFAULT_PX_PER_EM,
    parseCustomDimension,
    convertToPx,
    convertFromPx,
    roundDecimal,
    type TSizeUnit,
} from '../utils/sizeUnits';
import { findSelectedMediaNode } from '../utils/selectedMediaNode';

// Vue
import { ref, onMounted } from 'vue';

// Components
import BricksTooltip from '../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../ui/tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITextEditorImageSizePanelProps>(), {});
// #endregion

// #region Data
const sizeWidth = ref('');
const sizeHeight = ref('');
const sizeUnit = ref<TSizeUnit>('rem');
const lockAspectRatio = ref(true);
// #endregion

// #region Methods
/**
 * Читает текущие размеры из атрибутов выбранного нода.
 */
function readCurrentSize(): void {
    if (!props.editor || !props.activeNodeType) {
        return;
    }

    const attrs = props.editor.getAttributes(props.activeNodeType);

    if (attrs.customWidth || attrs.customHeight) {
        const wParsed = attrs.customWidth ? parseCustomDimension(attrs.customWidth) : null;
        const hParsed = attrs.customHeight ? parseCustomDimension(attrs.customHeight) : null;

        sizeWidth.value = wParsed ? String(wParsed.value) : '';
        sizeHeight.value = hParsed ? String(hParsed.value) : '';
        sizeUnit.value = (wParsed?.unit || hParsed?.unit || 'rem') as TSizeUnit;
    } else {
        sizeWidth.value = attrs.width ? String(attrs.width) : '';
        sizeHeight.value = attrs.height ? String(attrs.height) : '';
        sizeUnit.value = 'px';
    }
}

/**
 * Возвращает реальный px-эквивалент 1em для текущего выбранного медиа-элемента.
 * Использует computed font-size элемента, а не константу.
 */
function getEmPixelSize(): number {
    if (!props.editor || !props.activeNodeType) {
        return DEFAULT_PX_PER_EM;
    }

    const media = findSelectedMediaNode(props.editor);
    if (!media) {
        return DEFAULT_PX_PER_EM;
    }

    return parseFloat(getComputedStyle(media.element).fontSize) || DEFAULT_PX_PER_EM;
}

/**
 * Возвращает текущее соотношение сторон (width/height) выбранного медиа.
 */
function getCurrentAspectRatio(): number | null {
    if (!props.editor || !props.activeNodeType) {
        return null;
    }
    const attrs = props.editor.getAttributes(props.activeNodeType);
    if (!attrs.width || !attrs.height) {
        return null;
    }
    return attrs.width / attrs.height;
}

/**
 * Применяет текущие значения размеров к атрибутам нода.
 */
function applySize(): void {
    if (!props.editor || !props.activeNodeType) {
        return;
    }

    const w = parseFloat(sizeWidth.value);
    const h = parseFloat(sizeHeight.value);
    const unit = sizeUnit.value;
    const attrs: Record<string, unknown> = {};

    if (unit === 'px') {
        attrs.customWidth = null;
        attrs.customHeight = null;
        if (!isNaN(w) && w > 0) {
            attrs.width = Math.round(w);
        }
        if (!isNaN(h) && h > 0) {
            attrs.height = Math.round(h);
        }
    } else {
        if (!isNaN(w) && w > 0) {
            attrs.customWidth = `${w}${unit}`;
            const pxEquiv = convertToPx(w, unit, getEmPixelSize());
            if (pxEquiv > 0) {
                attrs.width = pxEquiv;
            }
        } else {
            attrs.customWidth = null;
        }

        if (!isNaN(h) && h > 0) {
            attrs.customHeight = `${h}${unit}`;
            const pxEquiv = convertToPx(h, unit, getEmPixelSize());
            if (pxEquiv > 0) {
                attrs.height = pxEquiv;
            }
        } else {
            attrs.customHeight = null;
        }
    }

    // Запоминаем позицию ноды — updateAttributes внутри вызывает setNodeMarkup,
    // который заменяет ноду и конвертирует NodeSelection → TextSelection.
    // После обновления восстанавливаем NodeSelection на той же позиции.
    const nodePos = props.editor.state.selection.from;

    props.editor
        .chain()
        .command(({ tr }) => {
            tr.setMeta('customSize', true);
            return true;
        })
        .updateAttributes(props.activeNodeType, attrs)
        .setNodeSelection(nodePos)
        .run();
}

/**
 * Применяет ширину и пересчитывает высоту при lock aspect ratio.
 */
function applyWidth(): void {
    const w = parseFloat(sizeWidth.value);
    if (isNaN(w) || w <= 0) {
        return;
    }

    if (lockAspectRatio.value) {
        const ratio = getCurrentAspectRatio();
        if (ratio) {
            sizeHeight.value = String(roundDecimal(w / ratio, 2));
        }
    }

    applySize();
}

/**
 * Применяет высоту и пересчитывает ширину при lock aspect ratio.
 */
function applyHeight(): void {
    const h = parseFloat(sizeHeight.value);
    if (isNaN(h) || h <= 0) {
        return;
    }

    if (lockAspectRatio.value) {
        const ratio = getCurrentAspectRatio();
        if (ratio) {
            sizeWidth.value = String(roundDecimal(h * ratio, 2));
        }
    }

    applySize();
}

/**
 * Переключает единицу измерения и конвертирует значения.
 * Конвертирует от пиксельных attr (source of truth), чтобы избежать накопления ошибок округления.
 */
function cycleUnit(): void {
    const currentIndex = SIZE_UNITS.indexOf(sizeUnit.value);
    const newUnit = SIZE_UNITS[(currentIndex + 1) % SIZE_UNITS.length];

    // Берём пиксельные значения из attr — они всегда актуальны
    if (props.editor && props.activeNodeType) {
        const attrs = props.editor.getAttributes(props.activeNodeType);
        const pxW = Number(attrs.width);
        const pxH = Number(attrs.height);
        const emPixelSize = getEmPixelSize();

        if (pxW > 0) {
            sizeWidth.value = String(roundDecimal(convertFromPx(pxW, newUnit, emPixelSize), 2));
        }
        if (pxH > 0) {
            sizeHeight.value = String(roundDecimal(convertFromPx(pxH, newUnit, emPixelSize), 2));
        }
    }

    sizeUnit.value = newUnit;
    applySize();
}

/**
 * Обрабатывает ввод в поле размера (санитизация).
 */
function handleSizeInput(event: Event, dimension: 'width' | 'height'): void {
    const target = event.target as HTMLInputElement | null;
    if (!target) {
        return;
    }

    const sanitized = target.value.replace(/[^\d.]/g, '');

    if (dimension === 'width') {
        sizeWidth.value = sanitized;
    } else {
        sizeHeight.value = sanitized;
    }

    if (target.value !== sanitized) {
        target.value = sanitized;
    }
}
// #endregion

// #region Lifecycle
onMounted(() => {
    readCurrentSize();
});
// #endregion
</script>

<template>
    <div :class="$style.TextEditorImageSizePanel" @mousedown.stop @click.stop>
        <div :class="$style.sizeRow">
            <span :class="$style.sizeLabel">W</span>
            <input
                :class="$style.sizeInput"
                type="text"
                inputmode="decimal"
                :value="sizeWidth"
                @input="handleSizeInput($event, 'width')"
                @blur="applyWidth"
                @keydown.enter.stop.prevent="applyWidth"
            />
        </div>

        <div :class="$style.sizeMeta">
            <BricksTooltip top>
                <template #activator>
                    <button
                        type="button"
                        :class="[$style.lockButton, { [$style._locked]: lockAspectRatio }]"
                        @mousedown.prevent="lockAspectRatio = !lockAspectRatio"
                    >
                        <BricksIcon :icon="lockAspectRatio ? 'ph:link' : 'ph:link-break'" />
                    </button>
                </template>
                <BricksTooltipHint
                    :text="lockAspectRatio ? 'Пропорции сохраняются' : 'Свободное изменение'"
                />
            </BricksTooltip>

            <button type="button" :class="$style.unitButton" @mousedown.prevent="cycleUnit">
                {{ sizeUnit }}
            </button>
        </div>

        <div :class="$style.sizeRow">
            <span :class="$style.sizeLabel">H</span>
            <input
                :class="$style.sizeInput"
                type="text"
                inputmode="decimal"
                :value="sizeHeight"
                @input="handleSizeInput($event, 'height')"
                @blur="applyHeight"
                @keydown.enter.stop.prevent="applyHeight"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.TextEditorImageSizePanel {
    position: absolute;
    top: calc(100% + 0.4rem);
    right: 0;
    z-index: 1;
    display: flex;
    padding: 0.8rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    flex-direction: column;
    gap: 0.4rem;
    box-shadow: var(--shadow-sm);
}

.sizeRow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.sizeLabel {
    width: 1.6rem;
    text-align: center;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--bricks-base-500);
    user-select: none;
}

.sizeInput {
    width: 7rem;
    padding: 0.4rem 0.6rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    outline: none;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-base-900);

    &:focus {
        border-color: var(--bricks-primary);
    }
}

.sizeMeta {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0 0 0 2rem;
}

.lockButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: var(--border-radius-xs);
    border: none;
    background: transparent;
    color: var(--bricks-base-400);
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }

    &:hover {
        background-color: var(--bricks-base-100);
        color: var(--bricks-base-600);
    }

    &._locked {
        color: var(--bricks-primary);
    }
}

.unitButton {
    padding: 0.2rem 0.6rem;
    border-radius: var(--border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    font-size: 1.1rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition: background-color var(--default-transition);
    cursor: pointer;

    &:hover {
        background: var(--bricks-base-100);
    }
}
</style>
