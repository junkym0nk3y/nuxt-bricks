<script setup lang="ts">
/**
 * @description The entry point of the upload in the header of the gallery: the
 * "Upload" button, the hidden file input and the popover of the optimization
 * parameters.
 *
 * The modal has no permanent upload zone. A full-width band took up the top of the
 * content and could not hold its own height: flex squeezed it under a filled grid, and
 * `overflow: hidden` silently cut the hint off. What shows instead is the drop
 * target, exactly when the files are already over the window (the overlay), plus the
 * target tile standing as the first cell of the grid.
 *
 * The progress sits where the caption of the button is: there is no separate band any
 * more, and it is counted in the files of a set, because the sending is one request per
 * file and has no byte progress to it.
 *
 * The button does not go out while an upload runs, it only changes its caption for a
 * counter: the queue is built for sets added as it goes (one worker for all of them),
 * and the target tile along with the drag kept taking files the whole while — one
 * button going out meant three ways into the same upload living by different rules.
 *
 * Decisions held by the style section: the button is given an explicit height of
 * `3.6rem`, exactly the height of the search field. The `md` buttons of the kit come to
 * 39 (1rem of padding + a 1.2 × 1.4rem line + the border) and `BricksInput` comes to 36,
 * and in one row that difference read as a button gone askew. The `height` rather than
 * the paddings: the kit declares those on `.button._md`, two classes, which outweighs
 * the single class of the caller — whereas `height` it does not declare at all, so
 * there is nothing to outweigh.
 */

// #region Imports
// Types
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type {
    IMediaGalleryUploadControlsProps,
    IMediaGalleryUploadControlsEmits,
} from '../types/media';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksTooltip from '../../../ui/base/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/base/tooltip/BricksTooltipHint.vue';
import BuilderMediaGalleryUploadOptionsPopover from './BuilderMediaGalleryUploadOptionsPopover.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryUploadControlsProps>(), {
    showOptions: true,
    dropHint: '',
});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryUploadControlsEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const fileInputRef = ref<HTMLInputElement | null>(null);
// #endregion

// #region Computed
const buttonLabel = computed<string>(() => {
    const progress = props.uploadProgress;

    if (!progress) {
        return t('bricks.media.uploadFiles');
    }

    return t('bricks.media.upload.progressShort', {
        current: progress.current,
        total: progress.total,
    });
});
/**
 * The tooltip of the button: where a file may be dropped, plus the size limits. The
 * area of the target is the caller's to set — in the modal it is the window, in the
 * dashboard section only the body of the section, and one shared text would promise
 * acceptance where there is none.
 */
const tooltipText = computed<string>(() => {
    const dropHint = props.dropHint || t('bricks.media.dropAnywhereHint');
    const sizeHint = t('bricks.media.sizeHint', {
        image: props.maxImageSizeMb,
        video: props.maxVideoSizeMb,
    });

    return `${dropHint} · ${sizeHint}`;
});
// #endregion

// #region Methods
/** Opens the system file picker */
function handleOpenFilePicker(): void {
    fileInputRef.value?.click();
}

/**
 * Hands the picked files upward.
 *
 * The value of the input is cleared right away: without that, picking the same file a
 * second time would raise no `change`, and the second attempt at an upload would look
 * like a refusal.
 *
 * @param event - The change event of the native input.
 */
function handleFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) {
        return;
    }

    emit('upload', Array.from(files));
    input.value = '';
}

/**
 * Passes the changed parameters upward.
 *
 * @param value - The new optimization parameters.
 */
function handleOptimizationChange(value: IBricksMediaOptimization): void {
    emit('update:optimization', value);
}

// The target tile of the grid opens this very picker — the reason is at the
// `request-upload` emit in `types/media.d.ts`
defineExpose({ openFilePicker: handleOpenFilePicker });
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryUploadControls">
        <input
            ref="fileInputRef"
            type="file"
            accept="image/*,video/*"
            multiple
            :aria-label="t('bricks.media.fileInputLabel')"
            :class="$style.fileInput"
            @change="handleFileChange"
        />

        <BricksTooltip>
            <template #activator>
                <BricksButton
                    :class="$style.uploadButton"
                    size="md"
                    variant="primary"
                    @click="handleOpenFilePicker"
                >
                    {{ buttonLabel }}
                </BricksButton>
            </template>

            <template #default>
                <BricksTooltipHint :text="tooltipText" />
            </template>
        </BricksTooltip>

        <BuilderMediaGalleryUploadOptionsPopover
            v-if="props.showOptions"
            :optimization="props.optimization"
            :configured-max-width="props.configuredMaxWidth"
            tooltip-side="bottom"
            @update:optimization="handleOptimizationChange"
        />
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryUploadControls {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.uploadButton {
    height: 3.6rem;
}

.fileInput {
    position: absolute;
    width: 0;
    height: 0;
    opacity: 0;
    pointer-events: none;
}
</style>
