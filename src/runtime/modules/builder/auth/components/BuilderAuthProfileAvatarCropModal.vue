<script setup lang="ts">
/**
 * @description Cropping of the profile photo: the picture under a round frame, the zoom
 * on a slider, dragging with the mouse.
 *
 * Cropping is a step of its own rather than a crop by the center: the center of a
 * photograph almost never coincides with a face, and "uploaded and cut by the center"
 * would slice off half of the avatars. The circle is drawn by the interface while a
 * square is what is stored — otherwise the avatar could not be shown in another shape.
 *
 * The upload is carried out by this modal and not by the profile form: the button has
 * to go into the submitting state and hold the modal open until the answer — were it to
 * close earlier, a person would see the previous avatar and decide that "the file is
 * actually the new one already". The submitting state and the text of a failure belong
 * to whoever waits for the answer.
 *
 * The failures come from the server: the client checks only the obvious (a file is
 * selected, the browser decoded it, the picture is not smaller than the minimum frame).
 * The type of the content is confirmed by the signature on the server — anyone can
 * declare `image/png`, while the `accept` of the selection field filters the dialog but
 * not a drag and drop.
 *
 * Decisions held by the style section: the offset of the picture is set by the
 * composable (`imageStyle`) in screen pixels, and the styles only give it its origin —
 * the top left corner of the circle, which is why the picture is shifted off the center
 * by half a diameter; and the darkening around the circle is the spread shadow of the
 * ring itself rather than a stack of layers around it, while the ring stays out of the
 * way of the drag through `pointer-events: none`.
 */

// #region Imports
// Types
import type { IAuthAvatarCropModalProps, IAuthAvatarCropModalEmits } from '../types/auth';

// Utils
import { AUTH_AVATAR_CROP_CIRCLE_PX, AUTH_AVATAR_MIN_CROP_SIDE_PX } from '../utils/avatarCropFrame';
import { resolveAvatarErrorKey } from '../utils/profileErrors';

// Constants
import { BRICKS_AVATAR_MAX_UPLOAD_MB } from '../../../common/constants/auth';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useAuthAvatarCrop } from '../composables/useAuthAvatarCrop';
import { useAuthProfile } from '../composables/useAuthProfile';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';

import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
import BricksSlider from '../../../ui/inputs/BricksSlider.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IAuthAvatarCropModalProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IAuthAvatarCropModalEmits>();
// #endregion

// #region Data
/** Step of the zoom slider: small enough for the frame to move smoothly. */
const ZOOM_STEP = 0.01;

/** Step of moving the frame with the arrows (screen px) and its faster Shift variant. */
const KEYBOARD_STEP_PX = 4;
const KEYBOARD_STEP_LARGE_PX = 24;

/** Directions of the move: the picture is dragged, so the sign is inverse to the arrow. */
const KEYBOARD_SHIFTS: Record<string, { x: number; y: number } | undefined> = {
    ArrowLeft: { x: 1, y: 0 },
    ArrowRight: { x: -1, y: 0 },
    ArrowUp: { x: 0, y: 1 },
    ArrowDown: { x: 0, y: -1 },
};

const { t } = useI18n();
const { uploadAvatar } = useAuthProfile();
const { imageUrl, zoom, maxZoom, imageStyle, frame, isReady, openFile, dragBy, release } =
    useAuthAvatarCrop();

const isSubmitting = ref(false);
const errorMessage = ref('');
/** A drag is under way: id of the pointer, so that fingers on a touch screen do not mix. */
const draggingPointerId = ref<number | null>(null);
let lastPointerX = 0;
let lastPointerY = 0;
// #endregion

// #region Computed
const canSubmit = computed<boolean>(
    () => isReady.value && frame.value !== null && !isSubmitting.value
);

/**
 * Geometry of the circle for the markup, taken from `AUTH_AVATAR_CROP_CIRCLE_PX` — the
 * same constant the arithmetic of the preview counts in. Why the two may not drift
 * apart is written down at the constant.
 */
const stageStyle = computed<Record<string, string>>(() => ({
    '--bricks-crop-circle': `${AUTH_AVATAR_CROP_CIRCLE_PX}px`,
}));
// #endregion

// #region Methods
/**
 * Closes the modal.
 *
 * While the submitting is under way the closing does not go through: the answer has not
 * arrived yet, and a closed modal would show the previous avatar with the edit already
 * applied.
 */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }

    emit('close');
}

/**
 * Starts dragging the picture.
 *
 * Capturing the pointer is mandatory: without it a cursor that has gone past the edge
 * of the stage loses the events, and the picture "sticks" halfway.
 *
 * @param event - Pointer event.
 */
function handlePointerDown(event: PointerEvent): void {
    if (!isReady.value || isSubmitting.value) {
        return;
    }

    draggingPointerId.value = event.pointerId;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

/**
 * Moves the picture under the frame.
 *
 * @param event - Pointer event.
 */
function handlePointerMove(event: PointerEvent): void {
    if (draggingPointerId.value !== event.pointerId) {
        return;
    }

    dragBy(event.clientX - lastPointerX, event.clientY - lastPointerY);
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
}

/**
 * Finishes the dragging.
 *
 * @param event - Pointer event.
 */
function handlePointerUp(event: PointerEvent): void {
    if (draggingPointerId.value !== event.pointerId) {
        return;
    }

    draggingPointerId.value = null;
    (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
}

/**
 * Changes the zoom.
 *
 * @param value - New zoom value.
 */
function handleZoom(value: number): void {
    zoom.value = value;
}

/**
 * Moves the frame with the arrows.
 *
 * Without this the position of the area could only be chosen with a pointer: the zoom
 * is an accessible track, while the moving would stay unreachable from the keyboard —
 * that is, a person could upload a photo but not choose an area within it.
 *
 * @param event - Keyboard event.
 */
function handleKeyDown(event: KeyboardEvent): void {
    if (!isReady.value || isSubmitting.value) {
        return;
    }

    const step = event.shiftKey ? KEYBOARD_STEP_LARGE_PX : KEYBOARD_STEP_PX;
    const shift = KEYBOARD_SHIFTS[event.key];

    if (!shift) {
        return;
    }

    event.preventDefault();
    dragBy(shift.x * step, shift.y * step);
}

/**
 * Uploads the cropped photo.
 */
async function handleSubmit(): Promise<void> {
    const currentFrame = frame.value;

    if (!props.file || !currentFrame || isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    errorMessage.value = '';

    try {
        await uploadAvatar(props.file, currentFrame);
        emit('uploaded');
    } catch (error: unknown) {
        // The size ceiling is passed to every failure: the key is chosen by the
        // status, and checking here which of them actually prints it would mean
        // duplicating the parsing of the error
        errorMessage.value = t(resolveAvatarErrorKey(error), {
            max: BRICKS_AVATAR_MAX_UPLOAD_MB,
        });
        console.error('[Builder] Failed to upload the profile photo:', error);
    } finally {
        isSubmitting.value = false;
    }
}
// #endregion

// #region Lifecycle
// The file is opened on its arrival rather than on the mount: the modal lives together
// with the profile modal and is reused for every new photo
watch(
    () => props.file,
    async (file) => {
        errorMessage.value = '';

        if (!file) {
            release();
            return;
        }

        try {
            await openFile(file);
        } catch (error: unknown) {
            errorMessage.value =
                error instanceof RangeError
                    ? t('bricks.auth.profile.errors.photoTooSmall', {
                          min: AUTH_AVATAR_MIN_CROP_SIDE_PX,
                      })
                    : t('bricks.auth.profile.errors.photoUnreadable');
            console.error('[Builder] Failed to open the selected photo:', error);
        }
    },
    { immediate: true }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.auth.profile.crop.title')"
        layer="nested"
        variant="gradient"
        padded
        @close="handleClose"
        @after-leave="emit('afterLeave')"
    >
        <div :class="$style.BuilderAuthProfileAvatarCropModal">
            <BricksModalHeader :close-disabled="isSubmitting" @close="handleClose" />

            <div :class="$style.body">
                <div
                    :class="$style.stage"
                    :style="stageStyle"
                    tabindex="0"
                    role="application"
                    :aria-label="t('bricks.auth.profile.crop.frameLabel')"
                    @keydown="handleKeyDown"
                    @pointerdown="handlePointerDown"
                    @pointermove="handlePointerMove"
                    @pointerup="handlePointerUp"
                    @pointercancel="handlePointerUp"
                >
                    <img
                        v-if="imageUrl"
                        :src="imageUrl"
                        alt=""
                        :class="$style.photo"
                        :style="imageStyle"
                        draggable="false"
                    />

                    <span :class="$style.mask" aria-hidden="true" />
                </div>

                <div :class="$style.zoom">
                    <span :class="$style.zoomLabel">{{ t('bricks.auth.profile.crop.zoom') }}</span>
                    <BricksSlider
                        :value="zoom"
                        :min="1"
                        :max="maxZoom"
                        :step="ZOOM_STEP"
                        :disabled="!isReady || isSubmitting"
                        :label="t('bricks.auth.profile.crop.zoom')"
                        @update:value="handleZoom"
                    />
                </div>

                <BricksFieldHint>{{ t('bricks.auth.profile.crop.hint') }}</BricksFieldHint>
                <p v-if="errorMessage" :class="$style.error">{{ errorMessage }}</p>
            </div>

            <BricksModalFooter>
                <BricksButton
                    size="md"
                    variant="ghost"
                    type="button"
                    :disabled="isSubmitting"
                    @click="handleClose"
                >
                    {{ t('bricks.common.cancel') }}
                </BricksButton>

                <BricksButton
                    size="md"
                    variant="primary"
                    type="button"
                    :disabled="!canSubmit"
                    @click="handleSubmit"
                >
                    {{ t('bricks.auth.profile.crop.submit') }}
                </BricksButton>
            </BricksModalFooter>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.BuilderAuthProfileAvatarCropModal {
    overflow: hidden;
    display: flex;
    width: 100%;
    max-width: 52rem;
    flex-direction: column;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.body {
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.2rem;
}

.stage {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--bricks-crop-circle);
    height: var(--bricks-crop-circle);
    margin: 0 auto;
    border-radius: var(--bricks-border-radius-sm);
    background: var(--bricks-base-900);
    touch-action: none;
    user-select: none;
    cursor: grab;

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:active {
        cursor: grabbing;
    }
}

.photo {
    position: absolute;
    top: 50%;
    left: 50%;
    display: block;
    max-width: none;
    margin: calc(var(--bricks-crop-circle) / -2) 0 0 calc(var(--bricks-crop-circle) / -2);
}

.mask {
    position: absolute;
    top: 50%;
    left: 50%;
    width: var(--bricks-crop-circle);
    height: var(--bricks-crop-circle);
    border-radius: var(--bricks-border-radius-pill);
    border: 1px solid rgb(from var(--bricks-static-white) r g b / 60%);
    transform: translate(-50%, -50%);
    box-shadow: 0 0 0 100rem var(--bricks-overlay-dark);
    pointer-events: none;
}

.zoom {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.zoomLabel {
    flex-shrink: 0;
    font-size: 1.4rem;
    color: var(--bricks-base-700);
}

.error {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-danger-500);
}
</style>
