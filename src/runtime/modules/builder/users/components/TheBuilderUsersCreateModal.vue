<script setup lang="ts">
/**
 * @description Модалка создания учётки: логин, отображаемое имя, пароль, роль и
 * признак «может входить сразу».
 *
 * Форма появляется только там, где нужен ввод: роль и возможность входа
 * существующей учётки правятся прямо в строке списка, поэтому отдельной формы
 * «редактирование пользователя» в разделе нет вовсе.
 *
 * Отображаемое имя задаётся ТОЛЬКО здесь: список должен читаться именами до
 * того, как новые люди впервые войдут, но переписывать чужую подпись потом
 * администратор не может — своё имя и фото человек правит себе сам. Логин же
 * неизменяем вовсе: переименование учётки ломало бы ссылки на автора и журналы.
 *
 * Пароль показывается открыто и генерируется кнопкой: его придётся передать
 * человеку, а после сохранения он не читается нигде — в базе лежит scrypt-хеш.
 */

// #region Imports
// Types
import type { IUsersCreateModalProps, IUsersCreateModalEmits } from '../types/users';
import type { IBrickUiCommonProp } from '../../../ui/types/common';
import type { TBrickDemoValues } from '../../../common/types/brick';
import type { TBricksUserRole } from '../../../common/types/auth';

// Vue
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import {
    BRICKS_DISPLAY_NAME_MAX_LENGTH,
    BRICKS_NEW_USERNAME_MAX_LENGTH,
    BRICKS_PASSWORD_MAX_LENGTH,
    BRICKS_PASSWORD_MIN_LENGTH,
} from '../../../common/constants/auth';

// Composables
import { useUsersCreateForm } from '../composables/useUsersCreateForm';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksCheckbox from '../../../ui/base/checkbox/BricksCheckbox.vue';
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksSelect from '../../../ui/inputs/BricksSelect.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IUsersCreateModalProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IUsersCreateModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();

/** Порядок ролей — от широких прав к узким, как в меню роли в строке. */
const ROLE_ORDER: TBricksUserRole[] = ['admin', 'editor', 'viewer'];

const {
    username,
    displayName,
    password,
    role,
    isActive,
    errors,
    generalError,
    isSubmitting,
    isSubmitSealed,
    generatePassword,
    submitForm,
    resetToEmpty,
} = useUsersCreateForm({
    onCreated: (user) => emit('created', user),
});
// #endregion

// #region Computed
const roleOptions = computed<IBrickUiCommonProp[]>(() =>
    ROLE_ORDER.map((item) => ({ label: t(`bricks.auth.roles.${item}`), value: item }))
);

/** Все роли доступны к выбору: ограничений на роль новой учётки нет. */
const roleFacets = computed<string[]>(() => [...ROLE_ORDER]);
// #endregion

// #region Methods
/**
 * Закрывает модалку.
 */
function handleClose(): void {
    emit('close');
}

/**
 * Принимает выбранную роль. Значение приходит из кита строкой, поэтому сверяется
 * со списком известных ролей: чужое значение ушло бы в тело запроса как есть.
 *
 * @param value - Значение выбранной опции.
 */
function handleSelectRole(value: TBrickDemoValues): void {
    const selected = ROLE_ORDER.find((item) => item === value);

    if (selected) {
        role.value = selected;
    }
}
// #endregion

// #region Lifecycle
// Форма чистится на КАЖДОМ открытии, а не при закрытии: сброс на закрытии стёр
// бы поля прямо под уезжающей модалкой (её держит `force-mount` до конца
// анимации), и человек смотрел бы, как исчезает то, что он ввёл
watch(
    () => props.isOpen,
    (isOpen) => {
        if (isOpen) {
            resetToEmpty();
        }
    }
);
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.isOpen"
        :title="t('bricks.users.createModal.title')"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TheBuilderUsersCreateModal">
            <div :class="$style.header">
                <h3 :class="$style.title">{{ t('bricks.users.createModal.title') }}</h3>
                <BricksCloseButton @click="handleClose" />
            </div>

            <form :class="$style.form" novalidate @submit.prevent="submitForm">
                <div :class="$style.field">
                    <BricksInput
                        :label="t('bricks.users.createModal.username')"
                        :value="username"
                        :max-length="BRICKS_NEW_USERNAME_MAX_LENGTH"
                        :disabled="isSubmitting"
                        :error-message="errors.username"
                        autocomplete="off"
                        @update:value="(value: string) => (username = value)"
                    />
                    <p :class="$style.hint">{{ t('bricks.users.createModal.usernameHint') }}</p>
                </div>

                <div :class="$style.field">
                    <BricksInput
                        :label="t('bricks.users.createModal.displayName')"
                        :value="displayName"
                        :max-length="BRICKS_DISPLAY_NAME_MAX_LENGTH"
                        :disabled="isSubmitting"
                        :error-message="errors.displayName"
                        autocomplete="off"
                        @update:value="(value: string) => (displayName = value)"
                    />
                    <p :class="$style.hint">{{ t('bricks.users.createModal.displayNameHint') }}</p>
                </div>

                <div :class="$style.field">
                    <div :class="$style.passwordRow">
                        <BricksInput
                            :class="$style.passwordInput"
                            :label="t('bricks.users.createModal.password')"
                            :value="password"
                            type="password"
                            autocomplete="new-password"
                            revealable
                            :max-length="BRICKS_PASSWORD_MAX_LENGTH"
                            :disabled="isSubmitting"
                            :error-message="errors.password"
                            @update:value="(value: string) => (password = value)"
                        />

                        <BricksButton
                            :class="$style.generateButton"
                            size="md"
                            variant="secondary"
                            type="button"
                            :disabled="isSubmitting"
                            @click="generatePassword"
                        >
                            {{ t('bricks.users.createModal.generate') }}
                        </BricksButton>
                    </div>
                    <p :class="$style.hint">
                        {{
                            t('bricks.users.createModal.passwordHint', {
                                min: BRICKS_PASSWORD_MIN_LENGTH,
                            })
                        }}
                    </p>
                </div>

                <div :class="$style.field">
                    <span :class="$style.label">{{ t('bricks.users.createModal.role') }}</span>
                    <BricksSelect
                        :value="role"
                        :specs="roleOptions"
                        :facets="roleFacets"
                        :disabled="isSubmitting"
                        :aria-label="t('bricks.users.createModal.role')"
                        @update:value="handleSelectRole"
                    />
                    <p :class="$style.hint">{{ t('bricks.users.createModal.roleHint') }}</p>
                </div>

                <BricksCheckbox
                    :value="isActive"
                    :label="t('bricks.users.createModal.canSignIn')"
                    :disabled="isSubmitting"
                    @update:value="(value: boolean) => (isActive = value)"
                />

                <BricksFieldError :message="generalError" />

                <div :class="$style.footer">
                    <BricksButton
                        size="md"
                        variant="ghost"
                        type="button"
                        :disabled="isSubmitting"
                        @click="handleClose"
                    >
                        {{ t('bricks.common.cancel') }}
                    </BricksButton>

                    <!--
                        Отправка закрыта не только на время запроса, но и после
                        обрыва по потолку ожидания: исход неизвестен, повтор
                        запустил бы второй дорогой запрос и упёрся бы в занятый
                        собственной первой отправкой логин. Отмена рядом при этом
                        остаётся рабочей — модалку обязано быть чем закрыть.
                    -->
                    <BricksButton
                        size="md"
                        variant="primary"
                        type="submit"
                        :disabled="isSubmitting || isSubmitSealed"
                    >
                        {{ t('bricks.users.createModal.submit') }}
                    </BricksButton>
                </div>
            </form>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TheBuilderUsersCreateModal {
    display: flex;
    flex-direction: column;
    width: 52rem;
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    padding: 2rem 2.4rem 1.6rem;
    border-bottom: 1px solid var(--bricks-base-200);
    gap: 1.6rem;
}

.title {
    margin: 0;
    font-size: 1.8rem;
    font-weight: 700;
    color: var(--bricks-base-900);
}

.form {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 2rem 2.4rem 2.4rem;
    gap: 1.6rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
}

.label {
    font-size: 1.2rem;
    font-weight: 600;
    color: var(--bricks-base-700);
}

.hint {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-base-500);
}

/* Кнопка генерации стоит рядом с полем и выровнена по его нижнему краю: поле
   несёт над собой подпись, и выравнивание по верху увело бы кнопку на строку
   лейбла. */
.passwordRow {
    display: flex;
    align-items: flex-end;
    gap: 0.8rem;
}

.passwordInput {
    flex: 1;
    min-width: 0;
}

.generateButton {
    flex-shrink: 0;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-top: 0.4rem;
    gap: 0.8rem;
}
</style>
