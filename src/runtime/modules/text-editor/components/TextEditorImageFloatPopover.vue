<script setup lang="ts">
// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';

// Vue
import { ref, watchEffect, onBeforeUnmount } from 'vue';

// ProseMirror
import { NodeSelection } from '@tiptap/pm/state';

// Components
import BricksTooltip from '../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../ui/tooltip/BricksTooltipHint.vue';
// #endregion

// #region Interfaces
interface ITiptapImageFloatPopoverProps {
    editor: Editor | null;
}

type TSizeUnit = (typeof SIZE_UNITS)[number];
// #endregion

// #region Props
const props = defineProps<ITiptapImageFloatPopoverProps>();
// #endregion

// #region Data
const SUPPORTED_NODES = ['image', 'video'] as const;
const VALIGN_OPTIONS = [
    { value: 'baseline', icon: 'md:vertical-align-bottom', label: 'Baseline' },
    { value: 'middle', icon: 'md:vertical-align-center', label: 'По центру' },
    { value: 'top', icon: 'md:vertical-align-top', label: 'По верху' },
] as const;
const SIZE_UNITS = ['px', 'rem', 'em', '%'] as const;
const PX_PER_REM = 10;
const PX_PER_EM = 16;

const isVisible = ref(false);
const popoverTop = ref(0);
const popoverLeft = ref(0);
const currentFloat = ref<string | null>(null);
const currentVerticalAlign = ref<string | null>(null);
const activeNodeType = ref<string | null>(null);

const showSizePanel = ref(false);
const sizeWidth = ref('');
const sizeHeight = ref('');
const sizeUnit = ref<TSizeUnit>('rem');
const lockAspectRatio = ref(true);
// #endregion

// #region Methods
/**
 * Определяет тип и DOM-элемент выбранного медиа-нода (image или video).
 */
function findSelectedMediaElement(editor: Editor): HTMLElement | null {
    const { state } = editor.view;
    const { selection } = state;

    if (!(selection instanceof NodeSelection)) {
        return null;
    }

    const nodeName = selection.node.type.name;

    if (!SUPPORTED_NODES.includes(nodeName as (typeof SUPPORTED_NODES)[number])) {
        return null;
    }

    activeNodeType.value = nodeName;
    const domNode = editor.view.nodeDOM(selection.from);

    if (domNode instanceof HTMLImageElement || domNode instanceof HTMLVideoElement) {
        return domNode;
    }

    // ResizableNodeView: domNode — контейнер, ищем элемент внутри
    if (domNode instanceof HTMLElement) {
        return domNode.querySelector(nodeName === 'video' ? 'video' : 'img');
    }

    return null;
}

/**
 * Обновляет позицию попавера относительно выбранного элемента.
 */
function updatePosition(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const popoverWidth = 270;
    popoverTop.value = rect.top - 44;
    popoverLeft.value = rect.left + rect.width / 2 - popoverWidth / 2;
}

/**
 * Устанавливает float-атрибут на медиа-элемент.
 */
function setFloat(value: string | null): void {
    if (!props.editor || !activeNodeType.value) {
        return;
    }

    props.editor.chain().focus().updateAttributes(activeNodeType.value, { float: value }).run();
}

/**
 * Устанавливает vertical-align атрибут на медиа-элемент.
 */
function setVerticalAlign(value: string | null): void {
    if (!props.editor || !activeNodeType.value) {
        return;
    }

    props.editor
        .chain()
        .focus()
        .updateAttributes(activeNodeType.value, { verticalAlign: value })
        .run();
}

/**
 * Парсит строку вида "10rem" в число и единицу.
 */
function parseCustomDimension(value: string): { value: number; unit: TSizeUnit } | null {
    const match = value.match(/^(\d+(?:\.\d+)?)(rem|em|%|px)$/);
    if (!match) {
        return null;
    }
    return { value: parseFloat(match[1]), unit: match[2] as TSizeUnit };
}

/**
 * Читает текущие размеры из атрибутов выбранного нода.
 */
function readCurrentSize(): void {
    if (!props.editor || !activeNodeType.value) {
        return;
    }

    const attrs = props.editor.getAttributes(activeNodeType.value);

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
    if (!props.editor || !activeNodeType.value) {
        return PX_PER_EM;
    }

    const mediaEl = findSelectedMediaElement(props.editor);
    if (!mediaEl) {
        return PX_PER_EM;
    }

    return parseFloat(getComputedStyle(mediaEl).fontSize) || PX_PER_EM;
}

/**
 * Конвертирует значение в пиксели для ResizableNodeView.
 * Для em использует реальный computed font-size элемента.
 */
function convertToPx(value: number, unit: TSizeUnit): number {
    switch (unit) {
        case 'rem':
            return Math.round(value * PX_PER_REM);
        case 'em':
            return Math.round(value * getEmPixelSize());
        default:
            return 0;
    }
}

/**
 * Конвертирует значение между единицами измерения.
 */
function convertBetweenUnits(value: number, from: TSizeUnit, to: TSizeUnit): number {
    if (from === '%' || to === '%') {
        return value;
    }

    const emPx = getEmPixelSize();
    const pxMap: Record<string, number> = { px: 1, rem: PX_PER_REM, em: emPx };
    const px = value * (pxMap[from] ?? 1);
    return px / (pxMap[to] ?? 1);
}

/**
 * Округляет число до заданного количества знаков после запятой.
 */
function roundDecimal(value: number, decimals: number): number {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}

/**
 * Возвращает текущее соотношение сторон (width/height) выбранного медиа.
 */
function getCurrentAspectRatio(): number | null {
    if (!props.editor || !activeNodeType.value) {
        return null;
    }
    const attrs = props.editor.getAttributes(activeNodeType.value);
    if (!attrs.width || !attrs.height) {
        return null;
    }
    return attrs.width / attrs.height;
}

/**
 * Применяет текущие значения размеров к атрибутам нода.
 */
function applySize(): void {
    if (!props.editor || !activeNodeType.value) {
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
            const pxEquiv = convertToPx(w, unit);
            if (pxEquiv > 0) {
                attrs.width = pxEquiv;
            }
        } else {
            attrs.customWidth = null;
        }

        if (!isNaN(h) && h > 0) {
            attrs.customHeight = `${h}${unit}`;
            const pxEquiv = convertToPx(h, unit);
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
        .updateAttributes(activeNodeType.value, attrs)
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
    if (props.editor && activeNodeType.value) {
        const attrs = props.editor.getAttributes(activeNodeType.value);
        const pxW = Number(attrs.width);
        const pxH = Number(attrs.height);

        if (pxW > 0) {
            sizeWidth.value = String(roundDecimal(convertFromPx(pxW, newUnit), 2));
        }
        if (pxH > 0) {
            sizeHeight.value = String(roundDecimal(convertFromPx(pxH, newUnit), 2));
        }
    }

    sizeUnit.value = newUnit;
    applySize();
}

/**
 * Конвертирует значение из пикселей в заданную единицу.
 */
function convertFromPx(px: number, unit: TSizeUnit): number {
    switch (unit) {
        case 'px':
            return px;
        case 'rem':
            return px / PX_PER_REM;
        case 'em':
            return px / getEmPixelSize();
        case '%':
            return px;
        default:
            return px;
    }
}

/**
 * Открывает/закрывает панель размеров.
 */
function toggleSizePanel(): void {
    showSizePanel.value = !showSizePanel.value;
    if (showSizePanel.value) {
        readCurrentSize();
    }
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
watchEffect((onCleanup) => {
    const editor = props.editor;

    if (!editor) {
        isVisible.value = false;
        return;
    }

    /**
     * Обработчик транзакций — проверяет, выбран ли медиа-нод.
     */
    function handleTransaction(): void {
        if (!editor) {
            return;
        }

        const isMediaActive = editor.isActive('image') || editor.isActive('video');

        if (!isMediaActive) {
            isVisible.value = false;
            showSizePanel.value = false;
            return;
        }

        const mediaEl = findSelectedMediaElement(editor);

        if (!mediaEl) {
            isVisible.value = false;
            showSizePanel.value = false;
            return;
        }

        const nodeType = activeNodeType.value;

        // Определяем текущий float
        if (editor.isActive(nodeType!, { float: 'left' })) {
            currentFloat.value = 'left';
        } else if (editor.isActive(nodeType!, { float: 'right' })) {
            currentFloat.value = 'right';
        } else {
            currentFloat.value = null;
        }

        // Определяем текущий verticalAlign
        if (editor.isActive(nodeType!, { verticalAlign: 'baseline' })) {
            currentVerticalAlign.value = 'baseline';
        } else if (editor.isActive(nodeType!, { verticalAlign: 'middle' })) {
            currentVerticalAlign.value = 'middle';
        } else if (editor.isActive(nodeType!, { verticalAlign: 'top' })) {
            currentVerticalAlign.value = 'top';
        } else {
            currentVerticalAlign.value = null;
        }

        updatePosition(mediaEl);
        isVisible.value = true;
    }

    // Начальная проверка
    handleTransaction();

    editor.on('transaction', handleTransaction);

    onCleanup(() => {
        editor.off('transaction', handleTransaction);
    });
});

onBeforeUnmount(() => {
    isVisible.value = false;
    showSizePanel.value = false;
});
// #endregion
</script>

<template>
    <Teleport to="body">
        <Transition name="fade">
            <div
                v-if="isVisible"
                :class="$style.TextEditorImageFloatPopover"
                :style="{ top: `${popoverTop}px`, left: `${popoverLeft}px` }"
            >
                <!-- Float controls -->
                <BricksTooltip top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[$style.button, { [$style._active]: currentFloat === 'left' }]"
                            @mousedown.prevent="setFloat('left')"
                        >
                            <BricksIcon icon="bs:text-indent-left" />
                        </button>
                    </template>
                    <BricksTooltipHint text="Обтекание слева" />
                </BricksTooltip>

                <BricksTooltip top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[$style.button, { [$style._active]: currentFloat === 'right' }]"
                            @mousedown.prevent="setFloat('right')"
                        >
                            <BricksIcon icon="bs:text-indent-right" />
                        </button>
                    </template>
                    <BricksTooltipHint text="Обтекание справа" />
                </BricksTooltip>

                <BricksTooltip top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[$style.button, { [$style._active]: currentFloat === null }]"
                            @mousedown.prevent="setFloat(null)"
                        >
                            <BricksIcon icon="ph:x" />
                        </button>
                    </template>
                    <BricksTooltipHint text="Без обтекания" />
                </BricksTooltip>

                <!-- Vertical align controls -->
                <div :class="$style.separator" />
                <BricksTooltip v-for="option in VALIGN_OPTIONS" :key="option.value" top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[
                                $style.button,
                                {
                                    [$style._active]: currentVerticalAlign === option.value,
                                },
                            ]"
                            @mousedown.prevent="setVerticalAlign(option.value)"
                        >
                            <BricksIcon :icon="option.icon" />
                        </button>
                    </template>
                    <BricksTooltipHint :text="option.label" />
                </BricksTooltip>

                <!-- Size toggle -->
                <div :class="$style.separator" />
                <BricksTooltip top>
                    <template #activator>
                        <button
                            type="button"
                            :class="[$style.button, { [$style._active]: showSizePanel }]"
                            @mousedown.prevent="toggleSizePanel"
                        >
                            <BricksIcon icon="ph:arrows-out" />
                        </button>
                    </template>
                    <BricksTooltipHint text="Размер" />
                </BricksTooltip>

                <!-- Size panel dropdown -->
                <div v-if="showSizePanel" :class="$style.sizePanel" @mousedown.stop @click.stop>
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
                                    :class="[
                                        $style.lockButton,
                                        { [$style._locked]: lockAspectRatio },
                                    ]"
                                    @mousedown.prevent="lockAspectRatio = !lockAspectRatio"
                                >
                                    <BricksIcon
                                        :icon="lockAspectRatio ? 'ph:link' : 'ph:link-break'"
                                    />
                                </button>
                            </template>
                            <BricksTooltipHint
                                :text="
                                    lockAspectRatio
                                        ? 'Пропорции сохраняются'
                                        : 'Свободное изменение'
                                "
                            />
                        </BricksTooltip>

                        <button
                            type="button"
                            :class="$style.unitButton"
                            @mousedown.prevent="cycleUnit"
                        >
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
            </div>
        </Transition>
    </Teleport>
</template>

<style module lang="scss">
.TextEditorImageFloatPopover {
    position: fixed;
    z-index: 10001;
    display: flex;
    gap: 0.2rem;
    padding: 0.4rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    box-shadow: var(--shadow-sm);
}

.button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--border-radius-xs);
    border: none;
    background: transparent;
    color: var(--bricks-base-600);
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
    cursor: pointer;

    svg {
        width: 1.6rem;
        height: 1.6rem;
    }

    &:hover {
        background-color: var(--bricks-base-100);
        color: var(--bricks-base-900);
    }

    &._active {
        background-color: var(--bricks-primary-100);
        color: var(--bricks-primary);
    }
}

.separator {
    width: 1px;
    margin: 0.4rem 0.2rem;
    background: var(--bricks-base-200);
}

.sizePanel {
    position: absolute;
    top: calc(100% + 0.4rem);
    right: 0;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.8rem;
    background: var(--bricks-base-0);
    border: 1px solid var(--bricks-base-200);
    border-radius: var(--border-radius-sm);
    box-shadow: var(--shadow-sm);
}

.sizeRow {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.sizeLabel {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--bricks-base-500);
    width: 1.6rem;
    text-align: center;
    user-select: none;
}

.sizeInput {
    width: 7rem;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--bricks-base-200);
    border-radius: var(--border-radius-xs);
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-base-900);
    background: var(--bricks-base-0);
    outline: none;

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
    border: none;
    border-radius: var(--border-radius-xs);
    background: transparent;
    color: var(--bricks-base-400);
    cursor: pointer;
    transition:
        background-color var(--default-transition),
        color var(--default-transition);

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
    border: 1px solid var(--bricks-base-200);
    border-radius: var(--border-radius-xs);
    background: var(--bricks-base-50);
    color: var(--bricks-base-600);
    font-size: 1.1rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--default-transition);

    &:hover {
        background: var(--bricks-base-100);
    }
}
</style>
