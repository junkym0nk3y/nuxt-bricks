<script setup lang="ts">
// #region Imports
// Vue
import { computed } from 'vue';

// Components
import BricksTooltip from '../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../ui/tooltip/BricksTooltipHint.vue';
// #endregion

// #region Interfaces
interface IBuilderVerticalNavProps {
    isLibraryActive?: boolean;
    isPropertiesActive?: boolean;
    isSchemaActive?: boolean;
    isPublishSettingsActive?: boolean;
    hasSelectedComponent?: boolean;
    isPublishSettingsComplete?: boolean;
    isDarkMode?: boolean;
}

interface IBuilderVerticalNavEmits {
    toggleLibrary: [];
    toggleProperties: [];
    toggleSchema: [];
    openPublishSettings: [];
    openDocs: [];
    toggleDarkMode: [];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<IBuilderVerticalNavProps>(), {
    isLibraryActive: false,
    isPropertiesActive: false,
    isSchemaActive: false,
    isPublishSettingsActive: false,
    hasSelectedComponent: false,
    isPublishSettingsComplete: true,
    isDarkMode: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBuilderVerticalNavEmits>();
// #endregion

// #region Data
const NAV_ITEMS = [
    {
        key: 'library',
        icon: 'an:outlined-appstore-add',
        label: 'Компоненты',
        event: 'toggleLibrary' as const,
        activeProp: 'isLibraryActive' as const,
    },
    {
        key: 'properties',
        icon: 'ak:settings-horizontal',
        label: 'Свойства',
        event: 'toggleProperties' as const,
        activeProp: 'isPropertiesActive' as const,
    },
    {
        key: 'schema',
        icon: 're:drag-drop-line',
        label: 'Схема',
        event: 'toggleSchema' as const,
        activeProp: 'isSchemaActive' as const,
    },
    {
        key: 'settings',
        icon: 'ph:gear-six',
        label: 'Настройки',
        event: 'openPublishSettings' as const,
        activeProp: 'isPublishSettingsActive' as const,
    },
] as const;
// #endregion

// #region Computed
/**
 * Проверяет, отключена ли кнопка свойств (нет выбранного компонента).
 */
const isPropertiesDisabled = computed<boolean>(() => !props.hasSelectedComponent);

/**
 * Проверяет, нужно ли показывать danger-индикатор на настройках.
 */
const showSettingsDanger = computed<boolean>(() => !props.isPublishSettingsComplete);

/**
 * Возвращает иконку в зависимости от текущей темы.
 */
const darkModeIcon = computed<string>(() => (props.isDarkMode ? 'bs:sun-fill' : 'bs:moon-fill'));

/**
 * Возвращает текст тултипа для переключателя темы.
 */
const darkModeTooltip = computed<string>(() => (props.isDarkMode ? 'Светлая тема' : 'Тёмная тема'));
// #endregion

// #region Data
const EMIT_MAP: Record<string, () => void> = {
    toggleLibrary: () => emit('toggleLibrary'),
    toggleProperties: () => emit('toggleProperties'),
    toggleSchema: () => emit('toggleSchema'),
    openPublishSettings: () => emit('openPublishSettings'),
};
// #endregion

// #region Methods
/**
 * Обрабатывает клик по элементу навигации.
 *
 * @param event - Имя события для emit.
 * @param key - Ключ элемента навигации.
 */
function handleClick(event: string, key: string): void {
    if (key === 'properties' && isPropertiesDisabled.value) {
        return;
    }

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
// #endregion
</script>

<template>
    <nav :class="$style.BuilderVerticalNav">
        <button
            v-for="item in NAV_ITEMS"
            :key="item.key"
            :class="[
                $style.navItem,
                {
                    [$style._active]: props[item.activeProp],
                    [$style._disabled]: item.key === 'properties' && isPropertiesDisabled,
                },
            ]"
            :disabled="item.key === 'properties' && isPropertiesDisabled"
            @click="handleClick(item.event, item.key)"
        >
            <span :class="$style.iconWrapper">
                <BricksLandIcon :class="$style.icon" :icon="item.icon" />
                <span
                    v-if="item.key === 'settings' && showSettingsDanger"
                    :class="$style.dangerDot"
                />
            </span>
            <span :class="$style.label">{{ item.label }}</span>
        </button>

        <div :class="$style.spacer" />

        <BricksTooltip right>
            <template #activator>
                <button :class="$style.themeToggle" @click="handleOpenDocs">
                    <BricksLandIcon :class="$style.icon" icon="ph:book-open-text" />
                </button>
            </template>

            <template #default>
                <BricksTooltipHint text="Документация" />
            </template>
        </BricksTooltip>

        <BricksTooltip right>
            <template #activator>
                <button
                    :class="[$style.themeToggle, { [$style._active]: props.isDarkMode }]"
                    @click="handleToggleDarkMode"
                >
                    <BricksLandIcon :class="$style.icon" :icon="darkModeIcon" />
                </button>
            </template>

            <template #default>
                <BricksTooltipHint :text="darkModeTooltip" />
            </template>
        </BricksTooltip>
    </nav>
</template>

<style module lang="scss">
.BuilderVerticalNav {
    position: relative;
    z-index: 60;
    display: flex;
    align-items: center;
    width: 7.2rem;
    min-width: 7.2rem;
    padding-top: 1.6rem;
    border-right: 1px solid var(--land-base-300);
    background-color: var(--land-base-0);
    flex-direction: column;
    gap: 0.4rem;
}

.navItem {
    display: flex;
    align-items: center;
    width: 6rem;
    padding: 0.8rem 0;
    border-radius: 0.8rem;
    border: none;
    background: transparent;
    font-size: 1rem;
    color: var(--land-base-600);
    transition:
        color var(--default-transition),
        background-color var(--default-transition);
    cursor: pointer;
    flex-direction: column;
    gap: 0.4rem;

    &:hover:not(.\_disabled) {
        background-color: var(--land-base-100);
        color: var(--land-base-900);
    }

    &._active {
        background-color: var(--land-primary-50, rgb(99 102 241 / 8%));
        color: var(--land-primary);
    }

    &._disabled {
        opacity: 0.4;
        cursor: not-allowed;
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
    background-color: var(--land-danger-500);
}

.label {
    white-space: nowrap;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.2;
}

.spacer {
    flex: 1;
}

.themeToggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    margin-bottom: 1.6rem;
    border-radius: 0.8rem;
    border: none;
    background: transparent;
    color: var(--land-base-500);
    transition:
        color var(--default-transition),
        background-color var(--default-transition);
    cursor: pointer;

    &:hover {
        background-color: var(--land-base-100);
        color: var(--land-base-900);
    }

    &._active {
        color: var(--land-yellow);

        &:hover {
            color: var(--land-yellow);
        }
    }
}
</style>
