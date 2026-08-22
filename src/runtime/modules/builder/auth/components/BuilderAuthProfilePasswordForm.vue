<script setup lang="ts">
/**
 * @description The "Password" tab: changing one's own password.
 *
 * The current password is always asked for — otherwise a stolen cookie would change
 * the password by itself, that is, take the account away for good. A mismatch of it
 * arrives with the code `INVALID_CURRENT_PASSWORD` and the status 400 (not 401) for
 * exactly one purpose: so that the hint lands under the field. On a 401 the client
 * interceptor would take a person with a working session to the login form.
 *
 * Success tears down EVERY session, the current one included, and clears the cookie
 * with that same answer — which is why the form does not "save and close" but leaves
 * for the sign-in with a full reload. Handing that over to whatever request comes next
 * is not an option: the person would stay inside an interface that has silently
 * stopped working. There is deliberately no "end the other sessions" checkbox here —
 * that is not an option but a promise of the endpoint.
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
 * Changes the password and leaves for the sign-in form.
 *
 * The submitting flag is NOT lowered after a success: there is no session any more,
 * and a form becoming active again for the duration of the reload would accept a
 * second submit, which is bound to be answered with a 401.
 */
const submitForm = handleSubmit(async (values) => {
    if (isSubmitting.value) {
        return;
    }

    isSubmitting.value = true;
    generalError.value = '';

    try {
        await changeOwnPassword(values.currentPassword, values.newPassword);

        // A full reload rather than the router: there is no session, and the builder
        // stores have to be reset whole — otherwise the state of the previous person
        // would stay behind on the sign-in form
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
