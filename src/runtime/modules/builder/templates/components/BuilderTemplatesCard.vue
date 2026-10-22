<script setup lang="ts">
/**
 * @description The card of a template in the grid of the section: the preview, the
 * caption and the actions.
 *
 * The grid-shaped counterpart of a row of the page list: the same tokens and the same
 * manner of the actions, but a set of its own. There is nothing to open in an editor and
 * nothing to save as a template (a template is one already), and a copy of a template
 * gives nothing — a template is a copy. What is left is the frame, the caption and the
 * deletion, so the main action lives on the preview ("Create a page"), and a click on
 * the card leads to the same place.
 *
 * An observer cannot create pages at all, and in place of the main action gets the view
 * of the frame — the same button the footer carries.
 *
 * Decisions held by the markup: the overlay and its button come out on hover and on
 * focus inside the card, because from the keyboard the action has to be visible and not
 * merely reachable. Editing the caption is a write, so an observer is not shown it at
 * all — the endpoint would refuse it anyway; a deletion is for an administrator alone,
 * the same as with a page.
 *
 * Decisions held by the style section: the look of the surface comes from the kit
 * (`BricksSurfaceCard`), what is here is the layout of the card and the way the actions
 * come out on hover. The window of the preview is 16:10 — the ratio the snapshot of a
 * page measures its height in (`usePageThumbnail` caps a capture at two such frames), so
 * a taller picture is cropped to the window by `object-fit: cover` from the top. The
 * overlay is darkened by a ready token rather than by `backdrop-filter`: the second one
 * kills performance on a grid of cards. The padding of the caption — 1.2 above and
 * below, 1.4 on the sides — is the geometry of the reference card of the layout.
 */

// #region Imports
// Types
import type { ITemplatesCardProps, ITemplatesCardEmits } from '../types/templates';

// Utils
import { buildTemplateMetaLine } from '../utils/templateSummary';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksSurfaceCard from '../../../ui/base/surface/BricksSurfaceCard.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<ITemplatesCardProps>(), {
    isPending: false,
});
// #endregion

// #region Emits
const emit = defineEmits<ITemplatesCardEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();
// #endregion

// #region Computed
/** The meta line of the card: how big the template is and when it was saved */
const metaLine = computed<string>(() =>
    buildTemplateMetaLine(props.template, (key, params) => t(key, params ?? {}))
);
// #endregion

// #region Methods
/**
 * Asks for a page to be created from the template (a click on the card and the button on
 * the preview). For an observer the frame opens instead of a creation: it is the only
 * thing available to them.
 */
function handlePrimaryAction(): void {
    if (props.isPending) {
        return;
    }

    if (!canEdit.value) {
        handlePreviewThumbnail();
        return;
    }

    emit('create-page', props.template);
}

/** Asks for the frame of the template to be opened in the lightbox */
function handlePreviewThumbnail(): void {
    emit('preview-thumbnail', props.template);
}

/** Asks for the form that edits the caption to be opened */
function handleRename(): void {
    emit('rename', props.template);
}

/** Asks for the template to be deleted (the section asks for the confirmation) */
function handleDelete(): void {
    emit('delete', props.template);
}
// #endregion
</script>

<template>
    <BricksSurfaceCard
        as="article"
        clickable
        :class="[$style.BuilderTemplatesCard, props.isPending && $style._pending]"
        @click="handlePrimaryAction"
    >
        <div :class="$style.thumbnail">
            <img
                v-if="props.template.thumbnailUrl"
                :class="$style.thumbnailImage"
                :src="props.template.thumbnailUrl"
                :alt="props.template.name"
                loading="lazy"
            />
            <BricksIcon v-else icon="ta:outline-photo" :class="$style.thumbnailPlaceholder" />

            <div :class="$style.overlay">
                <BricksButton
                    size="md"
                    :variant="canEdit ? 'primary' : 'secondary'"
                    :disabled="props.isPending"
                    @click.stop="handlePrimaryAction"
                >
                    {{
                        canEdit
                            ? t('bricks.templates.card.createPage')
                            : t('bricks.templates.card.preview')
                    }}
                </BricksButton>
            </div>
        </div>

        <div :class="$style.meta">
            <h3 :class="$style.name">{{ props.template.name }}</h3>
            <p v-if="props.template.description" :class="$style.description">
                {{ props.template.description }}
            </p>

            <div :class="$style.metaRow">
                <span :class="$style.metaText">{{ metaLine }}</span>

                <div :class="$style.actions" @click.stop>
                    <BricksIconButton
                        icon="ph:eye"
                        :label="t('bricks.templates.card.preview')"
                        @click="handlePreviewThumbnail"
                    />

                    <BricksIconButton
                        v-if="canEdit"
                        icon="ta:outline-pencil"
                        :label="t('bricks.templates.card.rename')"
                        :disabled="props.isPending"
                        @click="handleRename"
                    />

                    <BricksIconButton
                        v-if="canDelete"
                        icon="ta:outline-trash"
                        :label="t('bricks.templates.card.delete')"
                        danger
                        :disabled="props.isPending"
                        @click="handleDelete"
                    />
                </div>
            </div>
        </div>
    </BricksSurfaceCard>
</template>

<style module lang="scss">
.BuilderTemplatesCard {
    overflow: hidden;
    display: flex;
    flex-direction: column;

    &:hover,
    &:focus-within {
        .overlay,
        .actions {
            opacity: 1;
            pointer-events: auto;
        }
    }
}

._pending {
    opacity: 0.6;
    cursor: default;
}

.thumbnail {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 16 / 10;
    border-bottom: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-100);
}

.thumbnailImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.thumbnailPlaceholder {
    font-size: 2.8rem;
    color: var(--bricks-base-400);
}

.overlay {
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
    inset: 0;
    background: var(--bricks-overlay-dark);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--bricks-default-transition);
}

.meta {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 1.2rem 1.4rem;
}

.name {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.description {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.metaRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    min-height: 2.8rem;
}

.metaText {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-text-muted);
}

.actions {
    display: flex;
    flex-shrink: 0;
    gap: 0.6rem;
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--bricks-default-transition);
}
</style>
