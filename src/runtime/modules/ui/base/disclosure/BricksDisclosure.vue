<script setup lang="ts">
/**
 * @description Складная секция: строка-заголовок с шевроном и содержимое под
 * ней. Содержимое монтируется только на открытии — секции в проекте тянут
 * данные (список версий) и держат файловый инпут, поэтому скрывать их атрибутом
 * `hidden` значило бы держать это живым в закрытом состоянии.
 *
 * Состояние контролируемое: три из четырёх мест, откуда секция собрана,
 * открывают её сами (маршрутизация раскрывается, если у страницы задан префикс;
 * версии закрываются при смене страницы), то есть владеть открытостью компонент
 * не может.
 *
 * `aria-expanded` и `aria-controls` — то, чего не было ни в одной из копий: без
 * них скринридер читал заголовок как обычную кнопку и не сообщал, что она
 * что-то раскрывает. `aria-controls` привязывается только в открытом состоянии:
 * в закрытом содержимого в разметке нет, и ссылка вела бы в пустоту.
 */

// #region Imports
// Types
import type { IBricksDisclosureProps, IBricksDisclosureEmits } from './types.d.ts';

// Vue
import { useId } from 'vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksDisclosureProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IBricksDisclosureEmits>();
// #endregion

// #region Data
/**
 * Идентификатор содержимого для `aria-controls`. `useId` здесь на месте — он
 * решает ровно задачу стабильного между сервером и клиентом id DOM-атрибута
 * (в отличие от персистируемых id схемы, где он не годится).
 */
const contentId = useId();
// #endregion

// #region Methods
/**
 * Просит хозяина состояния перевернуть открытость.
 */
function handleToggle(): void {
    emit('update:value', !props.value);
}
// #endregion
</script>

<template>
    <div :class="$style.BricksDisclosure">
        <div :class="$style.head">
            <button
                type="button"
                :class="$style.toggle"
                :aria-expanded="props.value"
                :aria-controls="props.value ? contentId : undefined"
                @click="handleToggle"
            >
                <BricksIcon
                    icon="ta:outline-chevron-right"
                    :class="[$style.caret, props.value && $style._open]"
                />
                {{ props.label }}
            </button>

            <slot name="actions" />
        </div>

        <div v-if="props.value" :id="contentId">
            <slot />
        </div>
    </div>
</template>

<style module lang="scss">
.BricksDisclosure {
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
}

.head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
}

.toggle {
    display: flex;
    align-items: center;
    padding: 0;
    border: none;
    background: transparent;
    font-size: 1.2rem;
    font-weight: 500;
    color: var(--bricks-base-600);
    transition: color var(--bricks-default-transition);
    cursor: pointer;
    gap: 0.6rem;

    &:hover {
        color: var(--bricks-base-900);
    }

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }
}

.caret {
    width: 1.2rem;
    height: 1.2rem;
    transition: transform var(--bricks-default-transition);

    &._open {
        transform: rotate(90deg);
    }
}
</style>
