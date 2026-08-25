<script setup lang="ts">
/**
 * @description The grid of the media library's tiles. The mock-up gives a tile of
 * 210×172 — 126 of preview over 46 of info — and six columns with a gap of 20 in the
 * content width of the modal. Only the height is fixed here: the width floats through
 * `minmax(20rem, 1fr)` and comes out around 207 in the modal, wider in the dashboard
 * section, where the area is wider. Six columns in the modal do hold.
 *
 * The corners of the preview are kept apart on purpose: the full-screen button in the
 * top right one, the badge of the selection in the left one. On a selected tile under
 * the cursor both are visible at once and in one corner they would overlap.
 *
 * Only the window of the preview is forced light — a picture stays on a light ground,
 * the way it does on the canvas. The card itself lives in the tokens of the theme: the
 * whole tile used to be light, and in the dark theme a dozen white cards read as a wall
 * of light.
 *
 * A tile is a cell of a `grid` rather than an `option` of a listbox: it picks a file
 * AND carries an action of its own, the full-screen button in its corner. A listbox
 * option is not allowed to contain interactive content — measured: axe answers
 * `nested-interactive` on such a tile whatever its `tabindex`, and a screen reader is
 * free to flatten the button into the name of the option instead of letting it be
 * pressed. The grid pattern is the one written for cells with actions inside.
 *
 * Before all this the tile was a mute `div` with a `@click` — a file could not be
 * picked from the keyboard at all, although the full-screen button inside it did make
 * it into the tab order. The `.self` on the keyboard handlers is a must: that button
 * lies inside the cell, and without it Enter on the button bubbled up to the cell,
 * picked the file, while `prevent` canceled the native activation of the button — the
 * lightbox did not open.
 *
 * The grid is walked with the arrows and holds ONE tab stop: `tabindex="0"` used to
 * sit on every tile, so a hundred files were a hundred stops on the way past the
 * grid. Where that stop stands is kept by `useMediaGalleryRovingFocus`, the movement
 * itself by the reka roving primitives, with the orientation left unset on purpose —
 * the tiles wrap by the width of the area, so every arrow has to walk the visual
 * sequence rather than one axis of it. The full-screen button of an inactive cell
 * leaves the tab order along with its cell: otherwise Tab would still walk the whole
 * grid, one preview button per file.
 *
 * The cells sit in their own `role="grid"` plus `role="row"` nodes with
 * `display: contents`, so the upload tile and the skeleton stay in the same CSS grid
 * while staying out of the table: neither a grid nor a row may hold a `button` among
 * its children. The box is the only thing `display: contents` gives up — the role and
 * the name survive it, which was measured before the markup was built. One row for
 * every cell is deliberate: the number of visual columns is set by the width of the
 * area, so a DOM row would be a fiction that breaks at the first resize.
 *
 * The upload tile stands as the first cell: the modal has no permanent upload zone, and
 * the entry point is obliged to stay visible. In the grid it cannot "collapse" — its
 * size is set by the column of the grid rather than by the free space in the column of
 * the content, which is what made the former band cut its own hint off. It is not taken
 * out of the accessibility tree: it is the upload button. The skeleton stands first for
 * a different reason — the grid runs from the new to the old, and the uploaded file will
 * take exactly its place; that one IS taken out of the accessibility tree, being no
 * option to pick but a place held for a file to come.
 *
 * Decisions held by the style section. The minimum of a column is 20rem rather than the
 * 21rem of the tile in the mock-up: the vertical scrollbar of the content takes about
 * 11px, and at 21rem the sixth column stops fitting — the grid drops to five and
 * stretches the tiles to 254; at 20rem six columns hold, and `1fr` brings them to their
 * actual ~208. A tile carries a border at rest: it used to be transparent, and against
 * the white background of the modal the tile did not read as an object — only the
 * picture and the captions were visible. `:focus-visible` shows the full-screen button
 * along with the ring, because a tile is picked from the keyboard and otherwise that
 * button can be reached by Tab but not found by eye. A selected tile takes a 2px border
 * inward and no glow: on a grid of a dozen tiles the former `box-shadow` smeared the
 * edges of the neighbors, while a border with a badge is unambiguous as it is. The
 * upload tile is that same tile, only dashed and with no preview: in a row of files it
 * has to read as a place rather than as one more file. The badge of the selection is the
 * kit's, in a round guise — no colors of our own, `tone="primary"` already gives the
 * primary fill and a static/white glyph; only the square under the check mark is our own
 * geometry, the kit having no "circle of a fixed size" shape and no reason to grow one
 * for a single place. The veil and the white glyph of the full-screen button arrive from
 * the `overlay` variant of the kit button — what is left here is its place in the corner
 * and its appearance on hover, with the focus caught through `:has` rather than
 * `:focus-visible`: an external class of a kit button lands on the WRAPPER of the
 * tooltip, and that wrapper takes no focus, so a rule on it would never fire and a
 * button reached by Tab would stay invisible. The ground of the skeleton bars arrives
 * from `BricksSkeleton`: here it used to be a local `base-200` against the `base-100`
 * of the other three sets of placeholders.
 */

// #region Imports
// Types
import type { IMediaItem } from '../../../common/types/media';
import type { IMediaGalleryGridProps, IMediaGalleryGridEmits } from '../types/media';

// Utils
import { formatFileSize } from '../utils/formatFileSize';
import { formatMediaDimensions, isVideoMedia } from '../utils/mediaSummary';

// Vue
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useMediaGalleryRovingFocus } from '../composables/useMediaGalleryRovingFocus';

// Reka UI
import { RovingFocusGroup, RovingFocusItem } from 'reka-ui';

// Components
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksImage from '../../../ui/base/image/BricksImage.vue';
import BricksSkeleton from '../../../ui/feedback/BricksSkeleton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IMediaGalleryGridProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IMediaGalleryGridEmits>();
// #endregion

// #region Data
const { t } = useI18n();
/**
 * The upload tile is a way into the upload, so it is seen only by a role with the
 * right to write: for an observer it would open a file picker that ends in nothing (the
 * hidden input lives in the upload controls, and those are not shown to that role in
 * the first place).
 */
const { canEdit } = useBuilderPermissions();

const { activeItemId, isActiveItem } = useMediaGalleryRovingFocus({
    items: () => props.items,
    selectedItemId: () => props.selectedItemId,
});
// #endregion

// #region Methods
/** Emits the choice of a gallery item */
function handleSelectItem(item: IMediaItem): void {
    emit('select', item);
}

/** Emits the opening of the full-screen preview */
function handleOpenPreview(item: IMediaItem): void {
    emit('preview', item);
}

/** Asks the caller to open the file picker */
function handleUploadRequest(): void {
    emit('upload');
}

/**
 * The preview of a tile: the gallery itself shows the downscaled variant when there is
 * one — a dozen full files in the grid would weigh an order of magnitude more for no
 * gain at all. Progressive loading is not needed here: the variant IS the final picture
 * of the tile.
 *
 * @param item - The media item.
 * @returns The URL to show in the tile.
 */
function resolveThumbSrc(item: IMediaItem): string {
    return item.previewUrl ?? item.url;
}
// #endregion
</script>

<template>
    <div :class="$style.BuilderMediaGalleryGrid">
        <button
            v-if="props.showUploadTile && canEdit"
            type="button"
            :class="[$style.galleryItem, $style._upload]"
            @click="handleUploadRequest"
        >
            <BricksIcon :class="$style.uploadIcon" icon="ta:outline-cloud-upload" />
            <span :class="$style.uploadLabel">{{ t('bricks.media.tileUpload') }}</span>
            <span :class="$style.uploadHint">{{ t('bricks.media.tileUploadHint') }}</span>
        </button>

        <div
            v-if="props.showSkeleton"
            aria-hidden="true"
            :class="[$style.galleryItem, $style._skeleton]"
        >
            <div :class="$style.thumb">
                <BricksIcon :class="$style.placeholderIcon" icon="ta:outline-photo" />
            </div>
            <div :class="$style.itemInfo">
                <BricksSkeleton :class="[$style.skeletonBar, $style._wide]" />
                <BricksSkeleton :class="$style.skeletonBar" />
            </div>
        </div>

        <RovingFocusGroup
            v-model:current-tab-stop-id="activeItemId"
            as="div"
            role="grid"
            :aria-label="t('bricks.media.galleryTitle')"
            :class="$style.cells"
        >
            <div role="row" :class="$style.cells">
                <RovingFocusItem
                    v-for="item in props.items"
                    :key="item.id"
                    as="div"
                    :tab-stop-id="String(item.id)"
                    role="gridcell"
                    :aria-selected="props.selectedItemId === item.id"
                    :class="[
                        $style.galleryItem,
                        { [$style._selected]: props.selectedItemId === item.id },
                    ]"
                    @click="handleSelectItem(item)"
                    @keydown.enter.self.prevent="handleSelectItem(item)"
                    @keydown.space.self.prevent="handleSelectItem(item)"
                >
                    <div :class="$style.thumb">
                        <div v-if="isVideoMedia(item)" :class="$style.videoPlaceholder">
                            <BricksIcon :class="$style.placeholderIcon" icon="ta:outline-video" />
                        </div>
                        <BricksImage
                            v-else
                            :src="resolveThumbSrc(item)"
                            :alt="item.alt || item.filename"
                            fit="scale-down"
                        />

                        <Transition name="bricks-fade-fast">
                            <BricksBadge
                                v-if="props.selectedItemId === item.id"
                                :class="$style.selectedBadge"
                                tone="primary"
                                shape="pill"
                            >
                                <BricksIcon icon="ta:outline-check" />
                            </BricksBadge>
                        </Transition>

                        <BricksIconButton
                            :class="$style.previewBtn"
                            icon="ta:outline-search"
                            :label="t('bricks.media.fullscreenFor', { filename: item.filename })"
                            variant="overlay"
                            size="lg"
                            :tab-index="isActiveItem(item.id) ? 0 : -1"
                            @click.stop="handleOpenPreview(item)"
                        />
                    </div>

                    <div :class="$style.itemInfo">
                        <span :class="$style.filename">{{ item.filename }}</span>
                        <span :class="$style.meta">
                            {{ formatFileSize(item.size) }} · {{ formatMediaDimensions(item, t) }}
                        </span>
                    </div>
                </RovingFocusItem>
            </div>
        </RovingFocusGroup>
    </div>
</template>

<style module lang="scss">
.BuilderMediaGalleryGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    gap: 2rem;
}

.cells {
    display: contents;
}

.galleryItem {
    position: relative;
    overflow: hidden;
    height: 17.2rem;
    border-radius: var(--bricks-border-radius-md);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    transition:
        border-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-primary-300);
        box-shadow: var(--bricks-shadow-md);

        .previewBtn {
            opacity: 1;
        }
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);

        .previewBtn {
            opacity: 1;
        }
    }

    &._selected {
        border-color: var(--bricks-primary);
        border-width: 0.2rem;
    }

    &._skeleton {
        cursor: default;
    }

    &._upload {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border-style: dashed;
        background: var(--bricks-base-50);
        flex-direction: column;
        gap: 0.4rem;

        &:hover {
            border-color: var(--bricks-primary);
            background: var(--bricks-primary-50);
        }
    }
}

.thumb {
    --bricks-base-100: #f3f4f6;
    --bricks-base-400: #9ca3af;

    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 12.6rem;
    background: var(--bricks-base-100);
}

.placeholderIcon {
    font-size: 2.8rem;
    color: var(--bricks-base-400);
}

.videoPlaceholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
}

.selectedBadge {
    position: absolute;
    top: 0.8rem;
    left: 0.8rem;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    padding: 0;
}

.previewBtn {
    position: absolute;
    top: 0.8rem;
    right: 0.8rem;
    opacity: 0;

    &:has(:focus-visible) {
        opacity: 1;
    }
}

.itemInfo {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.6rem 1rem;
}

.filename {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 500;
    color: var(--bricks-base-900);
}

.meta {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.uploadIcon {
    font-size: 2.8rem;
    color: var(--bricks-base-400);
}

.uploadLabel {
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
}

.uploadHint {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.skeletonBar {
    width: 60%;
    height: 1rem;

    &._wide {
        width: 85%;
    }
}
</style>
