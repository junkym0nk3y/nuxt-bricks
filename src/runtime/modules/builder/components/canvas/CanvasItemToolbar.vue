<script setup lang="ts">
// #region Imports
// Types
import type { IDeviceVisibilityConfig, TLandingDeviceKey } from '../../../common/types/landing';

// Vue
import { ref, computed } from 'vue';

// Components
import BricksTooltip from '../../../ui/tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../../../ui/tooltip/BricksTooltipHint.vue';
import BricksCheckbox from '../../../ui/base/checkbox/BricksCheckbox.vue';
// #endregion

// #region Interfaces
interface ICanvasItemToolbarProps {
    componentName: string;
    isHidden: boolean;
    isFavorite: boolean;
    deviceVisibility?: Partial<IDeviceVisibilityConfig>;
    canMoveUp: boolean;
    canMoveDown: boolean;
    isInteractivePreview?: boolean;
}

interface ICanvasItemToolbarEmits {
    copy: [];
    delete: [];
    'toggle-hidden': [];
    'toggle-device': [device: TLandingDeviceKey];
    'move-up': [];
    'move-down': [];
    'toggle-favorite': [];
    'toggle-interactive-preview': [];
}
// #endregion

// #region Props
const props = withDefaults(defineProps<ICanvasItemToolbarProps>(), {
    deviceVisibility: undefined,
    isInteractivePreview: false,
});
// #endregion

// #region Emits
const emit = defineEmits<ICanvasItemToolbarEmits>();
// #endregion

// #region Data
const isDeviceDropdownOpen = ref(false);
const isCollapsed = ref(true);
// #endregion

// #region Computed
/**
 * Проверяет видимость компонента на конкретном устройстве.
 */
const deviceMobile = computed<boolean>(() => props.deviceVisibility?.mobile !== false);
const deviceTablet = computed<boolean>(() => props.deviceVisibility?.tablet !== false);
const deviceDesktop = computed<boolean>(() => props.deviceVisibility?.desktop !== false);
// #endregion

// #region Methods
/**
 * Переключает dropdown адаптивов.
 */
function handleToggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    isDeviceDropdownOpen.value = !isDeviceDropdownOpen.value;
}

/**
 * Сворачивает/разворачивает toolbar.
 */
function handleToggleCollapsed(event: MouseEvent): void {
    event.stopPropagation();
    isCollapsed.value = !isCollapsed.value;

    if (isCollapsed.value) {
        isDeviceDropdownOpen.value = false;
    }
}

/**
 * Обрабатывает клик на кнопку копирования.
 */
function handleCopy(event: MouseEvent): void {
    event.stopPropagation();
    emit('copy');
}

/**
 * Обрабатывает клик на кнопку удаления.
 */
function handleDelete(event: MouseEvent): void {
    event.stopPropagation();
    emit('delete');
}

/**
 * Обрабатывает клик на кнопку скрытия.
 */
function handleToggleHidden(event: MouseEvent): void {
    event.stopPropagation();
    emit('toggle-hidden');
}

/**
 * Обрабатывает клик на кнопку перемещения вверх.
 */
function handleMoveUp(event: MouseEvent): void {
    event.stopPropagation();
    emit('move-up');
}

/**
 * Обрабатывает клик на кнопку перемещения вниз.
 */
function handleMoveDown(event: MouseEvent): void {
    event.stopPropagation();
    emit('move-down');
}

/**
 * Обрабатывает клик на кнопку избранного.
 */
function handleToggleFavorite(event: MouseEvent): void {
    event.stopPropagation();
    emit('toggle-favorite');
}

/**
 * Обрабатывает клик на кнопку интерактивного предпросмотра.
 */
function handleToggleInteractivePreview(event: MouseEvent): void {
    event.stopPropagation();
    emit('toggle-interactive-preview');
}
// #endregion
</script>

<template>
    <div
        :class="[$style.CanvasItemToolbar, { [$style._collapsed]: isCollapsed }]"
        data-canvas-toolbar
        @click.stop
        @mousedown.stop
    >
        <!-- Название компонента -->
        <BricksTooltip top>
            <template #activator>
                <button
                    :class="$style.componentName"
                    type="button"
                    :aria-expanded="!isCollapsed"
                    @click="handleToggleCollapsed"
                >
                    <span :class="$style.componentNameText">{{ props.componentName }}</span>
                    <BricksIcon :icon="isCollapsed ? 'ph:caret-left' : 'ph:caret-right'" />
                </button>
            </template>
            <BricksTooltipHint text="Панель инструментов" />
        </BricksTooltip>

        <Transition name="library-canvas-toolbar-accordion">
            <div v-if="!isCollapsed" :class="$style.toolbarContent">
                <!-- Избранное -->
                <div :class="$style.group">
                    <BricksTooltip top>
                        <template #activator>
                            <button
                                :class="[$style.btn, { [$style.btnActive]: props.isFavorite }]"
                                type="button"
                                @click="handleToggleFavorite"
                            >
                                <BricksIcon
                                    :icon="props.isFavorite ? 'ph:star-fill' : 'ph:star'"
                                    :class="{ [$style.starActive]: props.isFavorite }"
                                />
                            </button>
                        </template>
                        <BricksTooltipHint text="В избранное" />
                    </BricksTooltip>
                </div>

                <!-- Интерактивный предпросмотр -->
                <div :class="$style.group">
                    <BricksTooltip top>
                        <template #activator>
                            <button
                                :class="[
                                    $style.btn,
                                    { [$style.btnActive]: props.isInteractivePreview },
                                ]"
                                type="button"
                                @click="handleToggleInteractivePreview"
                            >
                                <BricksIcon icon="ph:cursor-click" />
                            </button>
                        </template>
                        <BricksTooltipHint
                            :text="
                                props.isInteractivePreview
                                    ? 'Выйти из предпросмотра'
                                    : 'Интерактивный предпросмотр'
                            "
                        />
                    </BricksTooltip>
                </div>

                <!-- Копировать / Удалить -->
                <div :class="$style.group">
                    <BricksTooltip top>
                        <template #activator>
                            <button :class="$style.btn" type="button" @click="handleCopy">
                                <BricksIcon icon="ph:copy" />
                            </button>
                        </template>
                        <BricksTooltipHint text="Дублировать" />
                    </BricksTooltip>

                    <BricksTooltip top>
                        <template #activator>
                            <button :class="$style.btn" type="button" @click="handleDelete">
                                <BricksIcon icon="ph:trash" />
                            </button>
                        </template>
                        <BricksTooltipHint text="Удалить" />
                    </BricksTooltip>
                </div>

                <!-- Power + Dropdown -->
                <div :class="$style.group">
                    <BricksTooltip top>
                        <template #activator>
                            <button
                                :class="[$style.btn, { [$style.btnActive]: props.isHidden }]"
                                type="button"
                                @click="handleToggleHidden"
                            >
                                <BricksIcon icon="ph:power" />
                            </button>
                        </template>
                        <BricksTooltipHint :text="props.isHidden ? 'Включить' : 'Отключить'" />
                    </BricksTooltip>

                    <div :class="$style.dropdownWrapper">
                        <button
                            :class="[$style.btn, $style.btnSmall]"
                            type="button"
                            @click="handleToggleDropdown"
                        >
                            <BricksIcon icon="ph:caret-down" />
                        </button>

                        <div v-if="isDeviceDropdownOpen" :class="$style.dropdown" @click.stop>
                            <div :class="$style.dropdownItem">
                                <BricksCheckbox
                                    :value="deviceMobile"
                                    size="sm"
                                    label="Mobile"
                                    @update:value="emit('toggle-device', 'mobile')"
                                />
                            </div>
                            <div :class="$style.dropdownItem">
                                <BricksCheckbox
                                    :value="deviceTablet"
                                    size="sm"
                                    label="Tablet"
                                    @update:value="emit('toggle-device', 'tablet')"
                                />
                            </div>
                            <div :class="$style.dropdownItem">
                                <BricksCheckbox
                                    :value="deviceDesktop"
                                    size="sm"
                                    label="Desktop"
                                    @update:value="emit('toggle-device', 'desktop')"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Вверх / Вниз -->
                <div :class="$style.group">
                    <BricksTooltip top>
                        <template #activator>
                            <button
                                :class="[$style.btn, { [$style.btnDisabled]: !props.canMoveUp }]"
                                :disabled="!props.canMoveUp"
                                type="button"
                                @click="handleMoveUp"
                            >
                                <BricksIcon icon="ph:arrow-up-bold" />
                            </button>
                        </template>
                        <BricksTooltipHint text="Вверх" />
                    </BricksTooltip>

                    <BricksTooltip top>
                        <template #activator>
                            <button
                                :class="[$style.btn, { [$style.btnDisabled]: !props.canMoveDown }]"
                                :disabled="!props.canMoveDown"
                                type="button"
                                @click="handleMoveDown"
                            >
                                <BricksIcon icon="ph:arrow-down-bold" />
                            </button>
                        </template>
                        <BricksTooltipHint text="Вниз" />
                    </BricksTooltip>
                </div>
            </div>
        </Transition>
    </div>
</template>

<style module lang="scss">
.CanvasItemToolbar {
    display: flex;
    align-items: center;
    height: 3.6rem;
    background: transparent;
    white-space: nowrap;
    gap: 0.4rem;
    pointer-events: auto;

    --toolbar-bg: var(--bricks-base-0, #fff);
    --toolbar-border: var(--bricks-base-300, #d1d5db);
    --toolbar-color: var(--bricks-base-500, #4b5563);
    --toolbar-color-hover: var(--bricks-base-900, #111827);
    --toolbar-bg-hover: var(--bricks-base-50, #f9fafb);
    --toolbar-primary: var(--bricks-primary, #4d79e9);
    --toolbar-shadow: 0 0.2rem 0.4rem rgb(0 0 0 / 8%);
    --toolbar-shadow-hover: 0 0.2rem 0.8rem rgb(0 0 0 / 12%);

    transition: opacity var(--default-transition);

    &._collapsed {
        opacity: 0.76;
    }
}

.componentName {
    overflow: hidden;
    display: flex;
    align-items: center;
    max-width: 16rem;
    padding: 0 0.8rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--toolbar-border);
    background: var(--toolbar-bg);
    text-align: left;
    text-overflow: ellipsis;
    font-size: 1.2rem;
    font-weight: 500;
    line-height: 3.6rem;
    color: var(--toolbar-color);
    transition: all 150ms ease;
    cursor: pointer;
    gap: 0.6rem;
    box-shadow: var(--toolbar-shadow);
    user-select: none;

    svg {
        flex-shrink: 0;
        width: 1.4rem;
        height: 1.4rem;
    }

    &:hover {
        border-color: var(--toolbar-color);
        background: var(--toolbar-bg-hover);
        color: var(--toolbar-color-hover);
        box-shadow: var(--toolbar-shadow-hover);
    }
}

.componentNameText {
    overflow: hidden;
    text-overflow: ellipsis;
}

.toolbarContent {
    display: flex;
    align-items: center;
    gap: 0.4rem;
}

.group {
    display: flex;
    align-items: center;
    gap: 0.2rem;
}

.btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.6rem;
    height: 3.6rem;
    padding: 0;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--toolbar-border);
    background: var(--toolbar-bg);
    color: var(--toolbar-color);
    box-shadow: var(--toolbar-shadow);
    transition: all 150ms ease;
    cursor: pointer;

    svg {
        width: 1.8rem;
        height: 1.8rem;
    }

    &:hover:not(.btnDisabled) {
        border-color: var(--toolbar-color);
        background: var(--toolbar-bg-hover);
        color: var(--toolbar-color-hover);
        box-shadow: var(--toolbar-shadow-hover);
    }

    &:active:not(.btnDisabled) {
        transform: scale(0.95);
    }
}

.btnSmall {
    width: 2.8rem;

    svg {
        width: 1.4rem;
        height: 1.4rem;
    }
}

.btnActive {
    border-color: var(--toolbar-primary);
    color: var(--toolbar-primary);

    &:hover {
        border-color: var(--toolbar-primary);
        color: var(--toolbar-primary);
    }
}

.btnDisabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.starActive {
    color: var(--toolbar-primary);
}

.dropdownWrapper {
    position: relative;
}

.dropdown {
    position: absolute;
    top: 100%;
    right: 0;
    z-index: 110;
    margin-top: 0.4rem;
    padding: 0.8rem;
    border-radius: var(--border-radius-sm);
    border: 1px solid var(--toolbar-border);
    background: var(--toolbar-bg);
    box-shadow: var(--toolbar-shadow-hover);
    white-space: nowrap;
}

.dropdownItem {
    padding: 0.4rem 0;
    color: var(--toolbar-color-hover);
    cursor: pointer;

    &:hover {
        color: var(--toolbar-primary);
    }
}
</style>
