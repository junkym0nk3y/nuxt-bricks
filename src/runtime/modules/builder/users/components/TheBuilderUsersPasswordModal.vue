<script setup lang="ts">
/**
 * @description The "set a password" modal for somebody else's account.
 *
 * The current password is not asked for here: the administrator does not know it, and
 * the scenario is giving access back to a person who forgot their own. One's own
 * password is changed by another form (the profile tab), and there the current one is
 * mandatory — otherwise a stolen cookie would change the password by itself and lock
 * the owner out. That is why these are different endpoints and different forms rather
 * than one with an optional field.
 *
 * The request is performed by the modal itself rather than by the shared operations of
 * the section: the button has to go into its submitting state and hold the window open
 * until the response — had it closed earlier, a person would not learn whether the
 * password had been set, and repeating the operation would mean setting a third one.
 */

// #region Imports
// Types
import type { IUsersPasswordModalProps, IUsersPasswordModalEmits } from '../types/users';

// Utils
import { resolveUserLabel } from '../utils/userFormatting';

// Vue
import { computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Constants
import {
    BRICKS_PASSWORD_MAX_LENGTH,
    BRICKS_PASSWORD_MIN_LENGTH,
} from '../../../common/constants/auth';

// Composables
import { useUsersPasswordForm } from '../composables/useUsersPasswordForm';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
import BricksModalFooter from '../../../ui/base/modal/BricksModalFooter.vue';
import BricksModalHeader from '../../../ui/base/modal/BricksModalHeader.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IUsersPasswordModalProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IUsersPasswordModalEmits>();
// #endregion

// #region Data
const { t } = useI18n();

const targetUser = computed(() => props.user);

const { password, errors, generalError, isSubmitting, generatePassword, submitForm, resetToEmpty } =
    useUsersPasswordForm({
        user: targetUser,
        onSaved: (user) => emit('saved', user),
    });
// #endregion

// #region Computed
/**
 * The title names the account: the password form looks the same for any of them, and
 * without the name in the header a miss on the row would stay unnoticed until the
 * person could not sign in.
 */
const modalTitle = computed<string>(() =>
    props.user
        ? t('bricks.users.passwordModal.title', { user: resolveUserLabel(props.user) })
        : t('bricks.users.passwordModal.titleFallback')
);
// #endregion

// #region Methods
/**
 * Closes the modal. While a submission is running the closing does not go through:
 * there would be nobody to show the answer of the endpoint to, and by that moment the
 * password may already have been applied.
 */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }

    emit('close');
}
// #endregion

// #region Lifecycle
// The field is cleared on every opening: a password of the previous account left in it
// would be set for the next one with a single press of the button
watch(targetUser, (user) => {
    if (user) {
        resetToEmpty();
    }
});
// #endregion
</script>

<template>
    <BricksModal
        :is-open="props.user !== null"
        :title="modalTitle"
        variant="gradient"
        padded
        @close="handleClose"
    >
        <div :class="$style.TheBuilderUsersPasswordModal">
            <BricksModalHeader @close="handleClose" />

            <form :class="$style.form" novalidate @submit.prevent="submitForm">
                <div :class="$style.passwordRow">
                    <BricksInput
                        :class="$style.passwordInput"
                        :label="t('bricks.users.passwordModal.newPassword')"
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

                <div :class="$style.notice">
                    <BricksIcon icon="ta:outline-info-circle" :class="$style.noticeIcon" />
                    <div :class="$style.noticeBody">
                        <p :class="$style.noticeTitle">
                            {{ t('bricks.users.passwordModal.sessionsTitle') }}
                        </p>
                        <p :class="$style.noticeText">
                            {{ t('bricks.users.passwordModal.sessionsText') }}
                        </p>
                    </div>
                </div>

                <BricksFieldHint>
                    {{ t('bricks.users.passwordModal.hint', { min: BRICKS_PASSWORD_MIN_LENGTH }) }}
                </BricksFieldHint>

                <BricksFieldError :message="generalError" />

                <BricksModalFooter variant="inline">
                    <BricksButton
                        size="md"
                        variant="ghost"
                        type="button"
                        :disabled="isSubmitting"
                        @click="handleClose"
                    >
                        {{ t('bricks.common.cancel') }}
                    </BricksButton>

                    <BricksButton
                        size="md"
                        variant="primary"
                        type="submit"
                        :disabled="isSubmitting"
                    >
                        {{ t('bricks.users.passwordModal.submit') }}
                    </BricksButton>
                </BricksModalFooter>
            </form>
        </div>
    </BricksModal>
</template>

<style module lang="scss">
.TheBuilderUsersPasswordModal {
    display: flex;
    flex-direction: column;
    width: 48rem;
    max-width: 100%;
    max-height: 100%;
    border-radius: var(--bricks-border-radius-md);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
}

.form {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    padding: 2rem;
    gap: 1.6rem;
}

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

.notice {
    display: flex;
    padding: 1.2rem 1.4rem;
    border-radius: var(--bricks-border-radius-xs);
    border: 1px solid var(--bricks-danger-500);
    background: var(--bricks-danger-50);
    gap: 1rem;
}

.noticeIcon {
    flex-shrink: 0;
    width: 1.8rem;
    height: 1.8rem;
    color: var(--bricks-danger-500);
}

.noticeBody {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.noticeTitle {
    margin: 0;
    font-size: 1.3rem;
    font-weight: 600;
    color: var(--bricks-danger-600);
}

.noticeText {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-danger-600);
}
</style>
