<script setup lang="ts">
/**
 * @description The full-screen preview of a file, over the gallery.
 *
 * This is a dialog rather than a mere overlay: it covers the whole of the modal, so
 * it is obliged to take the focus and to keep Tab from leaving it — otherwise the
 * focus stays on the tile under the dimming and goes on walking an invisible gallery.
 * Built by hand rather than out of `BricksModal`: that one teleports into the body and
 * would make a layer of its own over the gallery, whereas the lightbox has to live
 * INSIDE the gallery's stacking context. Why Escape is handled here — at
 * `handleKeydown`.
 *
 * Decisions held by the style section: the `z-index` is a local value rather than a
 * step of the `--bricks-z-*` scale. Inside the gallery that is exact — the modal's root
 * with a `z-index` opens a stacking context of its own, and the only rivals are the
 * neighbors within it, which carry no `z-index` at all. On the dashboard, where the
 * lightbox is mounted on its own, the value competes with the layers of the page
 * instead, and 10 is above them by fact rather than by the scale.
 */

// #region Imports
// Types
import type {
    IMediaGalleryPreviewLightboxProps,
    IMediaGalleryPreviewLightboxEmits,
} from '../types/media';

// Vue
import { nextTick, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryPreviewLightboxProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryPreviewLightboxEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const rootRef = ref<HTMLElement | null>(null);
const closeRef = ref<HTMLButtonElement | null>(null);
/** What held the focus before the opening — that is where the focus goes back */
let previouslyFocused: HTMLElement | null = null;
// #endregion

// #region Methods
/** Closes the full-screen preview */
function handleClose(): void {
    emit('close');
}

/**
 * Closes the preview on Escape and locks Tab inside the dialog, closing it into a
 * loop over the focusable elements of its own.
 *
 * Escape is handled here rather than inherited from the parent modal: on the dashboard
 * the lightbox lives on its own (a snapshot of a page, a snapshot of a template, a
 * file of the media library), and there is no Reka dialog over it at all. Inside the
 * gallery this does not fire twice: the gallery's handler swallows the event at the
 * modal and closes that same preview.
 *
 * Not "always send the focus back to the close button": a video carries `controls` and
 * the `<video>` itself is focusable — folding the loop down to a single button would
 * put its controls out of reach of the keyboard. Only the way out over the edges is
 * intercepted; inside the dialog Tab works natively.
 *
 * @param event - The keyboard event.
 */
function handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        handleClose();
        return;
    }

    if (event.key !== 'Tab') {
        return;
    }

    const focusable = Array.from(
        rootRef.value?.querySelectorAll<HTMLElement>('button, video[controls]') ?? []
    );

    if (focusable.length === 0) {
        return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const boundary = event.shiftKey ? first : last;

    if (document.activeElement !== boundary) {
        return;
    }

    event.preventDefault();
    (event.shiftKey ? last : first).focus();
}
// #endregion

// #region Lifecycle
watch(
    () => props.item,
    async (item) => {
        if (!item) {
            previouslyFocused?.focus();
            previouslyFocused = null;
            return;
        }

        previouslyFocused = document.activeElement as HTMLElement | null;

        await nextTick();
        closeRef.value?.focus();
    }
);
// #endregion
</script>

<template>
    <Transition name="bricks-modal-fade">
        <div
            v-if="props.item"
            ref="rootRef"
            role="dialog"
            aria-modal="true"
            :aria-label="props.item.alt || props.item.filename"
            :class="$style.BuilderMediaGalleryPreviewLightbox"
            @click.self="handleClose"
            @keydown="handleKeydown"
        >
            <button
                ref="closeRef"
                type="button"
                :class="$style.previewClose"
                :aria-label="t('bricks.common.close')"
                @click="handleClose"
            >
                <BricksIcon icon="ta:outline-x" />
            </button>
            <video
                v-if="props.item.mimeType.startsWith('video/')"
                :src="props.item.url"
                :class="$style.previewImage"
                controls
                playsinline
            />
            <img
                v-else
                :src="props.item.url"
                :alt="props.item.alt || props.item.filename"
                :class="$style.previewImage"
                decoding="async"
            />
        </div>
    </Transition>
</template>

<style module lang="scss">
.BuilderMediaGalleryPreviewLightbox {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4rem;
    background: rgb(0 0 0 / 85%);
}

.previewClose {
    position: absolute;
    top: 2rem;
    right: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    padding: 0;
    border-radius: 0.8rem;
    border: none;
    background: rgb(255 255 255 / 15%);
    font-size: 2rem;
    color: var(--bricks-static-white);
    transition: background 150ms ease;
    cursor: pointer;

    &:hover {
        background: rgb(255 255 255 / 25%);
    }
}

.previewImage {
    max-width: 100%;
    max-height: 100%;
    border-radius: 0.4rem;
    object-fit: contain;
}
</style>
