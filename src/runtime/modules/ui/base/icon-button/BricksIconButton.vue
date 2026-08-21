<script setup lang="ts">
/**
 * @description Кнопка-действие из одного глифа: квадрат с иконкой и тултипом.
 *
 * Тултип здесь не украшение, а единственный способ узнать, что кнопка делает:
 * ряд одинаковых квадратов без подписей не читается ни глазами, ни скринридером.
 * Поэтому подпись — обязательный проп, а не атрибут: забыть её нельзя, тип не
 * даст. Она же становится доступным именем — содержимое тултипа уезжает в портал
 * и именем кнопки не становится.
 *
 * Нативный `title` компонент не ставит намеренно: рядом с настоящим тултипом он
 * даёт вторую подсказку поверх первой, со своей задержкой и своим оформлением.
 *
 * Гашение двух видов, и это не дублирование. `disabled` — обычный запрет, кнопка
 * уходит из обхода с клавиатуры. `muted` — запрет, причину которого человеку
 * надо прочитать: кнопка остаётся фокусируемой, объявляется через
 * `aria-disabled`, клик гасит обработчик. Выключенная `disabled` унесла бы
 * причину из обхода вместе с собой, а на операции, применяющейся сразу, ещё и
 * потеряла бы фокус посреди запроса — браузер снимает его с выключаемой кнопки,
 * и человек оказывается в начале страницы.
 *
 * Внешние атрибуты, включая `class`, достаются ОБЁРТКЕ тултипа, а не кнопке:
 * в потоке стоит и позиционируется снаружи именно обёртка. Триггером тултипа она
 * же и служит — поэтому подсказка показывается даже над `disabled`-кнопкой,
 * которая событий указателя не порождает.
 */

// #region Imports
// Types
import type { IBricksIconButtonProps, IBricksIconButtonEmits } from './types.d.ts';

// Vue
import { computed, useCssModule } from 'vue';

// Components
import BricksTooltip from '../tooltip/BricksTooltip.vue';
import BricksTooltipHint from '../tooltip/BricksTooltipHint.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IBricksIconButtonProps>(), {
    hint: '',
    // Явный `undefined` гасит булево приведение: без него отсутствующий проп
    // стал бы `false`, и `aria-pressed` объявлял бы переключателем каждое
    // обычное действие
    active: undefined,
    // Тем же приёмом, что `active`: отсутствующий проп не должен становиться
    // `false` и вешать `aria-expanded` на кнопку, которая ничего не раскрывает
    expanded: undefined,
    variant: 'outlined',
    size: 'md',
    danger: false,
    disabled: false,
    muted: false,
    busy: false,
    tooltipSide: 'bottom',
});
// #endregion

// #region Emits
const emit = defineEmits<IBricksIconButtonEmits>();
// #endregion

// #region Data
const $style = useCssModule();
// #endregion

// #region Computed
const classList = computed(() => ({
    [$style[`_${props.variant}`]]: true,
    [$style[`_${props.size}`]]: true,
    [$style._danger]: props.danger,
    [$style._active]: props.active === true,
    [$style._muted]: props.muted,
    [$style._busy]: props.busy,
}));

/**
 * Текст подсказки: причина запрета, если она задана, иначе само действие.
 * Доступным именем при этом всегда остаётся действие — подсказка объясняет,
 * почему кнопка не срабатывает, но не отменяет того, чем она была.
 */
const tooltipText = computed<string>(() => props.hint || props.label);
// #endregion

// #region Methods
/**
 * Пробрасывает клик наружу, если кнопка не погашена.
 *
 * @param event - Событие клика.
 */
function handleClick(event: MouseEvent): void {
    if (props.disabled || props.muted) {
        return;
    }

    emit('click', event);
}
// #endregion
</script>

<template>
    <BricksTooltip
        :top="props.tooltipSide === 'top'"
        :bottom="props.tooltipSide === 'bottom'"
        :left="props.tooltipSide === 'left'"
        :right="props.tooltipSide === 'right'"
    >
        <template #activator>
            <button
                type="button"
                :class="[$style.BricksIconButton, classList]"
                :disabled="props.disabled"
                :aria-disabled="props.muted || undefined"
                :aria-pressed="props.active"
                :aria-expanded="props.expanded"
                :aria-haspopup="props.expanded === undefined ? undefined : 'dialog'"
                :aria-label="props.label"
                @click="handleClick"
            >
                <BricksIcon :icon="props.icon" />
            </button>
        </template>

        <BricksTooltipHint :text="tooltipText" />
    </BricksTooltip>
</template>

<style module lang="scss">
.BricksIconButton {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 0;
    border: 1px solid transparent;
    background: transparent;
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

    /* Сторона задаёт и кегль: глиф наследует `font-size` кнопки, и без явного
       значения его размер зависел бы от кегля окружающего текста — та же
       ловушка, из-за которой у `BricksButton` кегль прописан внутри `_equal`. */
    &._sm {
        width: 2rem;
        height: 2rem;
        font-size: 1.4rem;
    }

    &._md {
        width: 2.8rem;
        height: 2.8rem;
        font-size: 1.4rem;
    }

    &._lg {
        width: 3.2rem;
        height: 3.2rem;
        font-size: 1.6rem;
    }

    &._xl {
        width: 4rem;
        height: 4rem;
        font-size: 1.8rem;
    }

    &._outlined {
        border-radius: var(--bricks-border-radius-xs);
        border-color: var(--bricks-base-200);
        background: var(--bricks-base-0);
    }

    &._ghost {
        border-radius: var(--bricks-border-radius-xs);
    }

    /* Приподнятая плашка тулбара: кнопка стоит на фоне самой панели, и без
       собственного фона терялась бы на нём — рамки, как у `outlined`, при этом
       не нужно, её роль играет плашка. Скин повторяет `quiet` у `BricksButton`:
       одно и то же место интерфейса, две разные кнопки. */
    &._quiet {
        border-radius: var(--bricks-border-radius-xs);
        border-color: transparent;
        background: var(--bricks-surface-raised);
    }

    /* Кнопка лежит на тёмной вуали в обеих темах, поэтому цвет статичный:
       `base-900` в тёмной теме стал бы почти белым на почти белом. Глиф крупнее
       остальных — вуаль накрывает миниатюру страницы, и на её фоне 1.4rem
       теряется. */
    &._overlay {
        border-radius: var(--bricks-border-radius-xs);
        font-size: 1.8rem;
        color: var(--bricks-static-white);
    }

    /* Ховер и «нажато» живут под общим запретом: у погашенной кнопки не
       меняется ничего. Внутри блока `._active` стоит ПОСЛЕ `:hover` при равной
       специфичности — у нажатого переключателя наведение не должно сбрасывать
       вид нажатия. */
    &:not(:disabled, ._muted) {
        &._outlined:hover {
            border-color: var(--bricks-base-300);
            background: var(--bricks-base-50);
            color: var(--bricks-base-900);
        }

        &._ghost:hover {
            background: var(--bricks-base-100);
            color: var(--bricks-base-700);
        }

        &._quiet:hover {
            color: var(--bricks-base-900);
        }

        &._overlay:hover {
            background: var(--bricks-overlay-light);
        }

        &._outlined._danger:hover {
            border-color: var(--bricks-danger-500);
            background: var(--bricks-danger-50);
            color: var(--bricks-danger-600);
        }

        &._ghost._danger:hover,
        &._quiet._danger:hover,
        &._overlay._danger:hover {
            background: var(--bricks-danger-50);
            color: var(--bricks-danger-500);
        }

        /* Наведение на нажатый переключатель вида нажатия не сбрасывает:
           парный `:hover`-селектор догоняет по специфичности ховер варианта и
           стоит после него. */
        &._active,
        &._active:hover {
            border-color: var(--bricks-primary);
            background: var(--bricks-primary);
            color: var(--bricks-static-white);
        }
    }

    &._danger {
        color: var(--bricks-danger-500);
    }

    &._overlay._danger {
        color: var(--bricks-static-white);
    }

    /* Запрет правилом и занятость раздела гасят кнопку одинаково: разной
       прозрачностью их всё равно не различить, а причину объясняет подсказка. */
    &:disabled,
    &._muted {
        opacity: 0.5;
        cursor: default;
    }

    /* Над обновляемой строкой честнее ожидание, чем отказ. */
    &._busy {
        cursor: progress;
    }
}
</style>
