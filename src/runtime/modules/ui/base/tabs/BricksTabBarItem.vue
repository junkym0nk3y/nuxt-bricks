<script setup lang="ts">
/**
 * @description Одна кнопка таб-бара. Отдельным компонентом — чтобы кнопка с
 * тултипом и кнопка без него описывались одной разметкой: тултип оборачивает
 * активатор в собственный элемент, и без выделенного компонента пришлось бы
 * дублировать разметку.
 *
 * Корень — `ToggleGroupItem` из reka-ui: он ставит `aria-pressed`, `tabindex` и
 * `data-state`, поэтому выбранное состояние стили берут из `[data-state='on']`,
 * а не из собственного класса.
 */

// #region Imports
// Types
import type { IBricksTabBarItemProps } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';

// Reka UI
import { ToggleGroupItem } from 'reka-ui';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksTabBarItemProps>(), {
    radius: undefined,
});
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const classList = computed(() => ({
    [$style[`_${props.variant}`]]: true,
    [$style[`_${props.size}`]]: true,
    [$style._primary]: props.tone === 'primary',
    [$style[`_radius${props.radius === 'sm' ? 'Sm' : 'Xs'}`]]: Boolean(props.radius),
    [$style._iconOnly]: props.iconOnly,
    [$style._block]: props.block,
}));

/**
 * Доступное имя кнопки без подписи: в разметке текста нет, поэтому берём его из
 * `label` — он обязателен как раз ради этого случая. Тултип запасным вариантом
 * не служит: он необязателен, и кнопка осталась бы безымянной.
 */
const ariaLabel = computed<string | undefined>(() =>
    props.iconOnly ? props.item.label : undefined
);
// #endregion
</script>

<template>
    <ToggleGroupItem
        :class="[$style.BricksTabBarItem, classList]"
        :value="props.item.value"
        :disabled="props.item.disabled"
        :aria-label="ariaLabel"
    >
        <BricksIcon v-if="props.item.icon" :class="$style.icon" :icon="props.item.icon" />

        <span v-if="!props.iconOnly && props.item.label" :class="$style.text">
            <span>{{ props.item.label }}</span>

            <span v-if="props.item.count !== undefined" :class="$style.count">
                · {{ props.item.count }}
            </span>
        </span>
    </ToggleGroupItem>
</template>

<style module lang="scss">
.BricksTabBarItem {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.8rem;
    border: 1px solid transparent;
    background: transparent;
    white-space: nowrap;
    font-weight: 500;
    line-height: 1.2;
    color: var(--bricks-base-500);
    transition:
        color var(--bricks-default-transition),
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:focus-visible {
        outline: none;
        box-shadow: var(--bricks-shadow-focus);
    }

    &:disabled {
        opacity: 0.6;
        cursor: default;
    }

    &._block {
        flex: 1;
        width: 100%;
    }

    &._sm {
        min-height: 2.8rem;
        padding: 0 1.2rem;
        font-size: 1.2rem;
    }

    &._md {
        min-height: 3.2rem;
        padding: 0 1.6rem;
        font-size: 1.4rem;

        .icon {
            font-size: 1.8rem;
        }
    }

    &._iconOnly {
        padding: 0;

        &._sm {
            width: 2.8rem;
        }

        &._md {
            width: 3.2rem;
        }
    }

    &._segmented {
        /* Таб на 0.2rem меньше дорожки: её паддинг съедает разницу, и внутренний
           угол совпадает с внешним. Иначе пилюля выглядит вписанной криво. */
        border-radius: calc(var(--bricks-border-radius-xs) - 0.2rem);

        &:not([data-state='on'], :disabled):hover {
            background: var(--bricks-base-200);
            color: var(--bricks-base-900);
        }

        &[data-state='on'] {
            background: var(--bricks-base-0);
            box-shadow: var(--bricks-shadow-sm);
            color: var(--bricks-base-900);

            &:focus-visible {
                box-shadow: var(--bricks-shadow-sm), var(--bricks-shadow-focus);
            }

            &._primary {
                background: var(--bricks-primary);
                box-shadow: none;
                color: var(--bricks-static-white);

                &:focus-visible {
                    box-shadow: var(--bricks-shadow-focus);
                }

                .count {
                    color: var(--bricks-static-white);
                }
            }
        }

        &._radiusSm {
            border-radius: var(--bricks-border-radius-sm);
        }
    }

    /* Как у кнопок рядом (`BricksButton variant="ghost"`): фона нет ни у ряда, ни
       у неактивных табов, подложка появляется только под наведением и выбором. */
    &._ghost {
        border-radius: var(--bricks-border-radius-xs);
        color: var(--bricks-base-600);

        &:not([data-state='on'], :disabled):hover {
            background: var(--bricks-surface-raised);
            color: var(--bricks-base-900);
        }

        &[data-state='on'] {
            background: var(--bricks-base-100);
            color: var(--bricks-base-900);

            &._primary {
                background: var(--bricks-primary);
                color: var(--bricks-static-white);

                .count {
                    color: var(--bricks-static-white);
                }
            }
        }

        &._radiusSm {
            border-radius: var(--bricks-border-radius-sm);
        }
    }

    &._outline {
        border-radius: var(--bricks-border-radius-sm);
        border-color: var(--bricks-base-300);
        color: var(--bricks-base-600);

        &:not([data-state='on'], :disabled):hover {
            border-color: var(--bricks-base-400);
            color: var(--bricks-base-900);
        }

        &[data-state='on'] {
            border-color: var(--bricks-primary);
            background: var(--bricks-primary-50);
            color: var(--bricks-primary);
        }

        &._radiusXs {
            border-radius: var(--bricks-border-radius-xs);
        }
    }

    &._underline {
        position: relative;
        border-radius: 0;

        &._sm {
            min-height: 3.2rem;
        }

        &._md {
            min-height: 4rem;
        }

        &:after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: 0.2rem;
            background: var(--bricks-primary);
            transform: scaleX(0);
            transform-origin: left center;
            transition: transform var(--bricks-default-transition);
        }

        &:not([data-state='on'], :disabled):hover {
            color: var(--bricks-base-900);
        }

        &[data-state='on'] {
            color: var(--bricks-primary);

            &:after {
                transform: scaleX(1);
            }
        }
    }
}

.icon {
    font-size: 1.6rem;
}

.text {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
}

.count {
    color: var(--bricks-base-500);
}
</style>
