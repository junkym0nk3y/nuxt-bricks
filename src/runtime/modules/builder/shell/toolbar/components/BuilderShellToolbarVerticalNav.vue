<script setup lang="ts">
// #region Imports
// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Components
import BricksTooltip from '../../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../../ui/tooltip/BricksTooltipHint.vue';
// #endregion

// #region Interfaces
interface IToolbarVerticalNavProps {
    isLibraryActive?: boolean;
    isSchemaActive?: boolean;
    isPublishSettingsActive?: boolean;
    isPublishSettingsComplete?: boolean;
    isDarkMode?: boolean;
}

interface IToolbarVerticalNavEmits {
    toggleLibrary: [];
    toggleSchema: [];
    openPublishSettings: [];
    openDocs: [];
    toggleDarkMode: [];
    toggleLocale: [];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IToolbarVerticalNavProps>(), {
    isLibraryActive: false,
    isSchemaActive: false,
    isPublishSettingsActive: false,
    isPublishSettingsComplete: true,
    isDarkMode: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IToolbarVerticalNavEmits>();
// #endregion

// #region Data
const { t, locale } = useI18n();

const NAV_ITEMS = [
    {
        key: 'library',
        icon: 'ta:outline-layout-grid-add',
        label: 'bricks.nav.library',
        event: 'toggleLibrary' as const,
        activeProp: 'isLibraryActive' as const,
    },
    {
        key: 'schema',
        icon: 'ta:outline-drag-drop',
        label: 'bricks.nav.schema',
        event: 'toggleSchema' as const,
        activeProp: 'isSchemaActive' as const,
    },
    {
        key: 'settings',
        icon: 'ta:outline-settings',
        label: 'bricks.nav.settings',
        event: 'openPublishSettings' as const,
        activeProp: 'isPublishSettingsActive' as const,
    },
] as const;
// #endregion

// #region Computed
/**
 * Проверяет, нужно ли показывать danger-индикатор на настройках.
 */
const showSettingsDanger = computed<boolean>(() => !props.isPublishSettingsComplete);

/**
 * Возвращает иконку в зависимости от текущей темы.
 */
const darkModeIcon = computed<string>(() =>
    props.isDarkMode ? 'ta:filled-sun' : 'ta:filled-moon'
);

/**
 * Возвращает текст тултипа для переключателя темы.
 */
const darkModeTooltip = computed<string>(() =>
    props.isDarkMode ? t('bricks.nav.themeLight') : t('bricks.nav.themeDark')
);

/**
 * Возвращает метку текущей локали для кнопки переключателя языка.
 */
const localeLabel = computed<string>(() => locale.value.toUpperCase());
// #endregion

// #region Data
const EMIT_MAP: Record<string, () => void> = {
    toggleLibrary: () => emit('toggleLibrary'),
    toggleSchema: () => emit('toggleSchema'),
    openPublishSettings: () => emit('openPublishSettings'),
};
// #endregion

// #region Methods
/**
 * Обрабатывает клик по элементу навигации.
 *
 * @param event - Имя события для emit.
 */
function handleClick(event: string): void {
    EMIT_MAP[event]?.();
}

/**
 * Открывает модальное окно документации.
 */
function handleOpenDocs(): void {
    emit('openDocs');
}

/**
 * Переключает тёмную/светлую тему билдера.
 */
function handleToggleDarkMode(): void {
    emit('toggleDarkMode');
}

/**
 * Переключает локаль интерфейса (ru ⇄ en).
 */
function handleToggleLocale(): void {
    emit('toggleLocale');
}
// #endregion
</script>

<template>
    <nav :class="$style.BuilderShellToolbarVerticalNav">
        <BricksTooltip v-for="item in NAV_ITEMS" :key="item.key" right>
            <template #activator>
                <button
                    :class="[$style.navItem, { [$style._active]: props[item.activeProp] }]"
                    :aria-label="t(item.label)"
                    @click="handleClick(item.event)"
                >
                    <span :class="$style.iconWrapper">
                        <BricksIcon :class="$style.icon" :icon="item.icon" />
                        <span
                            v-if="item.key === 'settings' && showSettingsDanger"
                            :class="$style.dangerDot"
                        />
                    </span>
                </button>
            </template>

            <template #default>
                <BricksTooltipHint :text="t(item.label)" />
            </template>
        </BricksTooltip>

        <div :class="$style.spacer" />

        <BricksTooltip right>
            <template #activator>
                <button
                    :class="$style.themeToggle"
                    :aria-label="t('bricks.nav.docs')"
                    @click="handleOpenDocs"
                >
                    <BricksIcon :class="$style.icon" icon="ta:outline-book" />
                </button>
            </template>

            <template #default>
                <BricksTooltipHint :text="t('bricks.nav.docs')" />
            </template>
        </BricksTooltip>

        <BricksTooltip right>
            <template #activator>
                <button
                    :class="$style.localeToggle"
                    :aria-label="t('bricks.nav.language')"
                    @click="handleToggleLocale"
                >
                    {{ localeLabel }}
                </button>
            </template>

            <template #default>
                <BricksTooltipHint :text="t('bricks.nav.language')" />
            </template>
        </BricksTooltip>

        <BricksTooltip right>
            <template #activator>
                <button
                    :class="[$style.themeToggle, { [$style._active]: props.isDarkMode }]"
                    :aria-label="darkModeTooltip"
                    @click="handleToggleDarkMode"
                >
                    <BricksIcon :class="$style.icon" :icon="darkModeIcon" />
                </button>
            </template>

            <template #default>
                <BricksTooltipHint :text="darkModeTooltip" />
            </template>
        </BricksTooltip>
    </nav>
</template>

<style module lang="scss">
.BuilderShellToolbarVerticalNav {
    position: relative;
    z-index: 60;
    display: flex;
    align-items: center;
    width: 4.8rem;
    min-width: 4.8rem;
    padding-top: 1.6rem;
    padding-bottom: 1.6rem;
    background-color: var(--bricks-base-50);
    flex-direction: column;
    gap: 0.4rem;
}

.navItem {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border-radius: var(--border-radius-control);
    border: none;
    background: transparent;
    color: var(--bricks-base-500);
    transition:
        color var(--default-transition),
        background-color var(--default-transition);
    cursor: pointer;

    &:hover {
        background-color: var(--bricks-surface-raised);
        color: var(--bricks-base-900);
    }

    &._active {
        background-color: var(--bricks-primary);
        color: var(--bricks-static-white);

        &:hover {
            background-color: var(--bricks-primary);
            color: var(--bricks-static-white);
        }
    }
}

.iconWrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
}

.icon {
    font-size: 2rem;
}

.dangerDot {
    position: absolute;
    top: -0.2rem;
    right: -0.2rem;
    width: 0.6rem;
    height: 0.6rem;
    border-radius: 50%;
    background-color: var(--bricks-danger-500);
}

.spacer {
    flex: 1;
}

.localeToggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: 0.8rem;
    border: none;
    background: transparent;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05rem;
    color: var(--bricks-base-500);
    transition:
        color var(--default-transition),
        background-color var(--default-transition);
    cursor: pointer;

    &:hover {
        background-color: var(--bricks-surface-raised);
        color: var(--bricks-base-900);
    }
}

.themeToggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    border-radius: 0.8rem;
    border: none;
    background: transparent;
    color: var(--bricks-base-500);
    transition:
        color var(--default-transition),
        background-color var(--default-transition);
    cursor: pointer;

    &:hover {
        background-color: var(--bricks-base-100);
        color: var(--bricks-base-900);
    }

    &._active {
        color: var(--bricks-yellow);

        &:hover {
            color: var(--bricks-yellow);
        }
    }
}
</style>
