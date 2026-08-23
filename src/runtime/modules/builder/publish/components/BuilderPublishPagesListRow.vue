<script setup lang="ts">
/**
 * @description A page row of the dashboard list: the status dot, the thumbnail, the
 * title with the live address, the date of the last change and the actions.
 *
 * Decisions held by the markup: the status of a page used to rest on one color alone
 * — the "Draft" pill stands next to the name, while a published page announced its
 * status to nobody, neither to a screen reader nor to a person who does not tell
 * green apart; the dot gets a name through `role="img"` with a label, and the look of
 * the row does not change by it. The pill carries the `muted` tone rather than the
 * default `primary`, because "Draft" is a quiet status while a primary fill in the
 * kit means "this is the main thing here" ("Current" on a version, the picked file in
 * the media library) — with a blue pill every unpublished page shouted an accent even
 * though the dot next to it already carries the status. The copy and the template are
 * both a creation of a record, so they are available to an editor and above, and the
 * deletion to an administrator only; the template action stands between the copy and
 * the deletion, because both of its neighbors create or destroy an entity rather than
 * edit the current one.
 *
 * Decisions held by the style section: the look of the surface comes from the kit
 * (`BricksSurfaceCard`), so what is left here is the layout of the row and what it
 * does to its content on hover. The flex basis of the main cell is 18rem — the
 * wrapping threshold at which the date and the actions leave for the second line
 * without tearing the block away from the status dot (an auto basis would blow up to
 * max-content).
 */

// #region Imports
// Types
import type { IPublishPagesListRowProps, IPublishPagesListRowEmits } from '../types/dashboard';

// Utils
import { formatPageDate } from '../../../common/utils/bricks/dates';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksSurfaceCard from '../../../ui/base/surface/BricksSurfaceCard.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishPagesListRowProps>(), {
    isDuplicating: false,
    isPreparingTemplate: false,
    isSelected: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishPagesListRowEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();
// #endregion

// #region Computed
/**
 * The date of the last change (updatedAt || createdAt) in the DD.MM.YYYY format.
 */
const formattedDate = computed<string>(() =>
    formatPageDate(props.page.updatedAt || props.page.createdAt)
);

/**
 * The status label — the accessible name of the dot at the start of the row. The
 * status has no visible label here: a draft carries the "Draft" pill next to its
 * name, while on a published page the status is read out of the color of the dot
 * alone.
 */
const statusLabel = computed<string>(() =>
    props.page.published
        ? t('bricks.publish.dashboard.row.statusPublished')
        : t('bricks.publish.dashboard.row.statusDraft')
);

/**
 * The live address of the page (`/blog/post`). The full address rather than the
 * `pagename` alone: a name is unique only within its own prefix, and two pages
 * sharing a name under different prefixes would look identical in the list —
 * `/post` and `/post`.
 */
const pageAddressPath = computed<string>(() =>
    getPublishedPagePath(toPageAddress(props.page.pagename, props.page.urlPrefix))
);
// #endregion

// #region Methods
/**
 * Emits the selection of the page (the opening of the details panel).
 */
function handleSelect(): void {
    emit('select', props.page);
}

/**
 * Emits the opening of the page thumbnail in the lightbox.
 */
function handlePreviewThumbnail(): void {
    emit('preview-thumbnail', props.page);
}

/**
 * Emits the move to editing the page.
 */
function handleEdit(): void {
    emit('edit', props.page);
}

/**
 * Emits the opening of the page preview.
 */
function handlePreview(): void {
    emit('preview', props.page);
}

/**
 * Emits the duplication of the page.
 */
function handleDuplicate(): void {
    emit('duplicate', props.page);
}

/**
 * Emits the saving of the page as a template.
 */
function handleSaveAsTemplate(): void {
    emit('save-as-template', props.page);
}

/**
 * Emits the deletion of the page.
 */
function handleDelete(): void {
    emit('delete', props.page);
}
// #endregion
</script>

<template>
    <BricksSurfaceCard
        as="article"
        clickable
        :selected="props.isSelected"
        :class="$style.BuilderPublishPagesListRow"
        @click="handleSelect"
    >
        <BricksBadge
            tone="plain"
            :dot="props.page.published ? 'positive' : 'neutral'"
            :class="$style.statusDot"
            role="img"
            :aria-label="statusLabel"
        />

        <button
            v-if="props.page.thumbnailUrl"
            :class="[$style.thumbnail, $style.thumbnailClickable]"
            type="button"
            :title="t('bricks.publish.dashboard.row.thumbnailPreview')"
            :aria-label="t('bricks.publish.dashboard.row.thumbnailPreview')"
            @click.stop="handlePreviewThumbnail"
        >
            <img
                :class="$style.thumbnailImage"
                :src="props.page.thumbnailUrl"
                :alt="props.page.title || props.page.pagename"
                loading="lazy"
            />
        </button>
        <div v-else :class="$style.thumbnail">
            <BricksIcon icon="ta:outline-photo" :class="$style.thumbnailPlaceholder" />
        </div>

        <div :class="$style.main">
            <div :class="$style.titleRow">
                <h3 :class="$style.title">{{ props.page.title }}</h3>
                <span :class="$style.pagename">{{ pageAddressPath }}</span>
                <BricksBadge v-if="!props.page.published" tone="muted">
                    {{ t('bricks.publish.dashboard.row.draft') }}
                </BricksBadge>
            </div>
            <p v-if="props.page.description" :class="$style.description">
                {{ props.page.description }}
            </p>
        </div>

        <span :class="$style.date">
            {{ t('bricks.publish.dashboard.row.updated', { date: formattedDate }) }}
        </span>

        <div :class="$style.actions" @click.stop>
            <BricksIconButton
                icon="ta:outline-pencil"
                :label="t('bricks.publish.dashboard.row.edit')"
                @click="handleEdit"
            />

            <BricksIconButton
                icon="ph:eye"
                :label="t('bricks.publish.dashboard.row.preview')"
                @click="handlePreview"
            />

            <BricksIconButton
                v-if="canEdit"
                icon="ta:outline-copy"
                :label="t('bricks.publish.dashboard.row.duplicate')"
                :disabled="props.isDuplicating"
                @click="handleDuplicate"
            />

            <BricksIconButton
                v-if="canEdit"
                icon="ta:outline-package"
                :label="t('bricks.publish.dashboard.row.saveAsTemplate')"
                :disabled="props.isPreparingTemplate"
                @click="handleSaveAsTemplate"
            />

            <BricksIconButton
                v-if="canDelete"
                icon="ta:outline-trash"
                :label="t('bricks.publish.dashboard.row.delete')"
                danger
                @click="handleDelete"
            />
        </div>
    </BricksSurfaceCard>
</template>

<style module lang="scss">
.BuilderPublishPagesListRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    padding: 1.4rem 1.6rem;
    gap: 0.8rem 1.2rem;

    &:hover,
    &:focus-within {
        .actions {
            opacity: 1;
            pointer-events: auto;
        }
    }
}

.statusDot {
    flex-shrink: 0;
}

.thumbnail {
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 9.6rem;
    height: 6rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-100);
}

.thumbnailClickable {
    padding: 0;
    transition: border-color var(--bricks-default-transition);
    cursor: zoom-in;

    &:hover {
        border-color: var(--bricks-primary-300);
    }
}

.thumbnailImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.thumbnailPlaceholder {
    font-size: 2rem;
    color: var(--bricks-base-400);
}

.main {
    display: flex;
    flex: 1 1 18rem;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
}

.titleRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem 0.8rem;
    min-width: 0;
}

.title {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.pagename {
    flex-shrink: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.description {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.date {
    flex-shrink: 0;
    margin-left: auto;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.6rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--bricks-default-transition);

    &:focus-within {
        opacity: 1;
        pointer-events: auto;
    }
}
</style>
