<script setup lang="ts">
/**
 * @description Пилюля роли в строке учётки: она же и кнопка выбора роли. Меню из
 * трёх ролей, выбор применяется сразу — отдельной формы «редактирование
 * учётки» в разделе нет вовсе, потому что у учётки нет содержимого, только
 * атрибуты, и каждый из них правится там, где показан.
 *
 * Заблокированная роль (своя учётка, последний активный администратор) рисуется
 * НЕ выключенной кнопкой, а кнопкой с `aria-disabled` и объяснением причины:
 * выключенный элемент выпадает из обхода с клавиатуры вместе с причиной, а
 * причина здесь — единственное, что человеку нужно («сначала назначьте второго
 * администратора»). Меню при этом не подключается вовсе: нечего открывать.
 */

// #region Imports
// Types
import type { TBricksBadgeTone } from '../../../ui/base/badge/types';
import type { TBricksUserRole } from '../../../common/types/auth';
import type { IUsersRolePillProps, IUsersRolePillEmits } from '../types/users';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Reka UI
import {
    type AcceptableValue,
    DropdownMenuContent,
    DropdownMenuPortal,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuRoot,
    DropdownMenuTrigger,
} from 'reka-ui';

// Components
import BricksPopoverSurface from '../../../ui/base/popover/BricksPopoverSurface.vue';
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IUsersRolePillProps>(), {
    isLocked: false,
    lockedHint: '',
    isPending: false,
    isOperationLocked: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IUsersRolePillEmits>();
// #endregion

// #region Data
const { t } = useI18n();

/**
 * Порядок ролей в меню — от самых широких прав к самым узким: перечисление,
 * повторяющее матрицу прав, читается как шкала, а не как случайный список.
 */
const ROLE_ORDER: TBricksUserRole[] = ['admin', 'editor', 'viewer'];

/**
 * Тон плашки на роль. Карта, а не цвета в своих стилях: тона живут в ките, а
 * здесь остаётся только соответствие «роль → насколько её надо выделять».
 */
const ROLE_TONE: Record<TBricksUserRole, TBricksBadgeTone> = {
    admin: 'accent',
    editor: 'muted',
    viewer: 'quiet',
};

/*
    Тон редактора — `muted` (`base-100`/`base-600`). Своя пара до переезда в кит
    была `base-100`/`base-700`; `base-500`, который тон нёс сначала, давал на
    `base-100` 4.4:1 — ниже порога AA, поэтому подпись тона поднята до `base-600`
    (6.9:1) в самом ките, а не перекрыта здесь.
*/

/** Меню открыто. Состоянием владеет компонент: открытие бывает отклонено. */
const isMenuOpen = ref<boolean>(false);
// #endregion

// #region Computed
const roleLabel = computed<string>(() => t(`bricks.auth.roles.${props.role}`));

const roleTone = computed<TBricksBadgeTone>(() => ROLE_TONE[props.role]);

/**
 * Доступное имя кнопки: роль, чья она и что с ней можно сделать. Внутри кнопки
 * только слово роли, и без имени владельца скринридер прочитал бы список из
 * одинаковых «Редактор».
 */
const triggerLabel = computed<string>(() => {
    const base = t('bricks.users.role.changeLabel', {
        user: props.userLabel,
        role: roleLabel.value,
    });

    return props.isLocked ? `${base}. ${props.lockedHint}` : base;
});
// #endregion

// #region Methods
/**
 * Открывает и закрывает меню ролей.
 *
 * Открытие отклоняется, пока в разделе идёт операция: операции сериализованы, и
 * выбранная в этот момент роль была бы отброшена молча — меню обещало бы
 * действие, которого не будет. Отклоняется именно открытие, а не сам триггер:
 * выключенная кнопка (в том числе штатным `disabled` у триггера Reka) выпадает
 * из обхода с клавиатуры и уносит с собой фокус.
 *
 * @param isOpen - Запрошенное состояние меню.
 */
function handleMenuOpenChange(isOpen: boolean): void {
    if (isOpen && props.isOperationLocked) {
        return;
    }

    isMenuOpen.value = isOpen;
}

/**
 * Пробрасывает выбранную роль наверх.
 *
 * Значение радио-группы приходит из кита нетипизованным (Reka допускает любой
 * примитив), поэтому сверяется со списком известных ролей: значение мимо списка
 * ушло бы в тело запроса как есть.
 *
 * @param value - Значение выбранного пункта.
 */
function handleSelect(value: AcceptableValue): void {
    const role = ROLE_ORDER.find((item) => item === value);

    if (!role || role === props.role) {
        return;
    }

    emit('select', role);
}
// #endregion
</script>

<template>
    <BricksBadge
        v-if="props.isLocked"
        as="button"
        shape="pill"
        :tone="roleTone"
        :class="[$style.BuilderUsersRolePill, $style._locked]"
        aria-disabled="true"
        :title="props.lockedHint"
        :aria-label="triggerLabel"
    >
        <span>{{ roleLabel }}</span>
        <BricksIcon icon="ta:outline-lock" :class="$style.lockIcon" />
    </BricksBadge>

    <DropdownMenuRoot v-else :open="isMenuOpen" @update:open="handleMenuOpenChange">
        <!--
            Триггер НЕ выключается на время запроса, хотя соблазн есть: выключенная
            кнопка выпадает из обхода, и Reka не может вернуть на неё фокус —
            человек, сменивший роль с клавиатуры, оказывался в начале страницы
            (найдено живой проверкой). От второго запроса защищает не кнопка, а
            занятость раздела: она же отклоняет и открытие меню. Занятость строки
            объявляет её корень (`aria-busy`), а не эта кнопка, — состояние не
            хранит вида операции.
        -->
        <DropdownMenuTrigger as-child>
            <BricksBadge
                as="button"
                shape="pill"
                :tone="roleTone"
                :class="[
                    $style.BuilderUsersRolePill,
                    $style._actionable,
                    props.isPending && $style._pending,
                    props.isOperationLocked && !props.isPending && $style._busy,
                ]"
                :aria-disabled="props.isOperationLocked"
                :aria-label="triggerLabel"
            >
                <span>{{ roleLabel }}</span>
                <BricksIcon icon="ta:outline-chevron-down" :class="$style.chevron" />
            </BricksBadge>
        </DropdownMenuTrigger>

        <DropdownMenuPortal>
            <DropdownMenuContent as-child align="start" :side-offset="6" position="popper">
                <BricksPopoverSurface :class="$style.menu">
                    <DropdownMenuRadioGroup
                        :model-value="props.role"
                        @update:model-value="handleSelect"
                    >
                        <DropdownMenuRadioItem
                            v-for="item in ROLE_ORDER"
                            :key="item"
                            :class="$style.item"
                            :value="item"
                        >
                            <span :class="$style.itemBody">
                                <span :class="$style.itemTitle">{{
                                    t(`bricks.auth.roles.${item}`)
                                }}</span>
                                <span :class="$style.itemDescription">
                                    {{ t(`bricks.users.role.descriptions.${item}`) }}
                                </span>
                            </span>

                            <BricksIcon
                                v-if="item === props.role"
                                icon="ta:outline-check"
                                :class="$style.itemCheck"
                            />
                        </DropdownMenuRadioItem>
                    </DropdownMenuRadioGroup>
                </BricksPopoverSurface>
            </DropdownMenuContent>
        </DropdownMenuPortal>
    </DropdownMenuRoot>
</template>

<style module lang="scss">
/*
    Вид пилюли — плашка кита (`shape="pill"` + тон по роли); здесь остаются только
    состояния: чем она отличается от плашки-подписи, так это тем, что по ней
    щёлкают.
*/
.BuilderUsersRolePill {
    transition:
        background-color var(--bricks-default-transition),
        color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);

    &._actionable {
        cursor: pointer;

        &:focus-visible {
            outline: none;
            box-shadow: var(--bricks-shadow-focus);
        }
    }

    &._locked {
        cursor: default;
    }

    /* Идёт запрос: строка занята, но кнопка остаётся фокусируемой — иначе фокус
       уезжает из списка на время ответа сервера. */
    &._pending {
        opacity: 0.7;
        cursor: progress;
    }

    /* Операция идёт в соседней строке: роль этой сейчас не меняется, но кнопка
       по той же причине остаётся фокусируемой. */
    &._busy {
        opacity: 0.7;
        cursor: default;
    }
}

/* Шеврон появляется на наведении и на фокусе: в покое строка остаётся списком
   данных, а не набором кнопок. Место под него занято всегда — иначе пилюля
   дёргалась бы по ширине под курсором. */
.chevron {
    width: 1.2rem;
    height: 1.2rem;
    opacity: 0;
    transition: opacity var(--bricks-default-transition);

    .BuilderUsersRolePill:hover &,
    .BuilderUsersRolePill:focus-visible &,
    .BuilderUsersRolePill[data-state='open'] & {
        opacity: 1;
    }
}

.lockIcon {
    width: 1.2rem;
    height: 1.2rem;
    color: var(--bricks-primary-400);
}

.menu {
    width: 28rem;
}

.item {
    display: flex;
    align-items: flex-start;
    gap: 0.8rem;
    padding: 0.8rem;
    border-radius: var(--bricks-border-radius-xs);
    transition: background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover,
    &[data-highlighted] {
        background: var(--bricks-base-50);
        outline: none;
    }

    &[data-state='checked'] {
        .itemTitle {
            color: var(--bricks-primary-600);
        }

        .itemDescription {
            color: var(--bricks-primary-500);
        }
    }
}

.itemBody {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.2rem;
}

.itemTitle {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.itemDescription {
    font-size: 1.2rem;
    color: var(--bricks-base-500);
}

.itemCheck {
    flex-shrink: 0;
    width: 1.6rem;
    height: 1.6rem;
    color: var(--bricks-primary-500);
}
</style>
