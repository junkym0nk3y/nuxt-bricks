<script setup lang="ts">
/**
 * @description Vertical rail down the left edge of the workspace: the builder
 * sections at the top, and documentation, interface language and the theme toggle at
 * the bottom.
 *
 * Every rail button shares one look. There used to be three near-identical style
 * blocks and they had drifted apart: the theme toggle took `base-100` on hover
 * instead of `surface-raised` (the same `#f3f4f6` in the light theme, different
 * tones in the dark one, so that button lit up unlike its neighbors), two of the
 * three carried the radius as a number instead of a token, and the documentation
 * button wore the `themeToggle` class. The lit theme toggle is the one state painted
 * as a glyph rather than a fill: it reports the position of a switch, not a selected
 * section.
 */

// #region Imports
// Types
import type { IToolbarVerticalNavProps, IToolbarVerticalNavEmits } from '../types/components';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../../core/composables/useBuilderPermissions';

// Components
import BricksTooltip from '../../../../ui/base/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../../ui/base/tooltip/BricksTooltipHint.vue';
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
const { canEdit } = useBuilderPermissions();

/**
 * Sections of the rail. `isEditing` marks a section that exists for editing only: the
 * component library is the source of drag and drop, and the publish settings edit the
 * address and the meta description of the page. The schema tree stays for everybody —
 * it is navigation over the canvas.
 */
const NAV_ITEMS = [
    {
        key: 'library',
        icon: 'ta:outline-layout-grid-add',
        label: 'bricks.nav.library',
        event: 'toggleLibrary' as const,
        activeProp: 'isLibraryActive' as const,
        isEditing: true,
    },
    {
        key: 'schema',
        icon: 'ta:outline-drag-drop',
        label: 'bricks.nav.schema',
        event: 'toggleSchema' as const,
        activeProp: 'isSchemaActive' as const,
        isEditing: false,
    },
    {
        key: 'settings',
        icon: 'ta:outline-settings',
        label: 'bricks.nav.settings',
        event: 'openPublishSettings' as const,
        activeProp: 'isPublishSettingsActive' as const,
        isEditing: true,
    },
] as const;
// #endregion

// #region Computed
/** Sections available to the current role */
const navItems = computed<readonly (typeof NAV_ITEMS)[number][]>(() =>
    NAV_ITEMS.filter((item) => canEdit.value || !item.isEditing)
);

/**
 * Whether the danger dot has to be shown on the settings section.
 */
const showSettingsDanger = computed<boolean>(() => !props.isPublishSettingsComplete);

/**
 * Icon of the theme toggle, picked by the theme currently on.
 */
const darkModeIcon = computed<string>(() =>
    props.isDarkMode ? 'ta:filled-sun' : 'ta:filled-moon'
);

/**
 * Tooltip of the theme toggle — the theme the click switches to.
 */
const darkModeTooltip = computed<string>(() =>
    props.isDarkMode ? t('bricks.nav.themeLight') : t('bricks.nav.themeDark')
);

/**
 * Label of the language button: the current locale in upper case.
 */
const localeLabel = computed<string>(() => locale.value.toUpperCase());

/**
 * Accessible name of the language button. It carries the code the button shows as well:
 * a name that leaves out the visible text fails voice control, where a person says what
 * they see, and it reads the same as the dashboard button with the code and the caption.
 */
const localeAriaLabel = computed<string>(() => `${localeLabel.value} ${t('bricks.nav.language')}`);
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
 * Handles a click on a navigation item.
 *
 * @param event - Name of the event to emit.
 */
function handleClick(event: string): void {
    EMIT_MAP[event]?.();
}

/**
 * Asks for the documentation modal.
 */
function handleOpenDocs(): void {
    emit('openDocs');
}

/**
 * Asks to switch the builder between the dark and the light theme.
 */
function handleToggleDarkMode(): void {
    emit('toggleDarkMode');
}

/**
 * Asks to switch the interface locale (ru ⇄ en).
 */
function handleToggleLocale(): void {
    emit('toggleLocale');
}
// #endregion
</script>

<template>
    <nav :class="$style.BuilderShellToolbarVerticalNav">
        <BricksTooltip v-for="item in navItems" :key="item.key" right>
            <template #activator>
                <button
                    :class="[$style.railButton, { [$style._active]: props[item.activeProp] }]"
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
                    :class="$style.railButton"
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
                    :class="[$style.railButton, $style._locale]"
                    :aria-label="localeAriaLabel"
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
                    :class="[$style.railButton, { [$style._lit]: props.isDarkMode }]"
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
    width: 5.4rem;
    padding-top: 1.4rem;
    padding-bottom: 1.6rem;
    background-color: var(--bricks-surface-rail);
    flex-direction: column;
    gap: 0.4rem;
}

.railButton {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-control);
    border: none;
    background: transparent;
    color: var(--bricks-base-500);
    transition:
        color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        background-color: var(--bricks-surface-raised);
        color: var(--bricks-base-900);
    }

    &._active,
    &._active:hover {
        background-color: var(--bricks-primary);
        color: var(--bricks-static-white);
    }

    &._lit,
    &._lit:hover {
        background-color: transparent;
        color: var(--bricks-yellow);
    }

    &._locale {
        font-size: var(--bricks-font-size-sm);
        font-weight: 600;
        letter-spacing: 0.05rem;
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
</style>
