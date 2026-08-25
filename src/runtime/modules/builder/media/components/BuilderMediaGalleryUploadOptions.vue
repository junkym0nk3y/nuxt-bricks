<script setup lang="ts">
/**
 * @description The content of the upload parameters popover: the format, the quality,
 * the maximum width and "upload with no optimization".
 *
 * There is no "Apply" button: the parameters take effect on the next upload, and the
 * popover is closed by a click outside it. The defaults arrive from
 * `bricks.media.optimization` — the popover only overrides them and writes nothing back
 * into the config.
 *
 * "Upload with no optimization" is not a flag of its own but the very same
 * `format: 'original'`: two sources of one state would drift apart. Hence the checkbox
 * and the format selector are tied together, and the quality with the width go out
 * under "Original" — they affect nothing there, but they stay visible so that their
 * values have somewhere to be read.
 *
 * The kit holds no slider, and setting one up for the sake of two fields is not needed:
 * the quality and the width are numeric `BricksInput`s with a stepper.
 *
 * The surface under all of this — the border, the shadow, the layer — is drawn by the
 * owner of the popover, `BuilderMediaGalleryUploadOptionsPopover`; what is left to the
 * style section here is the layout of the fields.
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
 * The bounds of the width field are counted from the value of the config, which does
 * not move, rather than from the one currently in the field: otherwise the upper bound
 * would run away after the typing and would bound nothing at all.
 */
const maxWidthBounds = computed<IMediaMaxWidthBounds>(() =>
    resolveMediaMaxWidthBounds(props.configuredMaxWidth)
);
// #endregion

// #region Methods
/**
 * Hands the changed set of parameters upward whole: the value is a controlled one, and
 * a partial patch would leave the caller to glue the state together itself.
 *
 * @param patch - The changed fields.
 */
function emitPatch(patch: Partial<IMediaGalleryUploadOptionsProps['optimization']>): void {
    emit('update:optimization', { ...props.optimization, ...patch });
}

/** Handles the choice of a format */
function handleFormatChange(value: TBrickDemoValues | null): void {
    if (typeof value !== 'string') {
        return;
    }

    emitPatch({ format: value as TBricksMediaImageFormat });
}

/**
 * Reads a number out of the input field; an empty and a non-numeric one leave the
 * former value in place — otherwise clearing the field would zero the quality out.
 *
 * The bounds and the rounding are deliberately NOT applied. The value is a controlled
 * one: `BricksInput` syncs the field from the prop, so a clamp on every character was
 * substituting what was being typed — "1" became the minimum, and the next digit was
 * then appended to that ("1", "9", "2", "0" gave 16 → 169 → 1692 → 8000). The bounds
 * are left to the field's own blur and to the server, and a fractional value is an
 * intermediate state of the typing — there is nothing to round about it until the focus
 * is gone.
 *
 * @param raw - The string out of the field.
 * @param fallback - The former value.
 * @returns The number that was typed, or the former value.
 */
function parseFieldNumber(raw: string, fallback: number): number {
    const trimmed = raw.trim();

    if (!trimmed) {
        return fallback;
    }

    const parsed = Number(trimmed);

    return Number.isFinite(parsed) ? parsed : fallback;
}

/** Handles the typing of the quality */
function handleQualityChange(value: string): void {
    emitPatch({ quality: parseFieldNumber(value, props.optimization.quality) });
}

/** Handles the typing of the maximum width */
function handleMaxWidthChange(value: string): void {
    emitPatch({ maxWidth: parseFieldNumber(value, props.optimization.maxWidth) });
}

/**
 * Toggles "no optimization". Clearing it takes the format back to webp: taking it back
 * to "the one picked before" is impossible — before the checkbox was ticked that one
 * could have been "Original" itself, and clearing it would then change nothing.
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
    color: var(--bricks-text-muted);
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
