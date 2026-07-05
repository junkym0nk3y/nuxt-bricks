<script setup lang="ts">
// #region Imports
// Types
import type {
    IPublishDashboardNavProps,
    IPublishDashboardNavEmits,
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

interface INavSection {
    key: TPublishDashboardSection;
    icon: string;
    labelKey: string;
}

const NAV_SECTIONS: INavSection[] = [
    {
        key: 'pages',
        icon: 'ca:document-multiple-02',
        labelKey: 'bricks.publish.dashboard.nav.pages',
    },
    { key: 'templates', icon: 'ph:package', labelKey: 'bricks.publish.dashboard.nav.templates' },
];
// #endregion

// #region Computed
const sectionCounters = computed<Record<TPublishDashboardSection, number>>(() => ({
    pages: props.pagesCount,
    templates: 0,
}));

const darkModeIcon = computed<string>(() => (props.isDarkMode ? 'bs:sun-fill' : 'bs:moon-fill'));

const darkModeLabel = computed<string>(() =>
    props.isDarkMode ? t('bricks.nav.themeLight') : t('bricks.nav.themeDark')
);
// #endregion

// #region Methods
/**
 * Выбирает раздел дашборда.
 *
 * @param section - Ключ раздела.
 */
function handleSelectSection(section: TPublishDashboardSection): void {
    emit('select-section', section);
}

/**
 * Открывает медиа-галерею (Media — действие, не раздел).
 */
function handleOpenMedia(): void {
    emit('open-media');
}

/**
 * Открывает модалку документации.
 */
function handleOpenDocs(): void {
    emit('open-docs');
}

/**
 * Переключает тёмную/светлую тему интерфейса.
 */
function handleToggleDarkMode(): void {
    emit('toggle-dark-mode');
}

/**
 * Переключает локаль интерфейса.
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
                v-for="section in NAV_SECTIONS"
                :key="section.key"
                type="button"
                :class="[$style.item, { [$style._active]: props.activeSection === section.key }]"
                @click="handleSelectSection(section.key)"
            >
                <BricksIcon :icon="section.icon" :class="$style.itemIcon" />
                <span :class="$style.itemLabel">{{ t(section.labelKey) }}</span>
                <span :class="$style.itemCounter">{{ sectionCounters[section.key] }}</span>
            </button>

            <button type="button" :class="$style.item" @click="handleOpenMedia">
                <BricksIcon icon="cd:file-media" :class="$style.itemIcon" />
                <span :class="$style.itemLabel">{{ t('bricks.publish.dashboard.nav.media') }}</span>
            </button>
        </div>

        <div :class="$style.footer">
            <button type="button" :class="$style.item" @click="handleOpenDocs">
                <BricksIcon icon="ph:book-open-text" :class="$style.itemIcon" />
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
    border-radius: var(--border-radius-xs);
    border: none;
    background: transparent;
    text-align: left;
    font-size: 1.4rem;
    color: var(--bricks-base-700);
    transition:
        background-color var(--default-transition),
        color var(--default-transition);
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
    color: var(--bricks-base-400);
}

.localeBadge {
    flex-shrink: 0;
    width: 1.8rem;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: var(--bricks-base-500);
}
</style>
