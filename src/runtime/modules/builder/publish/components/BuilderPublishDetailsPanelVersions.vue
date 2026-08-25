<script setup lang="ts">
/**
 * @description The versions section of the details panel: the gallery of snapshots
 * with the current state first, the preview of a version and the request for a
 * rollback.
 *
 * Decisions held by the markup: the skeleton is shown only while there is nothing to
 * show — a reload of an open section (after a rollback or a save) must not flash an
 * empty grid over the versions already on screen. The `alt` of a snapshot is empty on
 * purpose: there is nothing to describe a screenshot of a page with in words, and the
 * date is already spoken by the line next to it — with `alt="the date"` a screen
 * reader would repeat it twice in a row. The labels of the action buttons are
 * mandatory rather than nice to have: an unlabeled "restore" arrow reads as "undo",
 * and the price of that mistake here is the overwritten content of a page. Restoring
 * a version is an edit of the page, so it is available to an editor and above.
 *
 * Decisions held by the style section: two cards per row — `repeat(2, minmax(0, 1fr))`
 * splits the 28.8rem of the panel content (34rem less the padding and the scrollbar)
 * into two 13.8rem cards with a 1.2rem gap between them. The preview holds an exact
 * 16:10 at any card width, the same ratio the thumbnail in the page list holds. The
 * place of the "Current" pill is ours while its look comes from the kit
 * (the `primary` fill rather than the former `primary-500`: the status pill of the
 * kit has one fill for every place it appears in). The dimming of the actions is not
 * a layer of its own: its background both puts the preview out and catches the mouse
 * while the actions are visible. The "no snapshot" mark under that veil collides with
 * the action icons, since it is centered too — while the actions are open there is
 * nothing to show, so the placeholder leaves.
 */

// #region Imports
// Types
import type { IPageVersionSummary } from '../../../common/types/bricks-api';
import type {
    IPublishDetailsPanelVersionsProps,
    IPublishDetailsPanelVersionsEmits,
    IPublishVersionCard,
} from '../types/dashboard';

// Utils
import { formatPageDateTime } from '../../../common/utils/bricks/dates';
import { formatPageVersionDateTime } from '../utils/dates';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishPageVersions } from '../composables/usePublishPageVersions';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
import BricksDisclosure from '../../../ui/base/disclosure/BricksDisclosure.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksSkeleton from '../../../ui/feedback/BricksSkeleton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelVersionsProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelVersionsEmits>();
// #endregion

// #region Data
/** How many placeholder cards hold the height of the panel while the list travels */
const SKELETON_CARDS_COUNT = 4;

const { t } = useI18n();
const { canEdit } = useBuilderPermissions();

const { versions, isLoading, loadVersions, previewVersion, resetVersions } =
    usePublishPageVersions();

const isOpen = ref(false);
// #endregion

// #region Computed
/**
 * The cards of the gallery: the current state of the page first, the history behind
 * it. While there is no history the current card is not shown — there is nothing to
 * compare against, and the section honestly answers with its empty state.
 */
const versionCards = computed<IPublishVersionCard[]>(() => {
    if (versions.value.length === 0) {
        return [];
    }

    return [
        {
            key: 'current',
            version: null,
            thumbnailUrl: props.page.thumbnailUrl,
            date: formatPageDateTime(props.page.updatedAt),
        },
        // The date of a card is the moment the captured state was saved rather than
        // the moment it was displaced (see formatPageVersionDateTime); the rollback
        // confirmation is signed with that same date
        ...versions.value.map((version) => ({
            key: `version-${version.id}`,
            version,
            thumbnailUrl: version.thumbnailUrl,
            date: formatPageVersionDateTime(version),
        })),
    ];
});
// #endregion

// #region Methods
/**
 * Loads the version list; notifies the controller on an error.
 */
async function reloadVersions(): Promise<void> {
    try {
        await loadVersions(props.page.id);
    } catch {
        emit('notify', t('bricks.publish.dashboard.details.versions.toasts.loadFailed'), 'error');
    }
}

/**
 * Expands or collapses the versions section; on an opening loads a fresh list.
 *
 * The open state arrives from the disclosure rather than being flipped here: a
 * change of page closes the list too, and the state must have a single owner.
 *
 * @param value - The requested state of the section.
 */
async function handleToggle(value: boolean): Promise<void> {
    isOpen.value = value;

    if (isOpen.value) {
        await reloadVersions();
    }
}

/**
 * Opens the preview of a version in a new tab. There is nothing to load — the
 * version travels in the URL of the preview route; the only thing reported is a tab
 * that did not open.
 *
 * @param version - Version summary.
 */
function handlePreview(version: IPageVersionSummary): void {
    if (!previewVersion(props.page, version.id)) {
        emit(
            'notify',
            t('bricks.publish.dashboard.details.versions.toasts.previewFailed'),
            'error'
        );
    }
}

/**
 * Asks for the page to be rolled back to a version (the confirmation lives in the
 * controller).
 *
 * @param version - Version summary.
 */
function handleRestore(version: IPageVersionSummary): void {
    emit('restore', version);
}
// #endregion

// #region Lifecycle
watch(
    () => props.page.id,
    () => {
        isOpen.value = false;
        // Through the composable rather than by assigning into `versions`: the
        // reset is obliged to devalue the request of the previous page in flight
        // as well
        resetVersions();
    }
);

// Any write of the page (a rollback, a save of the meta, a schema import) displaces
// a version — so an open list is reloaded. The watch is on `revision` rather than on
// `updatedAt`: a revision is monotonic by contract, while two fast writes may get an
// indistinguishable timestamp and the update of the history would then be lost
watch(
    () => props.page.revision,
    () => {
        if (isOpen.value) {
            reloadVersions();
        }
    }
);
// #endregion
</script>

<template>
    <BricksDisclosure
        :value="isOpen"
        :label="t('bricks.publish.dashboard.details.versions.title')"
        @update:value="handleToggle"
    >
        <div :class="$style.versionsContent">
            <div v-if="isLoading && versions.length === 0" :class="$style.grid">
                <div v-for="index in SKELETON_CARDS_COUNT" :key="index" :class="$style.card">
                    <BricksSkeleton shape="block" :class="[$style.thumb, $style.thumbSkeleton]" />
                    <BricksSkeleton :class="$style.dateSkeleton" />
                </div>
            </div>

            <p v-else-if="versions.length === 0" :class="$style.empty">
                {{ t('bricks.publish.dashboard.details.versions.empty') }}
            </p>

            <ul v-else :class="$style.grid">
                <li
                    v-for="card in versionCards"
                    :key="card.key"
                    :class="[$style.card, !card.version && $style.cardCurrent]"
                >
                    <div :class="$style.thumb">
                        <img
                            v-if="card.thumbnailUrl"
                            :class="$style.thumbImage"
                            :src="card.thumbnailUrl"
                            alt=""
                            loading="lazy"
                        />
                        <div v-else :class="$style.placeholder">
                            <BricksIcon icon="ta:outline-photo" :class="$style.placeholderIcon" />
                            <span :class="$style.placeholderText">
                                {{ t('bricks.publish.dashboard.details.versions.noThumbnail') }}
                            </span>
                        </div>

                        <BricksBadge
                            v-if="!card.version"
                            shape="pill"
                            tone="primary"
                            :class="$style.currentBadge"
                        >
                            {{ t('bricks.publish.dashboard.details.versions.current') }}
                        </BricksBadge>

                        <div v-if="card.version" :class="$style.actions">
                            <BricksIconButton
                                variant="overlay"
                                icon="ta:outline-eye"
                                :label="t('bricks.publish.dashboard.details.versions.preview')"
                                @click="handlePreview(card.version)"
                            />

                            <BricksIconButton
                                v-if="canEdit"
                                variant="overlay"
                                icon="ta:outline-arrow-back-up"
                                :label="t('bricks.publish.dashboard.details.versions.restore')"
                                @click="handleRestore(card.version)"
                            />
                        </div>
                    </div>

                    <span :class="[$style.date, !card.version && $style.dateCurrent]">
                        {{ card.date }}
                    </span>
                </li>
            </ul>
        </div>
    </BricksDisclosure>
</template>

<style module lang="scss">
.versionsContent {
    display: flex;
    flex-direction: column;
}

.empty {
    margin: 0;
    font-size: 1.2rem;
    color: var(--bricks-text-muted);
}

.grid {
    display: grid;
    margin: 0;
    padding: 0;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.2rem;
    list-style: none;
}

.card {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-width: 0;
}

.thumb {
    position: relative;
    overflow: hidden;
    aspect-ratio: 16 / 10;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.thumbSkeleton {
    border-color: transparent;
}

.thumbImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: top;
}

.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    flex-direction: column;
    gap: 0.4rem;
    background: var(--bricks-base-100);
    transition: opacity var(--bricks-default-transition);
}

.placeholderIcon {
    font-size: 2rem;
    color: var(--bricks-base-400);
}

.placeholderText {
    font-size: 1.2rem;
    color: var(--bricks-text-muted);
}

.currentBadge {
    position: absolute;
    top: 0.8rem;
    left: 0.8rem;
}

.cardCurrent {
    .thumb {
        border-color: var(--bricks-primary-500);
        border-width: 0.2rem;
    }
}

.actions {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.2rem;
    background: var(--bricks-overlay-dark);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--bricks-default-transition);
}

.card:hover .actions,
.card:focus-within .actions {
    opacity: 1;
    pointer-events: auto;
}

.card:hover .placeholder,
.card:focus-within .placeholder {
    opacity: 0;
}

.date {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-600);
}

.dateCurrent {
    font-weight: 500;
    color: var(--bricks-base-900);
}

.dateSkeleton {
    width: 60%;
    height: 1.2rem;
}
</style>
