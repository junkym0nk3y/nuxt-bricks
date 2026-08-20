<script setup lang="ts">
/**
 * @description Вкладка «Пароль»: смена своего пароля.
 *
 * Текущий пароль спрашивается всегда — иначе украденная кука сама меняла бы
 * пароль, то есть отбирала учётку насовсем. Его несовпадение приходит с кодом
 * `INVALID_CURRENT_PASSWORD` и статусом 400 (не 401) ровно для того, чтобы
 * подсказка встала под поле: на 401 клиентский интерцептор увёл бы человека с
 * рабочей сессией на форму логина.
 *
 * Успех рвёт ВСЕ сессии, включая текущую, и гасит cookie тем же ответом —
 * поэтому форма не «сохраняет и закрывается», а уводит на вход полной
 * перезагрузкой. Отдать это случайному следующему запросу нельзя: человек
 * остался бы в интерфейсе, который молча перестал работать. Чекбокса «завершить
 * остальные сессии» здесь нет намеренно — это не опция, а обещание ручки.
 */

// #region Imports
// Types
import type { IAuthOwnPasswordFormValues, IAuthProfilePasswordFormEmits } from '../types/auth';

// Utils
import { isInvalidCurrentPasswordError, resolveOwnPasswordErrorKey } from '../utils/profileErrors';
import { createAuthOwnPasswordValidationSchema } from '../utils/validationSchema';

// Vue
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Vee-validate
import { useForm } from 'vee-validate';

// Constants
import {
    BRICKS_PASSWORD_MAX_LENGTH,
    BRICKS_PASSWORD_MIN_LENGTH,
} from '../../../common/constants/auth';

// Composables
import { useAuthProfile } from '../composables/useAuthProfile';
import { useAuthSession } from '../composables/useAuthSession';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
// #endregion

// #region Emits
const emit = defineEmits<IAuthProfilePasswordFormEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { changeOwnPassword } = useAuthProfile();
const { isDatabaseMode } = useAuthSession();
const { builderLoginPath, withBase } = useBricksRoutePaths();

const validationSchema = createAuthOwnPasswordValidationSchema({
    t: (key, params) => t(key, params ?? {}),
});

const { defineField, handleSubmit, errors, setFieldError } = useForm<IAuthOwnPasswordFormValues>({
    validationSchema,
    initialValues: { currentPassword: '', newPassword: '' },
});

const [currentPassword] = defineField('currentPassword');
const [newPassword] = defineField('newPassword');

const isSubmitting = ref(false);
const generalError = ref('');
// #endregion

// #region Methods
/**
 * Меняет пароль и уводит на форму входа.
 *
 * Флаг отправки НЕ снимается после успеха: сессии больше нет, и форма, ставшая
 * снова активной на время перезагрузки, приняла бы второй сабмит, который
 * заведомо ответит 401.
 */
const submitForm = handleSubmit(async (values) => {
    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    generalError.value = '';

    try {
        await changeOwnPassword(values.currentPassword, values.newPassword);

        // Полная перезагрузка, а не роутер: сессии нет, и сторы билдера обязаны
        // сброситься целиком — иначе на форме входа осталось бы состояние
        // прежнего человека
        if (isDatabaseMode) {
            window.location.assign(withBase(builderLoginPath));
        }
    } catch (error: unknown) {
        isSubmitting.value = false;

        if (isInvalidCurrentPasswordError(error)) {
            setFieldError(
                'currentPassword',
                t('bricks.auth.profile.errors.invalidCurrentPassword')
            );

            return;
        }

        generalError.value = t(resolveOwnPasswordErrorKey(error));
        console.error('[Builder] Failed to change the password:', error);
    }
});
// #endregion
</script>

<template>
    <form :class="$style.BuilderAuthProfilePasswordForm" novalidate @submit.prevent="submitForm">
        <BricksInput
            :label="t('bricks.auth.profile.currentPassword')"
            :value="currentPassword"
            type="password"
            autocomplete="current-password"
            revealable
            :max-length="BRICKS_PASSWORD_MAX_LENGTH"
            :disabled="isSubmitting"
            :error-message="errors.currentPassword"
            @update:value="(val: string) => (currentPassword = val)"
        />

        <BricksInput
            :label="t('bricks.auth.profile.newPassword')"
            :value="newPassword"
            type="password"
            autocomplete="new-password"
            revealable
            :max-length="BRICKS_PASSWORD_MAX_LENGTH"
            :disabled="isSubmitting"
            :error-message="errors.newPassword"
            @update:value="(val: string) => (newPassword = val)"
        />

        <BricksFieldHint>
            {{ t('bricks.auth.profile.passwordHint', { min: BRICKS_PASSWORD_MIN_LENGTH }) }}
        </BricksFieldHint>

        <BricksFieldError :message="generalError" />

        <div :class="$style.footer">
            <BricksButton
                size="md"
                variant="ghost"
                type="button"
                :disabled="isSubmitting"
                @click="emit('close')"
            >
                {{ t('bricks.common.cancel') }}
            </BricksButton>

            <BricksButton size="md" variant="primary" type="submit" :disabled="isSubmitting">
                {{ t('bricks.auth.profile.changePassword') }}
            </BricksButton>
        </div>
    </form>
</template>

<style module lang="scss">
.BuilderAuthProfilePasswordForm {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-top: 0.4rem;
    gap: 0.8rem;
}
</style>
