<script setup lang="ts">
/**
 * @description Содержимое поповера параметров загрузки: формат, качество,
 * максимальная ширина и «загружать без оптимизации».
 *
 * Кнопки «Применить» нет: параметры действуют на следующую загрузку, поповер
 * закрывается кликом снаружи. Дефолты приезжают из `bricks.media.optimization` —
 * поповер их только переопределяет и в конфиг обратно ничего не пишет.
 *
 * «Загружать без оптимизации» — не отдельный флаг, а тот же `format: 'original'`:
 * два источника одного состояния разъехались бы. Поэтому чекбокс и селект
 * формата связаны, а качество с шириной при «Оригинале» гаснут — они ни на что
 * не влияют, но остаются видимыми, чтобы значения было где посмотреть.
 *
 * Слайдера в ките нет и заводить его ради двух полей не нужно: качество и ширина
 * — числовые `BricksInput` со степпером.
 */

// #region Imports
// Types
import type { TBricksMediaImageFormat } from '../../../common/types/config';
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type { TBrickDemoValues } from '../../../common/types/index';
import type {
    IMediaGalleryUploadOptionsProps,
    IMediaGalleryUploadOptionsEmits,
} from '../types/media';

// Utils
import {
    MEDIA_MAX_WIDTH_MAX,
    MEDIA_MAX_WIDTH_MIN,
    MEDIA_QUALITY_MAX,
    MEDIA_QUALITY_MIN,
} from '../../../common/constants/mediaOptimization';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksCheckbox from '../../../ui/base/checkbox/BricksCheckbox.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksSelect from '../../../ui/inputs/BricksSelect.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryUploadOptionsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryUploadOptionsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
const formatOptions = computed<IBrickUiCommonProp[]>(() => [
    { label: 'WebP', value: 'webp' },
    { label: t('bricks.media.upload.formatOriginal'), value: 'original' },
]);
const formatFacets = computed<TBrickDemoValues[]>(() =>
    formatOptions.value.map((option) => option.value)
);
const isOriginal = computed<boolean>(() => props.optimization.format === 'original');
// #endregion

// #region Methods
/**
 * Отдаёт наверх изменённый набор параметров целиком: значение контролируемое,
 * частичный патч заставил бы вызывающего склеивать состояние сам.
 *
 * @param patch - Изменённые поля.
 */
function emitPatch(patch: Partial<IMediaGalleryUploadOptionsProps['optimization']>): void {
    emit('update:optimization', { ...props.optimization, ...patch });
}

/** Обрабатывает выбор формата. */
function handleFormatChange(value: TBrickDemoValues | null): void {
    if (typeof value !== 'string') {
        return;
    }

    emitPatch({ format: value as TBricksMediaImageFormat });
}

/**
 * Приводит ввод числового поля к допустимому значению; пустое и нечисловое
 * оставляют прежнее — иначе стирание поля обнуляло бы качество.
 *
 * @param raw - Строка из поля.
 * @param min - Нижняя граница.
 * @param max - Верхняя граница.
 * @param fallback - Прежнее значение.
 */
function clampNumber(raw: string, min: number, max: number, fallback: number): number {
    const parsed = Number(raw);

    if (!Number.isFinite(parsed) || parsed === 0) {
        return fallback;
    }

    return Math.min(Math.max(Math.round(parsed), min), max);
}

/** Обрабатывает ввод качества. */
function handleQualityChange(value: string): void {
    emitPatch({
        quality: clampNumber(
            value,
            MEDIA_QUALITY_MIN,
            MEDIA_QUALITY_MAX,
            props.optimization.quality
        ),
    });
}

/** Обрабатывает ввод максимальной ширины. */
function handleMaxWidthChange(value: string): void {
    emitPatch({
        maxWidth: clampNumber(
            value,
            MEDIA_MAX_WIDTH_MIN,
            MEDIA_MAX_WIDTH_MAX,
            props.optimization.maxWidth
        ),
    });
}

/**
 * Переключает «без оптимизации». Снятие возвращает формат в webp: вернуть
 * «прежний выбранный» нельзя — до включения чекбокса им мог быть и сам
 * «Оригинал», и тогда снятие ничего бы не меняло.
 */
function handleSkipOptimizationChange(value: boolean): void {
    emitPatch({ format: value ? 'original' : 'webp' });
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryUploadOptions">
        <p :class="$style.title">{{ t('bricks.media.upload.optionsTitle') }}</p>

        <div :class="$style.field">
            <span :class="$style.label">{{ t('bricks.media.upload.formatLabel') }}</span>
            <BricksSelect
                :value="props.optimization.format"
                :specs="formatOptions"
                :facets="formatFacets"
                @update:value="handleFormatChange"
            />
        </div>

        <div :class="$style.field">
            <span :class="$style.label">{{ t('bricks.media.upload.qualityLabel') }}</span>
            <BricksInput
                :value="props.optimization.quality"
                type="number"
                :min="MEDIA_QUALITY_MIN"
                :max="MEDIA_QUALITY_MAX"
                :disabled="isOriginal"
                @update:value="handleQualityChange"
            />
        </div>

        <div :class="$style.field">
            <span :class="$style.label">{{ t('bricks.media.upload.maxWidthLabel') }}</span>
            <BricksInput
                :value="props.optimization.maxWidth"
                type="number"
                unit="px"
                :min="MEDIA_MAX_WIDTH_MIN"
                :max="MEDIA_MAX_WIDTH_MAX"
                :disabled="isOriginal"
                @update:value="handleMaxWidthChange"
            />
        </div>

        <BricksCheckbox
            :value="isOriginal"
            :label="t('bricks.media.upload.skipOptimization')"
            @update:value="handleSkipOptimizationChange"
        />

        <p :class="$style.hint">
            {{
                isOriginal
                    ? t('bricks.media.upload.skipOptimizationHint')
                    : t('bricks.media.upload.variantsHint')
            }}
        </p>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryUploadOptions {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    width: 28rem;
    padding: 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.title {
    margin: 0;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-400);
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.label {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.hint {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}
</style>
