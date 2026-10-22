<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDashboardNavProps,
    IPublishDashboardNavEmits,
    IPublishDashboardNavSection,
    TPublishDashboardSection,
} from '../types/dashboard';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDashboardNavProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDashboardNavEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const NAV_SECTIONS: IPublishDashboardNavSection[] = [
    {
        key: 'pages',
        icon: 'ta:outline-files',
        labelKey: 'bricks.publish.dashboard.nav.pages',
    },
    {
        key: 'templates',
        icon: 'ta:outline-package',
        labelKey: 'bricks.publish.dashboard.nav.templates',
    },
    {
        key: 'users',
        icon: 'ta:outline-users',
        labelKey: 'bricks.publish.dashboard.nav.users',
    },
    {
        key: 'media',
        icon: 'ta:outline-photo-video',
        labelKey: 'bricks.publish.dashboard.nav.media',
    },
];
// #endregion

// #region Computed
/**
 * The items of the rail: the accounts section is not present in every installation
 * — it is taken away by a role with no right to manage, by the flag being off and
 * by a mode with no accounts at all.
 */
const visibleSections = computed<IPublishDashboardNavSection[]>(() =>
    NAV_SECTIONS.filter((section) => section.key !== 'users' || props.isUsersSectionVisible)
);

/**
 * The counters of the sections. `null` means the value is unknown and the counter
 * is not drawn: for the accounts, the templates and the media library it shows up
 * only after the list has loaded successfully. For the accounts a zero in its place
 * would read as "there are no accounts" (which never happens — somebody did log
 * in), while for the templates and the files a zero is a legitimate value, and what
 * tells it from "not read yet" is exactly the `null`.
 */
const sectionCounters = computed<Record<TPublishDashboardSection, number | null>>(() => ({
    pages: props.pagesCount,
    templates: props.templatesCount,
    users: props.usersCount,
    media: props.mediaCount,
}));

const darkModeIcon = computed<string>(() =>
    props.isDarkMode ? 'ta:filled-sun' : 'ta:filled-moon'
);

const darkModeLabel = computed<string>(() =>
    props.isDarkMode ? t('bricks.nav.themeLight') : t('bricks.nav.themeDark')
);
// #endregion

// #region Methods
/**
 * Picks a section of the dashboard.
 *
 * @param section - Section key.
 */
function handleSelectSection(section: TPublishDashboardSection): void {
    emit('select-section', section);
}

/**
 * Opens the documentation modal.
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
// #endregion
</script>

<template>
    <nav :class="$style.BuilderPublishDashboardNav">
        <div :class="$style.sections">
            <button
                v-for="section in visibleSections"
                :key="section.key"
                type="button"
                :class="[$style.item, { [$style._active]: props.activeSection === section.key }]"
                @click="handleSelectSection(section.key)"
            >
                <BricksIcon :icon="section.icon" :class="$style.itemIcon" />
                <span :class="$style.itemLabel">{{ t(section.labelKey) }}</span>
                <span v-if="sectionCounters[section.key] !== null" :class="$style.itemCounter">
                    {{ sectionCounters[section.key] }}
                </span>
            </button>
        </div>

        <div :class="$style.footer">
            <button type="button" :class="$style.item" @click="handleOpenDocs">
                <BricksIcon icon="ta:outline-book" :class="$style.itemIcon" />
                <span :class="$style.itemLabel">{{ t('bricks.nav.docs') }}</span>
            </button>

            <button type="button" :class="$style.item" @click="handleToggleDarkMode">
                <BricksIcon :icon="darkModeIcon" :class="$style.itemIcon" />
                <span :class="$style.itemLabel">{{ darkModeLabel }}</span>
            </button>

            <button type="button" :class="$style.item" @click="handleToggleLocale">
                <span :class="$style.localeBadge">{{ props.locale.toUpperCase() }}</span>
                <span :class="$style.itemLabel">{{ t('bricks.nav.language') }}</span>
            </button>
        </div>
    </nav>
</template>

<style module lang="scss">
.BuilderPublishDashboardNav {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    width: 23.2rem;
    padding: 1.2rem;
    border-right: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
}

.sections {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.footer {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding-top: 1.2rem;
    border-top: 1px solid var(--bricks-base-200);
}

.item {
    display: flex;
    align-items: center;
    width: 100%;
    height: 3.6rem;
    padding: 0 1rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    text-align: left;
    font-size: 1.4rem;
    color: var(--bricks-base-700);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;
    gap: 1rem;

    &:hover {
        background: var(--bricks-base-50);
        color: var(--bricks-base-900);
    }

    &._active {
        background: var(--bricks-primary-50);
        color: var(--bricks-primary-600);

        .itemCounter {
            color: var(--bricks-primary-500);
        }
    }
}

.itemIcon {
    flex-shrink: 0;
    width: 1.8rem;
    height: 1.8rem;
}

.itemLabel {
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.itemCounter {
    font-size: 1.4rem;
    color: var(--bricks-text-muted);
}

.localeBadge {
    flex-shrink: 0;
    width: 1.8rem;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-500);
}
</style>
