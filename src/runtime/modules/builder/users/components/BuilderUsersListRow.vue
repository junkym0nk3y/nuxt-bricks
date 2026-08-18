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

// Utils
import { formatUserDate, formatUserLoginDate, resolveUserLabel } from '../utils/userFormatting';

// Vue
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useBuilderPermissions } from '../../core/composables/useBuilderPermissions';

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
const { t } = useI18n();
const { canChangePassword } = useBuilderPermissions();
// #endregion

// #region Computed
const userLabel = computed<string>(() => resolveUserLabel(props.user));

/**
 * Логин рядом с именем — только если он отличается от показанного имени: у
 * учётки без отображаемого имени в заголовке и так стоит логин, и повтор
 * выглядел бы как две разные подписи одного человека.
 */
const hasSecondaryUsername = computed<boolean>(() => userLabel.value !== props.user.username);

/**
 * Мета-строка: когда учётку создали и когда по ней входили последний раз.
 *
 * «Ни разу не входил» — не украшение: по нему администратор находит учётки,
 * которые завели и забыли, а именно они и остаются лишним входом в систему.
 */
const metaText = computed<string>(() => {
    const created = t('bricks.users.row.created', {
        date: formatUserDate(props.user.createdAt),
    });
    const login = formatUserLoginDate(props.user.lastLoginAt, {
        today: t('bricks.users.row.today'),
        yesterday: t('bricks.users.row.yesterday'),
    });

    const loginText = login
        ? t('bricks.users.row.lastLogin', { date: login })
        : t('bricks.users.row.neverLoggedIn');

    return `${created} · ${loginText}`;
});

const statusLabel = computed<string>(() =>
    props.user.isActive ? t('bricks.users.status.active') : t('bricks.users.status.inactive')
);

/**
 * Причина, по которой роль не меняется. Своя учётка и последний администратор —
 * разные причины, и общий текст «нельзя» не подсказал бы, что делать: во втором
 * случае достаточно назначить второго администратора.
 */
const roleLockHint = computed<string>(() => {
    if (props.isCurrentUser) {
        return t('bricks.users.row.locks.selfRole');
    }

    return props.isLastActiveAdmin ? t('bricks.users.row.locks.lastAdmin') : '';
});

const isRoleLocked = computed<boolean>(() => roleLockHint.value !== '');

/**
 * Причина, по которой недоступны выключение входа и удаление.
 */
const stateLockHint = computed<string>(() => {
    if (props.isCurrentUser) {
        return t('bricks.users.row.locks.self');
    }

    return props.isLastActiveAdmin ? t('bricks.users.row.locks.lastAdmin') : '';
});

const isStateLocked = computed<boolean>(() => stateLockHint.value !== '');

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
 * Ключ смены пароля: у деактивированной учётки его нет — входить ей всё равно
 * нечем, и заданный пароль ничего не изменит до включения. Флаг установки
 * (`allowPasswordChange`) убирает ключ у всех строк: ручка в такой установке
 * отвечает отказом, и кнопка обещала бы несуществующее.
 */
const isPasswordActionVisible = computed<boolean>(
    () => canChangePassword.value && props.user.isActive
);

/** Подпись кнопки пароля: своя форма и админская — разные операции. */
const passwordActionLabel = computed<string>(() =>
    props.isCurrentUser
        ? t('bricks.users.row.changeOwnPassword')
        : t('bricks.users.row.setPassword', { user: userLabel.value })
);

/** Подпись кнопки входа — по текущему состоянию учётки. */
const toggleActiveLabel = computed<string>(() =>
    props.user.isActive
        ? t('bricks.users.row.deactivate', { user: userLabel.value })
        : t('bricks.users.row.activate', { user: userLabel.value })
);

/**
 * Подсказка кнопки: у заблокированной — причина запрета, у доступной — само
 * действие. Доступное имя при этом остаётся действием всегда: подсказка
 * объясняет, почему кнопка не срабатывает, но не отменяет того, чем она была.
 */
const toggleActiveTitle = computed<string>(() =>
    isStateLocked.value ? stateLockHint.value : toggleActiveLabel.value
);

const deleteLabel = computed<string>(() => t('bricks.users.row.delete', { user: userLabel.value }));

const deleteTitle = computed<string>(() =>
    isStateLocked.value ? stateLockHint.value : deleteLabel.value
);
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
                    {{ t('bricks.users.row.you') }}
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
                :class="[$style.actionButton, props.isOperationLocked && $style._busy]"
                :aria-disabled="props.isOperationLocked"
                :title="passwordActionLabel"
                :aria-label="passwordActionLabel"
                @click="handlePasswordAction"
            >
                <BricksIcon icon="ta:outline-key" />
            </button>

            <button
                type="button"
                :class="[
                    $style.actionButton,
                    isStateLocked && $style._blocked,
                    props.isOperationLocked && $style._busy,
                ]"
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
                    isStateLocked && $style._blocked,
                    props.isOperationLocked && $style._busy,
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

/* Логин не обрезается никогда: по нему человек входит и по нему его находят. */
.username {
    flex-shrink: 0;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
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

    /* В разделе идёт операция: кнопка гасится, но остаётся фокусируемой и
       живой в разметке — выключенная потеряла бы фокус посреди запроса. */
    &._busy {
        opacity: 0.5;
        cursor: default;

        &:hover {
            border-color: var(--bricks-base-200);
            background: var(--bricks-base-0);
            color: var(--bricks-base-500);
        }
    }

    /* Запрет правилом — не «сейчас неприменимо»: кнопка гасится, но остаётся
       фокусируемой, и её подсказка объясняет причину. */
    &._blocked {
        opacity: 0.4;
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

        &._blocked:hover,
        &._busy:hover {
            border-color: var(--bricks-base-200);
            background: var(--bricks-base-0);
            color: var(--bricks-danger-500);
        }
    }
}
</style>
