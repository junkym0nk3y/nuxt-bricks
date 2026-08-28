<script setup lang="ts">
/**
 * @description Media picker of a property: a preview of the picked image or video, the
 * buttons that open the gallery and clear the choice, and the address of the file.
 *
 * Under the media itself the preview lays a checkerboard rather than a flat ground.
 * The picker holds nothing but a URL — it knows neither the MIME type nor whether the
 * picture has an alpha channel — and the library accepts transparent PNG, WebP and
 * sanitized SVG alike. Any single ground therefore hides a class of files: the light
 * one the picker used to pin lost white logos, and a dark one following the theme
 * would lose black ones instead. The squares are built from the static white and the
 * dark surface, the two tones that do not turn over with the theme, so the same file
 * reads the same way in both. Everything around the media — the frame and the empty
 * state — follows the theme like the rest of the sidebar chrome.
 */

// #region Imports
// Types
import type { IPropertyMediaPickerProps, IPropertyMediaPickerEmits } from './types';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
// The caption defaults to empty rather than to a word: `withDefaults` is compiled
// into the props options, where the translator does not exist yet — so the fallback
// is resolved by a computed below
const props = withDefaults(defineProps<IPropertyMediaPickerProps>(), {
    modelValue: '',
    label: '',
    type: 'image',
});
// #endregion

// #region Emits
const emit = defineEmits<IPropertyMediaPickerEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// #endregion

// #region Computed
/** Caption of the field: the one passed in, or the generic name of the editor */
const resolvedLabel = computed(() => props.label || t('bricks.properties.mediaPicker.label'));

const hasMedia = computed(() => Boolean(props.modelValue));
const mediaType = computed(() => props.type);
const previewIcon = computed(() =>
    props.type === 'video' ? 'ta:outline-video' : 'ta:outline-photo'
);
// #endregion

// #region Methods
/**
 * Opens media gallery modal
 */
function handleOpenGallery(): void {
    emit('openGallery');
}

/**
 * Removes selected media
 */
function handleRemove(): void {
    emit('update:modelValue', '');
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderShellSidebarPropertyMediaPicker">
        <label :class="$style.label">{{ resolvedLabel }}</label>

        <div :class="[$style.preview, { [$style._checkered]: hasMedia }]">
            <img
                v-if="hasMedia && mediaType === 'image'"
                :src="props.modelValue"
                :class="$style.previewImage"
                :alt="t('bricks.properties.mediaPicker.previewAlt')"
                loading="lazy"
                decoding="async"
            />

            <video
                v-else-if="hasMedia && mediaType === 'video'"
                :src="props.modelValue"
                :class="$style.previewImage"
                muted
                playsinline
            />

            <div v-else :class="$style.previewEmpty">
                <BricksIcon :class="$style.previewIcon" :icon="previewIcon" />
            </div>
        </div>

        <div :class="$style.actions">
            <BricksButton
                size="sm"
                variant="primary"
                :class="$style.button"
                @click="handleOpenGallery"
            >
                <BricksIcon icon="ta:outline-folder-open" />
                {{ t('bricks.properties.select') }}
            </BricksButton>

            <BricksButton
                v-if="hasMedia"
                size="sm"
                variant="danger"
                :class="$style.button"
                @click="handleRemove"
            >
                <BricksIcon icon="ta:outline-trash" />
                {{ t('bricks.common.delete') }}
            </BricksButton>
        </div>

        <div v-if="hasMedia" :class="$style.urlDisplay">
            <span :class="$style.url">{{ props.modelValue }}</span>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderShellSidebarPropertyMediaPicker {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.label {
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.preview {
    overflow: hidden;
    width: 100%;
    height: 16rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-300);
    background: var(--bricks-base-50);

    &._checkered {
        background-color: var(--bricks-static-white);
        background-image:
            linear-gradient(
                45deg,
                color-mix(in srgb, var(--bricks-dark-surface) 12%, transparent) 25%,
                transparent 25%
            ),
            linear-gradient(
                -45deg,
                color-mix(in srgb, var(--bricks-dark-surface) 12%, transparent) 25%,
                transparent 25%
            ),
            linear-gradient(
                45deg,
                transparent 75%,
                color-mix(in srgb, var(--bricks-dark-surface) 12%, transparent) 75%
            ),
            linear-gradient(
                -45deg,
                transparent 75%,
                color-mix(in srgb, var(--bricks-dark-surface) 12%, transparent) 75%
            );
        background-position:
            0 0,
            0 0.8rem,
            0.8rem -0.8rem,
            -0.8rem 0;
        background-size: 1.6rem 1.6rem;
    }
}

.previewImage {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.previewEmpty {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

.previewIcon {
    font-size: 4.8rem;
    color: var(--bricks-base-300);
}

.actions {
    display: flex;
    gap: 0.8rem;
}

.button {
    flex: 1;
}

.urlDisplay {
    overflow: hidden;
    padding: 0.8rem;
    border-radius: 0.4rem;
    background: var(--bricks-base-100);
}

.url {
    overflow: hidden;
    display: block;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: monospace;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}
</style>
