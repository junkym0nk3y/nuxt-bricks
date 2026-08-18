<script setup lang="ts">
/**
 * @description Строка учётки: аватар, имя с логином, дата создания и последнего
 * входа, пилюля роли, признак входа и действия.
 *
 * Строка, а не карточка с панелью деталей: у учётки нет содержимого, которое
 * стоило бы разворачивать сбоку, — только атрибуты, и каждый правится там, где
 * показан. Всё, что требует ввода (пароль) или необратимо (удаление), уходит в
 * модалку.
 *
 * Своя строка отличается меткой и составом действий: себя нельзя ни лишить
 * входа, ни удалить — иначе один неверный клик отнимает доступ у того, кто его
 * выдаёт, и вернуть его нечем. Свой пароль при этом меняется отсюда же, но
 * формой профиля: админская ручка чужого пароля текущий не спрашивает, и себе
 * она отказывает намеренно.
 *
 * Занятость объявляет корень строки (`aria-busy`), а не её кнопки: состояние не
 * хранит вида операции, и busy на ключе во время смены роли называл бы занятым
 * то, что не менялось. Комментарием в разметке это не пояснить — комментарий
 * перед корневым узлом делает шаблон фрагментом, и строка перестаёт принимать
 * атрибуты снаружи.
 */

// #region Imports
// Types
import type { TBricksUserRole } from '../../../common/types/auth';
import type { IUsersListRowProps, IUsersListRowEmits } from '../types/users';

// Vue
import { computed } from 'vue';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';
import { useUsersRowLabels } from '../composables/useUsersRowLabels';

// Components
import BricksAvatar from '../../../ui/base/avatar/BricksAvatar.vue';
import BuilderUsersRolePill from './BuilderUsersRolePill.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IUsersListRowProps>(), {
    isCurrentUser: false,
    isLastActiveAdmin: false,
    isPending: false,
    isOperationLocked: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IUsersListRowEmits>();
// #endregion

// #region Data
const { canChangePassword } = useBuilderPermissions();

const {
    userLabel,
    hasSecondaryUsername,
    metaText,
    selfBadgeLabel,
    statusLabel,
    roleLockHint,
    isRoleLocked,
    isStateLocked,
    passwordActionLabel,
    toggleActiveLabel,
    toggleActiveTitle,
    deleteLabel,
    deleteTitle,
} = useUsersRowLabels(props);
// #endregion

// #region Computed
/**
 * Выключение входа и удаление не сработают сейчас: либо запрещены правилом, либо
 * в разделе идёт операция, а операции сериализованы.
 *
 * Оба состояния гасят кнопку одинаково, но объявляются по-разному: запрет
 * правилом постоянен и объясняется подсказкой, занятость длится доли секунды и
 * снимается сама.
 */
const isStateActionBlocked = computed<boolean>(
    () => isStateLocked.value || props.isOperationLocked
);

/**
 * Ключ смены пароля есть и у деактивированной учётки: ручка активность цели не
 * проверяет, а безопасный порядок подготовки к включению — сначала заменить
 * пароль, потом открыть вход. Скрытый ключ навязывал бы обратный: включить
 * учётку со старым (возможно, скомпрометированным) паролем и лишь вторым
 * запросом закрыть дыру.
 *
 * Флаг установки (`allowPasswordChange`) убирает ключ у всех строк: ручка в
 * такой установке отвечает отказом, и кнопка обещала бы несуществующее.
 */
const isPasswordActionVisible = computed<boolean>(() => canChangePassword.value);
// #endregion

// #region Methods
/**
 * Просит сменить роль учётки.
 *
 * @param role - Выбранная роль.
 */
function handleSelectRole(role: TBricksUserRole): void {
    if (props.isOperationLocked) {
        return;
    }

    emit('change-role', props.user, role);
}

/**
 * Открывает форму пароля: свою (профиль) или админскую (чужая учётка).
 *
 * Занятость раздела закрывает и её: сама смена пароля через очередь операций не
 * идёт, но открытая поверх идущей операции форма показывала бы учётку в
 * состоянии, которое вот-вот заменится ответом сервера.
 */
function handlePasswordAction(): void {
    if (props.isOperationLocked) {
        return;
    }

    if (props.isCurrentUser) {
        emit('change-own-password');
        return;
    }

    emit('set-password', props.user);
}

/**
 * Переключает возможность входа: выключение спрашивает подтверждение у хоста,
 * включение применяется сразу.
 */
function handleToggleActive(): void {
    if (isStateActionBlocked.value) {
        return;
    }

    if (props.user.isActive) {
        emit('deactivate', props.user);
        return;
    }

    emit('activate', props.user);
}

/**
 * Просит удалить учётку.
 */
function handleDelete(): void {
    if (isStateActionBlocked.value) {
        return;
    }

    emit('delete', props.user);
}
// #endregion
</script>

<template>
    <article
        :class="[
            $style.BuilderUsersListRow,
            !props.user.isActive && $style._inactive,
            props.isPending && $style._pending,
        ]"
        :aria-busy="props.isPending"
    >
        <BricksAvatar
            :class="$style.avatar"
            size="md"
            :name="userLabel"
            :image-url="props.user.avatarUrl"
        />

        <div :class="$style.main">
            <div :class="$style.titleRow">
                <h3 :class="$style.name">{{ userLabel }}</h3>
                <span v-if="hasSecondaryUsername" :class="$style.username">
                    {{ props.user.username }}
                </span>
                <span v-if="props.isCurrentUser" :class="$style.selfBadge">
                    {{ selfBadgeLabel }}
                </span>
            </div>
            <p :class="$style.meta">{{ metaText }}</p>
        </div>

        <div :class="$style.roleCell">
            <BuilderUsersRolePill
                :role="props.user.role"
                :is-locked="isRoleLocked"
                :locked-hint="roleLockHint"
                :is-pending="props.isPending"
                :is-operation-locked="props.isOperationLocked"
                :user-label="userLabel"
                @select="handleSelectRole"
            />
        </div>

        <div :class="$style.statusCell">
            <span :class="[$style.statusDot, props.user.isActive && $style['statusDot--active']]" />
            <span :class="$style.statusLabel">{{ statusLabel }}</span>
        </div>

        <!--
            Ни одна кнопка строки не выключается через `disabled` — ни правилом,
            ни занятостью. Причина у двух состояний разная, а следствие одно:
            выключенная кнопка выпадает из обхода с клавиатуры вместе с причиной
            запрета, а на включении входа ещё и теряет фокус посреди операции —
            браузер снимает его с кнопки, и человек оказывается в начале
            страницы. Клик гасится обработчиком, а не разметкой.
        -->
        <div :class="$style.actions">
            <button
                v-if="isPasswordActionVisible"
                type="button"
                :class="[$style.actionButton, props.isOperationLocked && $style._muted]"
                :aria-disabled="props.isOperationLocked"
                :title="passwordActionLabel"
                :aria-label="passwordActionLabel"
                @click="handlePasswordAction"
            >
                <BricksIcon icon="ta:outline-key" />
            </button>

            <button
                type="button"
                :class="[$style.actionButton, isStateActionBlocked && $style._muted]"
                :aria-disabled="isStateActionBlocked"
                :title="toggleActiveTitle"
                :aria-label="toggleActiveLabel"
                @click="handleToggleActive"
            >
                <BricksIcon
                    :icon="props.user.isActive ? 'ta:outline-user-off' : 'ta:outline-user-check'"
                />
            </button>

            <button
                type="button"
                :class="[
                    $style.actionButton,
                    $style['actionButton--danger'],
                    isStateActionBlocked && $style._muted,
                ]"
                :aria-disabled="isStateActionBlocked"
                :title="deleteTitle"
                :aria-label="deleteLabel"
                @click="handleDelete"
            >
                <BricksIcon icon="ta:outline-trash" />
            </button>
        </div>
    </article>
</template>

<style module lang="scss">
.BuilderUsersListRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    min-height: 7.2rem;
    padding: 1.4rem 1.6rem;
    border-radius: var(--bricks-border-radius-sm);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    transition:
        border-color var(--bricks-default-transition),
        box-shadow var(--bricks-default-transition);
    gap: 0.8rem 1.6rem;

    &:hover,
    &:focus-within {
        border-color: var(--bricks-primary-300);
        box-shadow: var(--bricks-shadow-sm);

        .actions {
            opacity: 1;
        }
    }

    /*
        Приглушается не вся строка, а её данные: `opacity` на контейнере унесла
        бы вместе с ними и кнопку включения — единственное, зачем к такой строке
        возвращаются, — и рамку фокуса на ней.
    */
    &._inactive {
        background: var(--bricks-base-50);

        .name,
        .statusLabel {
            color: var(--bricks-base-500);
        }

        .avatar {
            opacity: 0.6;
        }
    }

    &._pending {
        // Курсор ожидания на всей строке: пока идёт операция, ни одно её
        // действие не начнётся вторым
        cursor: progress;

        // Перекрывает `default` временной недоступности: над обновляемой
        // строкой честнее ожидание, чем отказ
        .actionButton {
            cursor: progress;
        }
    }
}

.main {
    display: flex;

    // basis 24rem — порог переноса: роль, статус и действия уходят на вторую
    // строку целой группой, не разрывая имя с датами
    flex: 1 1 24rem;
    flex-direction: column;
    gap: 0.4rem;
    min-width: 0;
}

.titleRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.4rem 0.8rem;
    min-width: 0;
}

.name {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

/*
    Логин не обрезается никогда: по нему человек входит и по нему его находят.
    Поэтому длинный логин переносится ВНУТРИ слова, а не выезжает за строку:
    паттерн допускает 64 символа без единого пробела и дефиса, то есть места для
    штатного переноса в нём может не быть вовсе. `max-width` здесь и делает
    перенос возможным: сжиматься под соседями логин по-прежнему не должен
    (`flex-shrink: 0` — первым обрезается имя), но и шире строки быть не может.
*/
.username {
    flex-shrink: 0;
    max-width: 100%;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
    overflow-wrap: anywhere;
}

.selfBadge {
    flex-shrink: 0;
    padding: 0.2rem 0.8rem;
    border-radius: var(--bricks-border-radius-pill);
    background: var(--bricks-base-100);
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--bricks-base-500);
}

.meta {
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
}

.roleCell {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: 21rem;
}

.statusCell {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    width: 13rem;
    gap: 0.8rem;
}

.statusDot {
    flex-shrink: 0;
    width: 0.8rem;
    height: 0.8rem;
    border-radius: 50%;
    background: var(--bricks-base-300);

    &--active {
        background: var(--bricks-green);
    }
}

.statusLabel {
    font-size: 1.3rem;
    color: var(--bricks-base-500);
}

/*
    Действия проявляются на наведении и на фокусе внутри строки, но из потока не
    уходят: `display: none` вынес бы их из обхода с клавиатуры, то есть без мыши
    раздел стал бы нерабочим. На устройствах без наведения они видны всегда.
*/
.actions {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
    gap: 0.6rem;
    opacity: 0;
    transition: opacity var(--bricks-default-transition);

    @media (hover: none) {
        opacity: 1;
    }
}

.actionButton {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.8rem;
    height: 2.8rem;
    padding: 0;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    font-size: 1.4rem;
    color: var(--bricks-base-500);
    transition:
        color var(--bricks-default-transition),
        border-color var(--bricks-default-transition),
        background-color var(--bricks-default-transition);
    cursor: pointer;

    &:hover {
        border-color: var(--bricks-base-300);
        background: var(--bricks-base-50);
        color: var(--bricks-base-900);
    }

    /* Кнопка гашена: запретом правила (постоянный, объяснён подсказкой) либо
       занятостью раздела (доли секунды, снимается сама). Вид у двух причин
       один: разной прозрачностью их всё равно не различить, а объясняет
       причину подсказка. Выключенной кнопка не становится ни в одном из них —
       выключенная выпала бы из обхода с клавиатуры и потеряла фокус посреди
       запроса. */
    &._muted {
        opacity: 0.5;
        cursor: default;

        &:hover {
            border-color: var(--bricks-base-200);
            background: var(--bricks-base-0);
            color: var(--bricks-base-500);
        }
    }

    &--danger {
        color: var(--bricks-danger-500);

        &:hover {
            border-color: var(--bricks-danger-500);
            background: var(--bricks-danger-50);
            color: var(--bricks-danger-600);
        }

        &._muted:hover {
            border-color: var(--bricks-base-200);
            background: var(--bricks-base-0);
            color: var(--bricks-danger-500);
        }
    }
}
</style>
