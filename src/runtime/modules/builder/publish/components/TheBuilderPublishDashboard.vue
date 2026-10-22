<script setup lang="ts">
/**
 * @description The shell of the dashboard: the header with the search and the primary
 * action, the rail of sections and the body, whose content the host brings in through
 * slots.
 *
 * Decisions held by the markup: the avatar is last in the right group, the way it is
 * in the builder toolbar — it is not an action of the panel but "who is signed in",
 * and outside the database mode it does not draw itself at all. The warning band (a
 * default password) sits between the header and the body: above the rail and the
 * list, yet below the logo so that it does not stand in for the title of the section;
 * the slot is empty the rest of the time and takes up no space.
 *
 * A change of the rail section is a `mode="out-in"` transition with a key on every
 * branch: without the keys Vue reuses one and the same div (the v-if/v-else-if/v-else
 * branches of one tag) and there is no transition at all, while without `out-in` the
 * departing section would overlap the arriving one — the lists of pages and of
 * accounts differ in height. The wrapper is obliged to be a single element:
 * `<Transition>` takes exactly one child, while the pages section consists of the
 * list and the details panel. The media library is laid out like the pages: the grid
 * plus the details panel of the selected file in the same 34rem container — a
 * department of the dashboard rather than a window over it. The accounts section has
 * no details panel, because an account carries no content worth unfolding to the
 * side, and the templates section is a grid of its own across the full width for the
 * same reason (the card is everything known about a template).
 *
 * Decisions held by the style section: `splitArea` repeats the layout of `.main`
 * because it ended up between it and its content — the wrapper was demanded by the
 * transition between the sections.
 */

// #region Imports
// Types
import type {
    IPublishDashboardProps,
    IPublishDashboardEmits,
    TPublishDashboardSection,
} from '../types/dashboard';

// Utils
import { markLeavingInert } from '../../../common/utils/transitionInert';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

// Components
import BuilderAuthProfileMenu from '../../auth/components/BuilderAuthProfileMenu.vue';
import BuilderLogo from '../../core/components/BuilderLogo.vue';
import BuilderPublishDashboardNav from './BuilderPublishDashboardNav.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksSearchInput from '../../../ui/inputs/BricksSearchInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDashboardProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDashboardEmits>();
// #endregion

// #region Data
const { t, locale } = useI18n();
const { canEdit, canManageUsers } = useBuilderPermissions();
// #endregion

// #region Computed
const sectionTitle = computed<string>(() =>
    t(`bricks.publish.dashboard.nav.${props.activeSection}`)
);

const searchPlaceholder = computed<string>(() =>
    t(`bricks.publish.dashboard.search.${props.activeSection}`)
);

/**
 * The primary button of the header belongs to the section rather than to the panel:
 * in the pages it creates a page, in the accounts an account, and in the templates
 * there is none at all — a template is saved from wherever a page already is, a row
 * of the list or the builder, and the templates section has nothing to make one out
 * of. One button for every section would offer to create a page out of a list of
 * people.
 */
const isCreatePageVisible = computed<boolean>(
    () => props.activeSection === 'pages' && canEdit.value
);

const isCreateUserVisible = computed<boolean>(
    () => props.activeSection === 'users' && canManageUsers.value
);

/**
 * The primary action of the media library is uploading files, and the shell does not
 * draw its controls itself: `useMediaUpload`, a hidden file input and the parameters
 * popover trail behind them, that is, the whole media domain inside the shell of the
 * dashboard. They arrive through a slot, while the decision of whether to show them
 * stays here — next to the decisions about the pages and the accounts, so that the
 * rights to the primary action are read in one place.
 */
const isMediaUploadVisible = computed<boolean>(
    () => props.activeSection === 'media' && canEdit.value
);
// #endregion

// #region Methods
/**
 * Passes the input of the search string upwards.
 *
 * @param value - The query that was typed.
 */
function onSearchInput(value: string): void {
    emit('update:searchQuery', value);
}

/**
 * Passes the pick of a rail section through.
 *
 * @param section - Section key.
 */
function handleSelectSection(section: TPublishDashboardSection): void {
    emit('select-section', section);
}

/**
 * Opens the creation of a page.
 */
function handleCreatePage(): void {
    emit('create-page');
}

/**
 * Opens the creation of an account.
 */
function handleCreateUser(): void {
    emit('create-user');
}

/**
 * Opens the documentation.
 */
function handleOpenDocs(): void {
    emit('open-docs');
}

/**
 * Switches the dark and light theme of the interface.
 */
function handleToggleDarkMode(): void {
    emit('toggle-dark-mode');
}

/**
 * Switches the locale of the interface.
 */
function handleToggleLocale(): void {
    emit('toggle-locale');
}

/**
 * Passes the sign-out of the database-auth session upwards.
 */
function handleLogout(): void {
    emit('logout');
}

/**
 * Passes the request for the profile modal upwards: its host mounts it.
 */
function handleOpenProfile(): void {
    emit('open-profile');
}

/**
 * Puts the interactivity of the departing screen out: under `mode="out-in"` it lives
 * in the DOM through the whole leave phase, and the transition is not always caused
 * by a person's click, which means the focus may be inside. The `pointer-events` from
 * transitions.scss closes off the pointer only.
 *
 * @param element - The root element of the departing screen.
 */
function onViewLeave(element: Element): void {
    markLeavingInert(element);
}
// #endregion
</script>

<template>
    <div :class="$style.TheBuilderPublishDashboard">
        <header :class="$style.header">
            <div :class="$style.headerLeft">
                <BuilderLogo :class="$style.logo" :to="null" />
                <h1 :class="$style.title">{{ sectionTitle }}</h1>
            </div>

            <div :class="$style.headerRight">
                <BricksSearchInput
                    :class="$style.search"
                    :value="props.searchQuery"
                    :placeholder="searchPlaceholder"
                    @update:value="onSearchInput"
                />

                <BricksButton
                    v-if="isCreatePageVisible"
                    :class="$style.headerAction"
                    size="md"
                    variant="primary"
                    @click="handleCreatePage"
                >
                    + {{ t('bricks.publish.dashboard.createPage') }}
                </BricksButton>

                <BricksButton
                    v-else-if="isCreateUserVisible"
                    :class="$style.headerAction"
                    size="md"
                    variant="primary"
                    @click="handleCreateUser"
                >
                    + {{ t('bricks.users.createUser') }}
                </BricksButton>

                <slot v-else-if="isMediaUploadVisible" name="headerAction" />

                <BuilderAuthProfileMenu @open-profile="handleOpenProfile" @logout="handleLogout" />
            </div>
        </header>

        <slot name="notice" />

        <div :class="$style.body">
            <BuilderPublishDashboardNav
                :active-section="props.activeSection"
                :pages-count="props.pagesCount"
                :templates-count="props.templatesCount"
                :users-count="props.usersCount"
                :media-count="props.mediaCount"
                :is-users-section-visible="props.isUsersSectionVisible"
                :locale="locale"
                :is-dark-mode="props.isDarkMode"
                @select-section="handleSelectSection"
                @open-docs="handleOpenDocs"
                @toggle-dark-mode="handleToggleDarkMode"
                @toggle-locale="handleToggleLocale"
            />

            <main :class="$style.main">
                <Transition name="bricks-view-switch" mode="out-in" @leave="onViewLeave">
                    <div
                        v-if="props.activeSection === 'pages'"
                        key="pages"
                        :class="$style.splitArea"
                    >
                        <div :class="$style.listArea">
                            <slot name="list" />
                        </div>
                        <Transition name="bricks-details-slide">
                            <aside v-if="$slots.details" :class="$style.detailsArea">
                                <slot name="details" />
                            </aside>
                        </Transition>
                    </div>

                    <div
                        v-else-if="props.activeSection === 'media'"
                        key="media"
                        :class="$style.splitArea"
                    >
                        <div :class="$style.listArea">
                            <slot name="media" />
                        </div>
                        <Transition name="bricks-details-slide">
                            <aside v-if="$slots.mediaDetails" :class="$style.detailsArea">
                                <slot name="mediaDetails" />
                            </aside>
                        </Transition>
                    </div>

                    <div
                        v-else-if="props.activeSection === 'users'"
                        key="users"
                        :class="$style.listArea"
                    >
                        <slot name="users" />
                    </div>

                    <div v-else key="templates" :class="$style.listArea">
                        <slot name="templates" />
                    </div>
                </Transition>
            </main>
        </div>
    </div>
</template>

<style module lang="scss">
.TheBuilderPublishDashboard {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: var(--bricks-base-50);
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    height: 6rem;
    padding: 0 2rem;
    border-bottom: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.headerLeft {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.logo {
    flex-shrink: 0;
    width: 3.2rem;
}

.title {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.headerRight {
    display: flex;
    align-items: center;
    gap: 1.2rem;
}

.search {
    width: 28rem;
}

.headerAction {
    flex-shrink: 0;
    white-space: nowrap;
}

.body {
    overflow: hidden;
    display: flex;
    flex: 1;
}

.main {
    overflow: hidden;
    display: flex;
    flex: 1;
}

.splitArea {
    overflow: hidden;
    display: flex;
    flex: 1;
}

.listArea {
    overflow-y: auto;
    flex: 1;
    padding: 2rem 2.4rem;
}

.detailsArea {
    overflow: hidden;
    display: flex;
    flex-shrink: 0;
    width: 34rem;
    border-left: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    flex-direction: column;
}
</style>
