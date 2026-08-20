<script setup lang="ts">
// #region Imports
// Types
import type { IPublishDeviceAddMenuEmits, IPublishDeviceAddMenuProps } from '../types/devices';

// Vue
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Utils
import { resolveDeviceIcon } from '../../../common/utils/bricks/devices';

// Components
import BricksPopoverSurface from '../../../ui/base/popover/BricksPopoverSurface.vue';
import BricksMenuItem from '../../../ui/base/popover/BricksMenuItem.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IPublishDeviceAddMenuProps>(), {
    disabled: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IPublishDeviceAddMenuEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const isOpen = ref(false);
const rootRef = ref<HTMLElement | null>(null);
// #endregion

// #region Methods
/**
 * Открывает или закрывает меню выбора устройства.
 */
function handleToggle(): void {
    if (props.disabled) {
        return;
    }

    isOpen.value = !isOpen.value;
}

/**
 * Выбирает устройство каталога и закрывает меню.
 *
 * @param key - Ключ устройства каталога.
 */
function handleSelect(key: string): void {
    emit('select', key);
    isOpen.value = false;
}

/**
 * Закрывает меню по клику вне его области.
 *
 * @param event - Событие указателя.
 */
function handleOutside(event: MouseEvent): void {
    if (isOpen.value && !rootRef.value?.contains(event.target as Node)) {
        isOpen.value = false;
    }
}

/**
 * Закрывает меню по Escape, не давая событию закрыть саму модалку.
 *
 * @param event - Событие клавиатуры.
 */
function handleEscape(event: KeyboardEvent): void {
    if (event.key === 'Escape' && isOpen.value) {
        event.stopPropagation();
        isOpen.value = false;
    }
}
// #endregion

// #region Lifecycle
onMounted(() => {
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape, true);
});

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', handleOutside);
    document.removeEventListener('keydown', handleEscape, true);
});
// #endregion
</script>

<template>
    <div ref="rootRef" :class="$style.BuilderPublishDeviceAddMenu">
        <button
            type="button"
            :class="$style.trigger"
            :disabled="props.disabled"
            :aria-expanded="isOpen"
            @click="handleToggle"
        >
            <BricksIcon :class="$style.triggerGlyph" icon="ta:outline-plus" />
            <span>{{ t('bricks.devices.add') }}</span>
            <span :class="$style.counter">{{ props.counter }}</span>
        </button>

        <BricksPopoverSurface v-if="isOpen" layer="local" :class="$style.menu" role="listbox">
            <BricksMenuItem
                v-for="choice in props.choices"
                :key="choice.key"
                role="option"
                :aria-selected="false"
                :icon="resolveDeviceIcon(choice.icon)"
                :label="choice.label"
                :hint="String(choice.width)"
                @click="handleSelect(choice.key)"
            />
        </BricksPopoverSurface>
    </div>
</template>

<style module lang="scss">
.BuilderPublishDeviceAddMenu {
    position: relative;
}

.trigger {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 3.8rem;
    padding: 0 1rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px dashed var(--bricks-base-300);
    background: none;
    font-size: 1.3rem;
    color: var(--bricks-base-500);
    transition: var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.8rem;

    &:hover:not(:disabled) {
        border-color: var(--bricks-base-400);
        color: var(--bricks-base-600);
    }

    &:disabled {
        color: var(--bricks-base-300);
        cursor: default;
    }
}

.triggerGlyph {
    font-size: 1.6rem;
}

.counter {
    font-size: 1.1rem;
    color: var(--bricks-base-400);
}

.menu {
    position: absolute;
    top: calc(100% + 0.4rem);
    left: 50%;
    display: flex;
    width: 24rem;
    flex-direction: column;
    gap: 0.2rem;
    transform: translateX(-50%);
}
</style>
