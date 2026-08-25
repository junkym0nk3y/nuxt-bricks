<script setup lang="ts">
/**
 * @description The details panel of the selected page: the publication switch with
 * the live URL, the meta form, the OG image, the routing, the versions, the schema
 * and the actions on the page.
 *
 * Decisions held by the markup: with no right to edit, the publication switch stays
 * on screen but blocked — it is also the only place the published state of a page is
 * shown; the meta and routing fields are shown blocked rather than hidden for the
 * same reason, because the address and the description of a page are facts about it
 * and a viewer needs them just the same. Saving the meta is blocked while a schema
 * import runs too: both operations are a PATCH carrying the same
 * `expectedRevision`, and the second one would get a 409, forcing a person to pick
 * the JSON file all over again — the precondition allows no loss of data, but the
 * conflict here would be man-made. The copy is a creation of a page (an editor's
 * right), the deletion an administrator's. The side of the delete button is `xl`,
 * that is 40, to line up with "Duplicate" next to it: the `md` kit button is 39 tall,
 * and a smaller side read as a button sagging in the pair.
 */

// #region Imports
// Types
import type { IPageVersionSummary, TPublishedPageSummary } from '../../../common/types/bricks-api';
import type { IMediaItem } from '../../../common/types/media';
import type { IParsedSchemaFile } from '../types/composables';
import type { IPublishDetailsPanelProps, IPublishDetailsPanelEmits } from '../types/dashboard';

// Utils
import { formatPageDate } from '../../../common/utils/bricks/dates';
import { toPageAddress } from '../../../common/utils/bricks/pageAddress';
import { getPublishedPagePath } from '../../../common/utils/bricks/routePaths';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { usePublishPageForm } from '../composables/usePublishPageForm';
import { usePublishDetailsUrl } from '../composables/usePublishDetailsUrl';
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BricksSwitch from '../../../ui/inputs/BricksSwitch.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BuilderPublishSeoFields from './BuilderPublishSeoFields.vue';
import BuilderPublishDetailsPanelOgImage from './BuilderPublishDetailsPanelOgImage.vue';
import BuilderPublishDetailsPanelRouting from './BuilderPublishDetailsPanelRouting.vue';
import BuilderPublishDetailsPanelVersions from './BuilderPublishDetailsPanelVersions.vue';
import BuilderPublishDetailsPanelSchema from './BuilderPublishDetailsPanelSchema.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDetailsPanelProps>(), {
    isDuplicating: false,
    isImporting: false,
    isTogglingPublished: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDetailsPanelEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { canEdit, canDelete } = useBuilderPermissions();

const {
    title,
    pagename,
    description,
    keywords,
    socialImage,
    urlPrefix,
    subdomain,
    errors,
    isDirty,
    isSaving,
    submitForm,
    resetToPage,
    setSocialImage,
} = usePublishPageForm(
    computed(() => props.page),
    {
        onSaveSuccess: () =>
            emit('notify', t('bricks.publish.dashboard.details.toasts.saved'), 'success'),
        onSaveError: (message) =>
            emit(
                'notify',
                message || t('bricks.publish.dashboard.details.toasts.saveFailed'),
                'error'
            ),
    }
);

const { liveUrl, copyLiveUrl } = usePublishDetailsUrl({ pagename, urlPrefix, subdomain });
// #endregion

// #region Computed
const panelSubtitle = computed<string>(() => {
    const created = t('bricks.publish.dashboard.details.created', {
        date: formatPageDate(props.page.createdAt),
    });
    // The whole address: the subtitle is obliged to name the same page that is
    // open, and `/post` is indistinguishable between `/blog/post` and `/news/post`
    const path = getPublishedPagePath(toPageAddress(props.page.pagename, props.page.urlPrefix));

    return `${path} · ${created}`;
});
// #endregion

// #region Methods
/**
 * Closes the details panel.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Toggles the publication status (the optimistic patch lives in the controller).
 *
 * The switch is closed off while the write runs (`isTogglingPublished`): the
 * controller refuses a second call anyway, and a switch latching back and forth
 * with nothing going out would read as a broken control.
 *
 * @param value - The new publication flag.
 */
function handleTogglePublished(value: boolean | string): void {
    emit('toggle-published', props.page, Boolean(value));
}

/**
 * Copies the live URL of the page to the clipboard and shows a toast with the
 * result.
 */
async function handleCopyUrl(): Promise<void> {
    const copied = await copyLiveUrl();
    if (copied) {
        emit('notify', t('bricks.publish.dashboard.details.toasts.urlCopied'), 'success');
    } else {
        emit('notify', t('bricks.publish.dashboard.details.toasts.copyFailed'), 'error');
    }
}

/**
 * Asks for an OG image to be picked from the media gallery.
 */
function handleOpenMediaGallery(): void {
    emit('open-media');
}

/**
 * Takes the item picked in the media gallery (called by the controller through a
 * ref).
 *
 * @param item - The picked media object.
 */
function handleMediaSelect(item: IMediaItem): void {
    setSocialImage(item.url);
}

/**
 * Drops the picked OG image.
 */
function handleClearSocialImage(): void {
    setSocialImage('');
}

/**
 * Opens the page in the builder editor.
 */
function handleEdit(): void {
    emit('edit', props.page);
}

/**
 * Duplicates the page.
 */
function handleDuplicate(): void {
    emit('duplicate', props.page);
}

/**
 * Passes the rollback request through to the controller (the confirmation and the
 * toasts live there).
 *
 * @param version - Version summary.
 */
function handleRestoreVersion(version: IPageVersionSummary): void {
    emit('restore-version', props.page, version);
}

/**
 * Passes a notification of the versions section through to the controller.
 *
 * @param message - The text of the notification.
 * @param variant - The kind of the notification.
 */
function handleVersionsNotify(message: string, variant: 'success' | 'error'): void {
    emit('notify', message, variant);
}

/**
 * Passes the parsed schema file through to the controller: the replacement
 * confirmation, the resolving of the images and the write belong to it.
 *
 * The page is taken out of the event rather than out of the prop: the section takes
 * it before the file is read, and by the time of the emit the prop may already point
 * at another page.
 *
 * @param page - The page as of the moment the file was picked.
 * @param file - The parsed JSON schema file.
 */
function handleImportFile(page: TPublishedPageSummary, file: IParsedSchemaFile): void {
    emit('import-schema-file', page, file);
}

/**
 * Asks for the page to be deleted.
 */
function handleDelete(): void {
    emit('delete', props.page);
}

defineExpose({
    handleMediaSelect,
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderPublishDetailsPanel">
        <div :class="$style.header">
            <div :class="$style.titleRow">
                <h2 :class="$style.title">{{ props.page.title || props.page.pagename }}</h2>
                <BricksCloseButton @click="handleClose" />
            </div>
            <p :class="$style.subtitle">{{ panelSubtitle }}</p>
        </div>

        <div :class="[$style.content, 'bricks-scrollbox']">
            <div :class="$style.publication">
                <BricksSwitch
                    :value="props.page.published"
                    :true-value="true"
                    :false-value="false"
                    false-label=""
                    :disabled="!canEdit || props.isTogglingPublished"
                    :true-label="t('bricks.publish.dashboard.details.published')"
                    @update:value="handleTogglePublished"
                />
                <div v-if="liveUrl" :class="$style.urlRow">
                    <BricksIcon icon="ph:link" :class="$style.urlIcon" />
                    <span :class="$style.urlText">{{ liveUrl }}</span>
                    <BricksIconButton
                        icon="ta:outline-copy"
                        :label="t('bricks.publish.dashboard.details.copyUrl')"
                        variant="ghost"
                        @click="handleCopyUrl"
                    />
                </div>
            </div>

            <BuilderPublishSeoFields
                v-model:title="title"
                v-model:pagename="pagename"
                v-model:description="description"
                v-model:keywords="keywords"
                :errors="errors"
                :disabled="isSaving || !canEdit"
            />

            <BuilderPublishDetailsPanelOgImage
                :social-image="String(socialImage ?? '')"
                :error="errors.socialImage"
                :is-disabled="isSaving || !canEdit"
                @open-media="handleOpenMediaGallery"
                @clear="handleClearSocialImage"
            />

            <BuilderPublishDetailsPanelRouting
                v-model:url-prefix="urlPrefix"
                v-model:subdomain="subdomain"
                :page="props.page"
                :errors="errors"
                :is-disabled="isSaving || !canEdit"
            />

            <BuilderPublishDetailsPanelVersions
                :page="props.page"
                @restore="handleRestoreVersion"
                @notify="handleVersionsNotify"
            />

            <BuilderPublishDetailsPanelSchema
                :page="props.page"
                :is-importing="props.isImporting"
                :is-saving="isSaving"
                @import-file="handleImportFile"
            />

            <div v-if="canEdit && (isDirty || isSaving)" :class="$style.saveBar">
                <BricksButton
                    size="md"
                    variant="primary"
                    block
                    :disabled="isSaving || props.isImporting"
                    @click="submitForm"
                >
                    {{ t('bricks.publish.dashboard.details.save') }}
                </BricksButton>
                <BricksButton
                    size="md"
                    variant="ghost"
                    :disabled="isSaving || props.isImporting"
                    @click="resetToPage"
                >
                    {{ t('bricks.publish.dashboard.details.cancel') }}
                </BricksButton>
            </div>
        </div>

        <div :class="$style.footer">
            <BricksButton
                size="md"
                variant="primary"
                block
                :disabled="isSaving"
                @click="handleEdit"
            >
                {{ t('bricks.publish.dashboard.details.openInEditor') }}
            </BricksButton>
            <div :class="$style.footerRow">
                <BricksButton
                    v-if="canEdit"
                    :class="$style.duplicateButton"
                    size="md"
                    variant="secondary"
                    :disabled="props.isDuplicating || isSaving"
                    @click="handleDuplicate"
                >
                    {{ t('bricks.publish.dashboard.row.duplicate') }}
                </BricksButton>
                <BricksIconButton
                    v-if="canDelete"
                    icon="ta:outline-trash"
                    :label="t('bricks.publish.dashboard.row.delete')"
                    size="xl"
                    danger
                    @click="handleDelete"
                />
            </div>
        </div>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDetailsPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.header {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 0.2rem;
    padding: 1.8rem 2rem 1.6rem;
    border-bottom: 1px solid var(--bricks-base-200);
}

.titleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
}

.title {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.6rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.subtitle {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.content {
    overflow-y: auto;
    display: flex;
    flex: 1;
    padding: 1.6rem 2rem;
    flex-direction: column;
    gap: 1.6rem;
}

.publication {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.2rem;
    border-radius: var(--bricks-border-radius-sm);
    background: var(--bricks-base-50);
}

.urlRow {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-width: 0;
}

.urlIcon {
    flex-shrink: 0;
    width: 1.4rem;
    height: 1.4rem;
    color: var(--bricks-base-400);
}

.urlText {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-primary-600);
}

.saveBar {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.footer {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 0.8rem;
    padding: 1.6rem 2rem 2rem;
    border-top: 1px solid var(--bricks-base-200);
}

.footerRow {
    display: flex;
    gap: 0.8rem;
}

.duplicateButton {
    flex: 1;
}
</style>
