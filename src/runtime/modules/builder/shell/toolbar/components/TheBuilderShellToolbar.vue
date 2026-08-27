<script setup lang="ts">
/**
 * @description Top bar of the builder: the logo, the selector of the open page next
 * to the title, and the actions on the right — media gallery, preview, save and the
 * profile menu.
 *
 * The avatar stands behind a vertical rule: it is not an action of the bar but "who
 * is signed in", and without the rule it read as one more button next to Save. The
 * rule is drawn by the menu itself, which also decides whether to render at all —
 * outside database mode there is no profile, and the bar would otherwise carry a
 * line with no avatar next to it. Before that menu the builder had no way out at
 * all: logout lived only in the dashboard rail.
 */

// #region Imports
// Types
import type { IToolbarProps, IToolbarEmits } from '../types/components';
import type { IBrickUiCommonProp } from '../../../../ui/types/common';
import type { TPublishedPageSummary } from '../../../../common/types/bricks-api';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBricksRoutePaths } from '../../../../common/composables/useBricksRoutePaths';
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Components
import BricksIconButton from '../../../../ui/base/icon-button/BricksIconButton.vue';
import BricksActionButton from '../../../../ui/base/action-button/BricksActionButton.vue';
import BuilderAuthProfileMenu from '../../../auth/components/BuilderAuthProfileMenu.vue';
import BuilderLogo from '../../../core/components/BuilderLogo.vue';
import BuilderShellToolbarPageSelector from './BuilderShellToolbarPageSelector.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IToolbarProps>(), {
    pages: () => [],
    currentPageId: null,
    isPagesLoaded: false,
    isPagesLoading: false,
    isSubmittingPage: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IToolbarEmits>();
// #endregion

// #region Data
const { t } = useI18n();
// The media gallery and saving are behind the edit permission: both are writes. From
// here the gallery opens in its manager context, where uploading and editing files is
// the whole point of it — and every one of those the endpoints turn a viewer down on
const { canEdit } = useBuilderPermissions();

// Dashboard href: BuilderLogo renders a plain <a>, which the router leaves alone, so
// the base has to be prepended here
const { builderRootPath, withBase } = useBricksRoutePaths();
const dashboardHref = withBase(builderRootPath);
// #endregion

// #region Computed
/**
 * Title of the open page, empty title read as none.
 *
 * The page selector hangs off this title and appears only together with it: until the
 * session opens the form is empty, and the server renders the same markup — showing
 * the selector any earlier would come back as a hydration mismatch.
 *
 * @returns Page title, or null when the form has none.
 */
const currentPageTitle = computed(() => {
    const title = props.pageTitle?.trim();
    if (!title) {
        return null;
    }
    return title;
});

/**
 * Builds the configuration of the save button.
 *
 * Options:
 * - 'draft' — save the page
 * - 'copy' — save it as a copy of the page
 * - 'template' — save the canvas as a template (writes no page)
 *
 * @returns The button label and the array of dropdown options.
 */
const publishButtonConfig = computed<{
    label: string;
    options: IBrickUiCommonProp[];
}>(() => {
    const baseOptions: IBrickUiCommonProp[] = [
        {
            label: t('bricks.toolbar.saveDraft'),
            value: 'draft',
        },
        {
            label: t('bricks.toolbar.saveCopy'),
            value: 'copy',
        },
        {
            label: t('bricks.toolbar.saveTemplate'),
            value: 'template',
        },
    ];

    return {
        label: t('bricks.toolbar.save'),
        options: baseOptions,
    };
});
// #endregion

// #region Methods
/**
 * Asks for the page manager — the builder dashboard, where saved pages are browsed,
 * opened and deleted.
 */
function handleOpenPagesManager(): void {
    emit('openPagesManager');
}

/**
 * Reports that the selector was opened: the list of pages is fetched and refreshed at
 * exactly that moment, not when the builder loads.
 */
function handleOpenPageSelector(): void {
    emit('openPageSelector');
}

/**
 * Passes the page picked in the selector upwards — the navigation itself is done by
 * the composition root.
 *
 * @param page - Picked page.
 */
function handleSelectPage(page: TPublishedPageSummary): void {
    emit('selectPage', page);
}

/**
 * Asks for a new page to be created.
 */
function handleCreatePage(): void {
    emit('createPage');
}

/**
 * Asks for the media gallery — uploading and managing the images and videos of the
 * landing pages.
 */
function handleOpenMediaGallery(): void {
    emit('openMediaGallery');
}

/**
 * Asks to save the open page as a copy: a new page with the same content, written
 * straight away — the name is not asked for.
 */
function handleSaveAsCopy(): void {
    emit('saveAsCopy');
}

/**
 * Asks to save the canvas content as a template. The page itself is not written by
 * this option: a template is an imprint of the content, and saving the page along
 * with it would be an unannounced side effect.
 */
function handleSaveAsTemplate(): void {
    emit('saveAsTemplate');
}

/**
 * Asks to save the open page. Whether that publishes it is decided by the `published`
 * flag of the publish form, not by this option.
 */
function handleSaveDraft(): void {
    emit('saveDraft');
}

/**
 * Asks for a preview of the open page in a new tab — how it is going to look once
 * published.
 */
function handlePreview(): void {
    emit('preview');
}

/**
 * Forwards the request for the profile modal upwards: the composition root mounts it.
 */
function handleOpenProfile(): void {
    emit('openProfile');
}

/**
 * Forwards the logout upwards: the session and the trip to the login page belong to
 * the composition root.
 */
function handleLogout(): void {
    emit('logout');
}
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderShellToolbar">
        <div :class="$style.center">
            <h1 :class="$style.title">
                <span :class="$style.titlePrimary">
                    <BuilderLogo :class="$style.logo" :to="dashboardHref" />
                </span>
                <template v-if="currentPageTitle">
                    <span :class="$style.titleDivider" aria-hidden="true">|</span>
                    <BuilderShellToolbarPageSelector
                        :page-title="currentPageTitle"
                        :pages="props.pages"
                        :current-page-id="props.currentPageId"
                        :is-loaded="props.isPagesLoaded"
                        :is-loading="props.isPagesLoading"
                        :disabled="!props.isSessionReady"
                        :is-create-disabled="props.isSubmittingPage"
                        @open="handleOpenPageSelector"
                        @select="handleSelectPage"
                        @all-pages="handleOpenPagesManager"
                        @create-page="handleCreatePage"
                    />
                </template>
            </h1>
        </div>

        <div :class="$style.right">
            <BricksIconButton
                v-if="canEdit"
                icon="ta:outline-photo-video"
                :label="t('bricks.toolbar.media')"
                variant="quiet"
                size="xl"
                :disabled="!props.isSessionReady"
                @click="handleOpenMediaGallery"
            />

            <BricksIconButton
                icon="ta:outline-browser-share"
                :label="t('bricks.toolbar.preview')"
                variant="quiet"
                size="xl"
                :disabled="!props.isSessionReady"
                @click="handlePreview"
            />

            <BricksActionButton
                v-if="canEdit"
                :label="publishButtonConfig.label"
                :options="publishButtonConfig.options"
                :is-submitting="props.isSubmittingPublish"
                :disabled="!props.isSessionReady"
                @save-as-copy="handleSaveAsCopy"
                @save-as-template="handleSaveAsTemplate"
                @save-draft="handleSaveDraft"
            >
                <BricksIcon :class="$style.icon" icon="ta:outline-device-floppy" />
            </BricksActionButton>

            <BuilderAuthProfileMenu
                separated
                @open-profile="handleOpenProfile"
                @logout="handleLogout"
            />
        </div>
    </div>
</template>

<style module lang="scss">
.TheBuilderShellToolbar {
    position: relative;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 6rem;
    padding: 0 2rem 0 1.2rem;
    border-bottom: 1px solid var(--bricks-base-300);
    background-color: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-sm);
}

.right {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.center {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: margin var(--bricks-default-transition);
    gap: 1.6rem;
}

.title {
    display: inline-flex;
    align-items: center;
    margin: 0;
    font-size: 1.8rem;
    font-weight: 600;
    color: var(--bricks-base-900);
    gap: 0.8rem;
}

.titlePrimary {
    display: inline-flex;
    align-items: center;
    gap: 0.8rem;
}

.logo {
    display: inline-flex;
    transform-origin: left center;
}

.titleDivider {
    color: var(--bricks-base-300);
}

.icon {
    font-size: 1.8rem;
}
</style>
