<script setup lang="ts">
// #region Imports
// Types
import type { IInlineContentSegment } from '../../../../../common/types/content';

// Vue
import { computed, useCssModule } from 'vue';

// Components
import BricksButton from '../../../../../ui/base/button/BricksButton.vue';
import BricksInput from '../../../../../ui/inputs/BricksInput.vue';
import BricksHexInput from '../../../../../ui/inputs/BricksHexInput.vue';

// Utils
import {
    cloneInlineSegments,
    createInlineTextSegment,
    createInlineLineBreakSegment,
} from '../../../../../layouts-blocks/utils/inlineContent';
// #endregion

// #region Interfaces
interface IPropertyInlineContentEditorProps {
    modelValue?: IInlineContentSegment[];
}

interface IPropertyInlineContentEditorEmits {
    'update:modelValue': [value: IInlineContentSegment[]];
    openGallery: [
        {
            action: 'append' | 'replace';
            segmentIndex?: number;
            insertIndex?: number;
        },
    ];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IPropertyInlineContentEditorProps>(), {
    modelValue: () => [],
});
// #endregion

// #region Emits
const emit = defineEmits<IPropertyInlineContentEditorEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const segments = computed<IInlineContentSegment[]>(() => props.modelValue || []);
const hasSegments = computed<boolean>(() => segments.value.length > 0);
// #endregion

// #region Methods
/**
 * Эмитит новое значение сегментов.
 *
 * @param value - Обновлённый список сегментов.
 */
function updateSegments(value: IInlineContentSegment[]): void {
    emit('update:modelValue', value);
}

/**
 * Добавляет текстовый сегмент.
 */
function handleAddTextSegment(): void {
    const next = [...segments.value, createInlineTextSegment('Новый текст')];
    updateSegments(next);
}

/**
 * Запрашивает добавление медиа-сегмента через галерею.
 */
function handleAddMediaSegment(): void {
    emit('openGallery', {
        action: 'append',
        insertIndex: segments.value.length,
    });
}

/**
 * Добавляет сегмент переноса строки.
 */
function handleAddLineBreakSegment(): void {
    const next = [...segments.value, createInlineLineBreakSegment()];
    updateSegments(next);
}

/**
 * Обновляет текст конкретного сегмента.
 *
 * @param index - Индекс сегмента.
 * @param value - Новое значение текста.
 */
function handleTextChange(index: number, value: string): void {
    const next = cloneInlineSegments(segments.value);
    if (!next[index]) {
        return;
    }

    next[index] = {
        ...next[index],
        text: value,
    };
    updateSegments(next);
}

/**
 * Обновляет атрибут сегмента.
 *
 * @param index - Индекс сегмента.
 * @param patch - Изменения свойств.
 */
function patchSegment(index: number, patch: Partial<IInlineContentSegment>): void {
    const next = cloneInlineSegments(segments.value);
    if (!next[index]) {
        return;
    }

    next[index] = {
        ...next[index],
        ...patch,
    };
    updateSegments(next);
}

/**
 * Удаляет сегмент из списка.
 *
 * @param index - Индекс удаляемого сегмента.
 */
function handleRemoveSegment(index: number): void {
    const next = cloneInlineSegments(segments.value);
    next.splice(index, 1);
    updateSegments(next);
}

/**
 * Перемещает сегмент вверх или вниз.
 *
 * @param index - Индекс сегмента.
 * @param direction - Направление перемещения.
 */
function handleMoveSegment(index: number, direction: 'up' | 'down'): void {
    const next = cloneInlineSegments(segments.value);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= next.length) {
        return;
    }

    const [segment] = next.splice(index, 1);
    next.splice(targetIndex, 0, segment);
    updateSegments(next);
}

/**
 * Отправляет запрос на замену медиа-файла сегмента.
 *
 * @param index - Индекс сегмента.
 */
function handleReplaceMedia(index: number): void {
    emit('openGallery', {
        action: 'replace',
        segmentIndex: index,
    });
}

/**
 * Форматирует размер для отображения.
 *
 * @param value - Значение ширины/высоты.
 * @returns Строка для инпута.
 */
function formatDimensionValue(value?: string | number): string {
    if (typeof value === 'number') {
        return value.toString();
    }
    return value || '';
}

// #endregion
</script>

<template>
    <div :class="$style.PropertyInlineContentEditor">
        <div :class="$style.header">
            <div :class="$style.headerActions">
                <BricksButton size="sm" variant="secondary" @click="handleAddTextSegment">
                    Текст
                </BricksButton>
                <BricksButton size="sm" variant="secondary" @click="handleAddLineBreakSegment">
                    Перенос
                </BricksButton>
                <BricksButton size="sm" variant="primary" @click="handleAddMediaSegment">
                    Медиа
                </BricksButton>
            </div>
        </div>

        <div v-if="hasSegments" :class="$style.segmentList">
            <div
                v-for="(segment, index) in segments"
                :key="segment.id || `${segment.kind}_${index}`"
                :class="$style.segmentItem"
            >
                <div :class="$style.segmentHeader">
                    <div :class="$style.segmentToolbar">
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            :disabled="index === 0"
                            @click="handleMoveSegment(index, 'up')"
                        >
                            <BricksIcon icon="md:arrow-up" />
                        </BricksButton>
                        <BricksButton
                            size="sm"
                            variant="ghost"
                            :disabled="index === segments.length - 1"
                            @click="handleMoveSegment(index, 'down')"
                        >
                            <BricksIcon icon="md:arrow-down" />
                        </BricksButton>
                        <BricksButton size="sm" variant="ghost" @click="handleRemoveSegment(index)">
                            <BricksIcon icon="md:delete-outline" />
                        </BricksButton>
                    </div>
                </div>

                <div v-if="segment.kind === 'text'" :class="$style.segmentBody">
                    <BricksInput
                        :value="segment.text || ''"
                        placeholder="Введите текст"
                        @update:value="handleTextChange(index, $event as string)"
                    />
                </div>
                <div
                    v-else-if="segment.kind === 'line-break'"
                    :class="[$style.segmentBody, $style.lineBreakBody]"
                >
                    <p :class="$style.lineBreakHint">
                        Текст после этого сегмента будет начинаться с новой строки.
                    </p>
                </div>

                <div v-else :class="$style.segmentBody">
                    <div :class="$style.mediaPreview">
                        <img
                            v-if="segment.kind === 'image'"
                            :src="segment.url"
                            alt=""
                            :class="$style.previewImage"
                        />
                        <div v-else :class="$style.previewSvg" v-html="segment.svgContent || ''" />
                    </div>
                    <div :class="$style.mediaActions">
                        <BricksButton size="sm" variant="ghost" @click="handleReplaceMedia(index)">
                            <BricksIcon icon="md:folder-edit" />
                            Заменить медиа
                        </BricksButton>
                    </div>

                    <div :class="$style.inputsRow">
                        <BricksInput
                            :value="formatDimensionValue(segment.width)"
                            label="Ширина"
                            @update:value="patchSegment(index, { width: $event as string })"
                        />
                        <BricksInput
                            :value="formatDimensionValue(segment.height)"
                            label="Высота"
                            @update:value="patchSegment(index, { height: $event as string })"
                        />
                    </div>

                    <div v-if="segment.kind === 'svg'" :class="$style.inputsRow">
                        <BricksHexInput
                            :value="segment.color || ''"
                            label="Цвет SVG"
                            @update:value="patchSegment(index, { color: $event as string })"
                        />
                    </div>
                </div>
            </div>
        </div>

        <div v-else :class="$style.emptyState">
            <BricksIcon :class="$style.emptyIcon" icon="md:text-box-outline" />
            <p>Добавьте текст или медиа, чтобы собрать сложный заголовок</p>
        </div>
    </div>
</template>

<style module lang="scss">
.PropertyInlineContentEditor {
    display: flex;
    padding: 1.2rem;
    border-radius: 0.8rem;
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-50);
    flex-direction: column;
    gap: 1.6rem;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-around;
    gap: 1rem;
}

.title {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-800);
}

.headerActions {
    display: flex;
    gap: 0.8rem;
}

.segmentList {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.segmentItem {
    padding: 1.2rem;
    border-radius: 0.6rem;
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.segmentHeader {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
}

.segmentToolbar {
    display: flex;
    gap: 0.4rem;
}

.segmentBody {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.lineBreakBody {
    align-items: flex-start;
    gap: 0.6rem;
}

.lineBreakLabel {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.8rem;
    border-radius: 0.4rem;
    background: var(--bricks-base-100);
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--bricks-base-700);
}

.lineBreakHint {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.mediaPreview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 10rem;
    padding: 1rem;
    border-radius: 0.6rem;
    border: 1px dashed var(--bricks-base-300);
    background: var(--bricks-base-50);
}

.previewImage {
    display: block;
    max-width: 100%;
    max-height: 16rem;
    object-fit: contain;
}

.previewSvg {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;

    :global(svg) {
        width: 6rem;
        height: 6rem;
    }
}

.mediaActions {
    display: flex;
    justify-content: flex-start;
}

.inputsRow {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
}

.emptyState {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    border-radius: 0.6rem;
    border: 1px dashed var(--bricks-base-300);
    text-align: center;
    color: var(--bricks-base-600);
    flex-direction: column;
    gap: 0.8rem;
}

.emptyIcon {
    font-size: 3.2rem;
    color: var(--bricks-base-400);
}
</style>
