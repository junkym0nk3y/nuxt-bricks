<script setup lang="ts">
// #region Imports
// Types
import type { ITextEditorImageFloatPopoverProps } from './types';

// Utils
import { findSelectedMediaNode } from '../utils/selectedMediaNode';

// Vue
import { ref, watchEffect, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksPopoverSurface from '../../ui/base/popover/BricksPopoverSurface.vue';
import BricksTooltip from '../../ui/base/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../ui/base/tooltip/BricksTooltipHint.vue';
import TextEditorImageSizePanel from './TextEditorImageSizePanel.vue';
// #endregion

// #region Props
const props = defineProps<ITextEditorImageFloatPopoverProps>();
// #endregion

// #region Data
const { t } = useI18n();

const VALIGN_OPTIONS = [
    { value: 'baseline', icon: 'md:vertical-align-bottom', label: 'Baseline' },
    { value: 'middle', icon: 'md:vertical-align-center', label: 'bricks.textEditor.alignMiddle' },
    { value: 'top', icon: 'md:vertical-align-top', label: 'bricks.textEditor.alignTop' },
] as const;
const POPOVER_WIDTH = 270;

const isVisible = ref(false);
const popoverTop = ref(0);
const popoverLeft = ref(0);
const currentFloat = ref<string | null>(null);
const currentVerticalAlign = ref<string | null>(null);
const activeNodeType = ref<string | null>(null);
const showSizePanel = ref(false);
// #endregion

// #region Methods
/**
 * Обновляет позицию попавера относительно выбранного элемента.
 */
function updatePosition(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    popoverTop.value = rect.top - 44;
    popoverLeft.value = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
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
 * Открывает/закрывает панель размеров (панель читает размеры при монтировании).
 */
function toggleSizePanel(): void {
    showSizePanel.value = !showSizePanel.value;
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

        const media = findSelectedMediaNode(editor);

        if (!media) {
            isVisible.value = false;
            showSizePanel.value = false;
            return;
        }

        activeNodeType.value = media.nodeName;
        const nodeType = media.nodeName;

        // Определяем текущий float
        if (editor.isActive(nodeType, { float: 'left' })) {
            currentFloat.value = 'left';
        } else if (editor.isActive(nodeType, { float: 'right' })) {
            currentFloat.value = 'right';
        } else {
            currentFloat.value = null;
        }

        // Определяем текущий verticalAlign
        if (editor.isActive(nodeType, { verticalAlign: 'baseline' })) {
            currentVerticalAlign.value = 'baseline';
        } else if (editor.isActive(nodeType, { verticalAlign: 'middle' })) {
            currentVerticalAlign.value = 'middle';
        } else if (editor.isActive(nodeType, { verticalAlign: 'top' })) {
            currentVerticalAlign.value = 'top';
        } else {
            currentVerticalAlign.value = null;
        }

        updatePosition(media.element);
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
            <BricksPopoverSurface
                v-if="isVisible"
                density="compact"
                elevation="sm"
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
                    <BricksTooltipHint :text="t('bricks.textEditor.floatLeft')" />
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
                    <BricksTooltipHint :text="t('bricks.textEditor.floatRight')" />
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
                    <BricksTooltipHint :text="t('bricks.textEditor.floatNone')" />
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
                    <BricksTooltipHint
                        :text="option.value === 'baseline' ? option.label : t(option.label)"
                    />
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
                    <BricksTooltipHint :text="t('bricks.textEditor.size')" />
                </BricksTooltip>

                <!-- Size panel dropdown -->
                <TextEditorImageSizePanel
                    v-if="showSizePanel"
                    :editor="props.editor"
                    :active-node-type="activeNodeType"
                />
            </BricksPopoverSurface>
        </Transition>
    </Teleport>
</template>

<style module lang="scss">
.TextEditorImageFloatPopover {
    position: fixed;
    display: flex;
    gap: 0.2rem;
}

.button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    color: var(--bricks-base-600);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
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
</style>
