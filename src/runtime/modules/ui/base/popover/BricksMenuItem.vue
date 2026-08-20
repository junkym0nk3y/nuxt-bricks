<script setup lang="ts">
/**
 * @description Строка меню внутри `BricksPopoverSurface`: глиф, подпись и
 * необязательное значение справа.
 *
 * Фон наведения — `base-50` на всех: до выделения компонента у одной и той же
 * роли встречались `base-50`, `base-100` и `surface-raised`, причём последние два
 * — один и тот же цвет под разными именами.
 *
 * Корень — `button`, а не `div`: пункт всегда что-то делает, и с кнопкой он
 * попадает в обход с клавиатуры без `tabindex` руками. С пунктами reka
 * составляется через `as-child` — тогда `role="menuitem"` и обработчик выбора
 * приезжают на эту же кнопку.
 *
 * Контекстное меню канваса на этот компонент НЕ переводится: у него своё
 * оформление наведения (заливка `primary` с белой подписью, как у системных
 * контекстных меню), и сводить его к нейтральному значило бы менять дизайн, а не
 * убирать дубль.
 */

// #region Imports
// Types
import type { IBricksMenuItemProps, IBricksMenuItemEmits } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksMenuItemProps>(), {
    icon: '',
    hint: '',
    active: false,
    disabled: false,
    danger: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksMenuItemEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const rootClasses = computed(() => [
    $style.BricksMenuItem,
    {
        [$style._active]: props.active,
        [$style._danger]: props.danger,
    },
]);
// #endregion

// #region Methods
/**
 * Пробрасывает клик наружу.
 *
 * @param event - MouseEvent.
 */
function handleClick(event: MouseEvent): void {
    emit('click', event);
}
// #endregion
</script>

<template>
    <button type="button" :class="rootClasses" :disabled="props.disabled" @click="handleClick">
        <BricksIcon v-if="props.icon" :icon="props.icon" :class="$style.icon" />

        <span :class="$style.label">{{ props.label }}</span>

        <span v-if="props.hint" :class="$style.hint">{{ props.hint }}</span>
    </button>
</template>

<style module lang="scss">
.BricksMenuItem {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: 3.6rem;
    padding: 0 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    border: none;
    background: transparent;
    font-size: 1.4rem;
    color: var(--bricks-base-700);
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.8rem;

    /* `data-highlighted` ставит reka при переходе по меню с клавиатуры — без него
       клавиатурный обход не был бы виден вовсе. */
    &:hover,
    &[data-highlighted] {
        background: var(--bricks-base-50);
        outline: none;
        color: var(--bricks-base-900);
    }

    &._active {
        color: var(--bricks-primary-600);

        .icon {
            color: var(--bricks-primary-500);
        }
    }

    &._danger {
        color: var(--bricks-danger-500);

        .icon {
            color: var(--bricks-danger-500);
        }
    }

    &:disabled {
        color: var(--bricks-base-400);
        cursor: not-allowed;

        .icon {
            color: var(--bricks-base-300);
        }
    }
}

.icon {
    flex-shrink: 0;
    width: 1.8rem;
    height: 1.8rem;
    font-size: 1.8rem;
    color: var(--bricks-base-500);
}

.label {
    overflow: hidden;
    flex: 1;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.hint {
    flex-shrink: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}
</style>
