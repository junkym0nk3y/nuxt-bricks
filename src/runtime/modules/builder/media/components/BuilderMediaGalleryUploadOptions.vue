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
import type { IMediaMaxWidthBounds } from '../../../common/types/media';

// Utils
import {
    MEDIA_QUALITY_MAX,
    MEDIA_QUALITY_MIN,
    resolveMediaMaxWidthBounds,
} from '../../../common/constants/mediaOptimization';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksCheckbox from '../../../ui/base/checkbox/BricksCheckbox.vue';
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
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
/**
 * Границы поля ширины считаются от НЕИЗМЕННОГО значения конфига, а не от
 * текущего в поле: иначе верхняя граница убегала бы вслед за вводом и не
 * ограничивала бы ничего.
 */
const maxWidthBounds = computed<IMediaMaxWidthBounds>(() =>
    resolveMediaMaxWidthBounds(props.configuredMaxWidth)
);
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
 * Читает число из поля ввода; пустое и нечисловое оставляют прежнее — иначе
 * стирание поля обнуляло бы качество.
 *
 * Границы и округление намеренно НЕ применяются. Значение контролируемое:
 * `BricksInput` синхронизирует поле из пропа, поэтому кламп на каждый символ
 * подменял набираемое — «1» становилось минимумом, а следующая цифра
 * дописывалась уже к нему («1», «9», «2», «0» давали 16 → 169 → 1692 → 8000).
 * Границы остаются за blur'ом самого поля и за сервером, а дробное значение —
 * промежуточное состояние ввода, и округлять его до потери фокуса нечего.
 *
 * @param raw - Строка из поля.
 * @param fallback - Прежнее значение.
 * @returns Введённое число либо прежнее значение.
 */
function parseFieldNumber(raw: string, fallback: number): number {
    const trimmed = raw.trim();

    if (!trimmed) {
        return fallback;
    }

    const parsed = Number(trimmed);

    return Number.isFinite(parsed) ? parsed : fallback;
}

/** Обрабатывает ввод качества. */
function handleQualityChange(value: string): void {
    emitPatch({ quality: parseFieldNumber(value, props.optimization.quality) });
}

/** Обрабатывает ввод максимальной ширины. */
function handleMaxWidthChange(value: string): void {
    emitPatch({ maxWidth: parseFieldNumber(value, props.optimization.maxWidth) });
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
                :aria-label="t('bricks.media.upload.formatLabel')"
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
                :min="maxWidthBounds.min"
                :max="maxWidthBounds.max"
                :disabled="isOriginal"
                @update:value="handleMaxWidthChange"
            />
        </div>

        <BricksCheckbox
            :value="isOriginal"
            :label="t('bricks.media.upload.skipOptimization')"
            @update:value="handleSkipOptimizationChange"
        />

        <BricksFieldHint>
            {{
                isOriginal
                    ? t('bricks.media.upload.skipOptimizationHint')
                    : t('bricks.media.upload.variantsHint')
            }}
        </BricksFieldHint>
    </div>
</template>

<style module lang="scss">
/* Поверхность поповера рисует хозяин поверхности — `PopoverContent` в
   `BuilderMediaGalleryUploadControls`; здесь остаётся раскладка полей. */
.BuilderMediaGalleryUploadOptions {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    width: 28rem;
    padding: 1.6rem;
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
</style>
