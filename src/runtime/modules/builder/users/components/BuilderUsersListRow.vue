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
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
import BricksIconButton from '../../../ui/base/icon-button/BricksIconButton.vue';
import BricksSurfaceCard from '../../../ui/base/surface/BricksSurfaceCard.vue';
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
    <BricksSurfaceCard
        as="article"
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
                <BricksBadge v-if="props.isCurrentUser" shape="pill" tone="muted">
                    {{ selfBadgeLabel }}
                </BricksBadge>
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

        <BricksBadge
            tone="plain"
            :dot="props.user.isActive ? 'positive' : 'neutral'"
            :class="$style.statusCell"
        >
            {{ statusLabel }}
        </BricksBadge>

        <!--
            Кнопки строки гасятся `muted`, а не `disabled` — ни правилом, ни
            занятостью. Причина у двух состояний разная, а следствие одно:
            выключенная кнопка выпадает из обхода с клавиатуры вместе с причиной
            запрета, а на включении входа ещё и теряет фокус посреди операции —
            браузер снимает его с кнопки, и человек оказывается в начале
            страницы. Клик гасит обработчик, а не разметка.
        -->
        <div :class="$style.actions">
            <BricksIconButton
                v-if="isPasswordActionVisible"
                icon="ta:outline-key"
                :label="passwordActionLabel"
                :muted="props.isOperationLocked"
                :busy="props.isPending"
                @click="handlePasswordAction"
            />

            <BricksIconButton
                :icon="props.user.isActive ? 'ta:outline-user-off' : 'ta:outline-user-check'"
                :label="toggleActiveLabel"
                :hint="toggleActiveTitle"
                :muted="isStateActionBlocked"
                :busy="props.isPending"
                @click="handleToggleActive"
            />

            <BricksIconButton
                icon="ta:outline-trash"
                :label="deleteLabel"
                :hint="deleteTitle"
                danger
                :muted="isStateActionBlocked"
                :busy="props.isPending"
                @click="handleDelete"
            />
        </div>
    </BricksSurfaceCard>
</template>

<style module lang="scss">
/* Вид поверхности — из кита (`BricksSurfaceCard`); здесь раскладка строки и её
   состояния: выключенный вход и идущая операция. */
.BuilderUsersListRow {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    min-height: 7.2rem;
    padding: 1.4rem 1.6rem;
    gap: 0.8rem 1.6rem;

    &:hover,
    &:focus-within {
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

        .name {
            color: var(--bricks-base-500);
        }

        .avatar {
            opacity: 0.6;
        }
    }

    &._pending {
        // Курсор ожидания на всей строке: пока идёт операция, ни одно её
        // действие не начнётся вторым. Кнопкам его отдельно объявляет проп
        // `busy` — свой курсор они ставят сами, и наследованием он не перекрылся
        // бы
        cursor: progress;
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
    Логин показан целиком и не обрезается: по нему человек входит и по нему его
    находят. Форма создания держит его коротким, но короткий он не всегда —
    учётку заводят и вручную (CLI печатает INSERT и длину не проверяет), а
    прежние логины длиннее нынешнего предела остаются как есть. Поэтому длинный
    логин переносится ВНУТРИ слова: разрешённый формат допускает строку без
    единого пробела и дефиса, то есть места для штатного переноса в ней может не
    быть вовсе. Перенос делает возможным `max-width` — сжиматься под соседями
    логин по-прежнему не должен (`flex-shrink: 0`, первым обрезается имя), но и
    шире строки быть не может.
*/
.username {
    flex-shrink: 0;
    max-width: 100%;
    font-size: 1.2rem;
    color: var(--bricks-base-400);
    overflow-wrap: anywhere;
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

/* Ширина колонки статуса — своя: плашка кита по умолчанию сжимается по
   содержимому, а колонки строки обязаны совпадать между строками. */
.statusCell {
    width: 13rem;
    gap: 0.8rem;
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
</style>
