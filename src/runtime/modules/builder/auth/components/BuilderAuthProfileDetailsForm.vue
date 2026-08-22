<script setup lang="ts">
/**
 * @description The "Profile" tab: the photo, the display name, the login and the role.
 *
 * What is edited here is exactly what a person may change about themselves. The login
 * is shown as a read-only field rather than hidden: it is what the sign-in goes by and
 * what the account is recognized by in the list, so it has to be visible and copyable
 * if wanted — while renaming an account is a separate conversation about other
 * people's links, uniqueness and journals. `readonly` and not `disabled`: a disabled
 * field is dimmed to half opacity and reads as "not applicable right now", while this
 * one is applicable — it stands there to be read. The role is a badge for viewing: one
 * does not change it for oneself, otherwise the last administrator would demote
 * themselves.
 *
 * The photo is applied RIGHT AWAY by endpoints of its own, while the name waits for
 * "Save". That follows from the endpoints being separate and is not an oversight: the
 * upload has to be a request of its own ("the link first, the old file after"), and
 * postponing it until the shared save would mean keeping the file in memory until the
 * end of the form. Which is why "Cancel" will not bring a removed photo back — the
 * removal is announced by a toast, and the letter can be brought back by that same
 * removal.
 */

// #region Imports
// Types
import type {
    IAuthProfileDetailsFormProps,
    IAuthProfileDetailsFormEmits,
    IAuthProfileFormValues,
} from '../types/auth';

// Utils
import { resolveAvatarErrorKey, resolveDisplayNameErrorKey } from '../utils/profileErrors';
import { createAuthProfileValidationSchema } from '../utils/validationSchema';

// Vue
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Vee-validate
import { useForm } from 'vee-validate';

// Constants
import {
    BRICKS_AVATAR_MAX_UPLOAD_MB,
    BRICKS_DISPLAY_NAME_MAX_LENGTH,
} from '../../../common/constants/auth';

// Composables
import { useAuthProfile } from '../composables/useAuthProfile';

// Components
import BricksAvatar from '../../../ui/base/avatar/BricksAvatar.vue';
import BricksBadge from '../../../ui/base/badge/BricksBadge.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksFieldHint from '../../../ui/inputs/BricksFieldHint.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IAuthProfileDetailsFormProps>(), {});
// #endregion

// #region Emits
const emit = defineEmits<IAuthProfileDetailsFormEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { displayLabel, saveDisplayName, removeAvatar } = useAuthProfile();

const validationSchema = createAuthProfileValidationSchema({
    t: (key, params) => t(key, params ?? {}),
});

const { defineField, handleSubmit, errors } = useForm<IAuthProfileFormValues>({
    validationSchema,
    initialValues: { displayName: props.profile.displayName ?? '' },
});

const [displayName] = defineField('displayName');

const isSubmitting = ref(false);
const isRemovingPhoto = ref(false);
const generalError = ref('');
// #endregion

// #region Computed
const hasPhoto = computed<boolean>(() => Boolean(props.profile.avatarUrl));

const roleLabel = computed<string>(() => t(`bricks.auth.roles.${props.profile.role}`));

/** Any operation of the form blocks the others: both write one and the same account. */
const isBusy = computed<boolean>(() => isSubmitting.value || isRemovingPhoto.value);
// #endregion

// #region Methods
/**
 * Asks the modal to open the file selection.
 */
function handlePickPhoto(): void {
    emit('pick-photo');
}

/**
 * Clears the profile photo.
 *
 * Without a confirmation: putting the photo back costs one click on "Upload photo",
 * and the toast says the action has already been applied — otherwise a person would
 * expect "Cancel" to undo it.
 */
async function handleRemovePhoto(): Promise<void> {
    if (isBusy.value) {
        return;
    }

    isRemovingPhoto.value = true;
    generalError.value = '';

    try {
        await removeAvatar();
        emit('notify', t('bricks.auth.profile.toasts.photoRemoved'), 'success');
    } catch (error: unknown) {
        generalError.value = t(resolveAvatarErrorKey(error), {
            max: BRICKS_AVATAR_MAX_UPLOAD_MB,
        });
        console.error('[Builder] Failed to remove the profile photo:', error);
    } finally {
        isRemovingPhoto.value = false;
    }
}

/**
 * Saves the display name and closes the modal.
 *
 * Closing after a success is as with the creation of a page: the form answered a
 * single question, and leaving it open means offering to save one more time.
 */
const submitForm = handleSubmit(async (values) => {
    if (isBusy.value) {
        return;
    }

    isSubmitting.value = true;
    generalError.value = '';

    try {
        await saveDisplayName(values.displayName);
        emit('notify', t('bricks.auth.profile.toasts.saved'), 'success');
        emit('close');
    } catch (error: unknown) {
        generalError.value = t(resolveDisplayNameErrorKey(error));
        console.error('[Builder] Failed to save the display name:', error);
    } finally {
        isSubmitting.value = false;
    }
});
// #endregion
</script>

<template>
    <form :class="$style.BuilderAuthProfileDetailsForm" novalidate @submit.prevent="submitForm">
        <div :class="$style.photo">
            <BricksAvatar size="lg" :name="displayLabel" :image-url="props.profile.avatarUrl" />

            <div :class="$style.photoActions">
                <div :class="$style.photoButtons">
                    <BricksButton
                        size="sm"
                        variant="secondary"
                        type="button"
                        :disabled="isBusy"
                        @click="handlePickPhoto"
                    >
                        {{
                            hasPhoto
                                ? t('bricks.auth.profile.photo.replace')
                                : t('bricks.auth.profile.photo.upload')
                        }}
                    </BricksButton>

                    <BricksButton
                        v-if="hasPhoto"
                        size="sm"
                        variant="ghost"
                        type="button"
                        :disabled="isBusy"
                        @click="handleRemovePhoto"
                    >
                        {{ t('bricks.common.delete') }}
                    </BricksButton>
                </div>

                <BricksFieldHint>
                    {{
                        hasPhoto
                            ? t('bricks.auth.profile.photo.hint', {
                                  max: BRICKS_AVATAR_MAX_UPLOAD_MB,
                              })
                            : t('bricks.auth.profile.photo.emptyHint', {
                                  max: BRICKS_AVATAR_MAX_UPLOAD_MB,
                              })
                    }}
                </BricksFieldHint>
            </div>
        </div>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.auth.profile.displayName')"
                :value="displayName"
                type="text"
                :max-length="BRICKS_DISPLAY_NAME_MAX_LENGTH"
                :placeholder="t('bricks.auth.profile.displayNamePlaceholder')"
                :disabled="isBusy"
                :error-message="errors.displayName"
                @update:value="(val: string) => (displayName = val)"
            />
            <BricksFieldHint>{{ t('bricks.auth.profile.displayNameHint') }}</BricksFieldHint>
        </div>

        <div :class="$style.field">
            <BricksInput
                :label="t('bricks.auth.login.username')"
                :value="props.profile.username"
                type="text"
                readonly
            />
            <BricksFieldHint>{{ t('bricks.auth.profile.usernameHint') }}</BricksFieldHint>
        </div>

        <div :class="$style.role">
            <span :class="$style.roleLabel">{{ t('bricks.auth.profile.role') }}</span>
            <BricksBadge tone="primary">{{ roleLabel }}</BricksBadge>
            <BricksFieldHint>{{ t('bricks.auth.profile.roleHint') }}</BricksFieldHint>
        </div>

        <BricksFieldError :message="generalError" />

        <div :class="$style.footer">
            <BricksButton
                size="md"
                variant="ghost"
                type="button"
                :disabled="isBusy"
                @click="emit('close')"
            >
                {{ t('bricks.common.cancel') }}
            </BricksButton>

            <BricksButton size="md" variant="primary" type="submit" :disabled="isBusy">
                {{ t('bricks.common.save') }}
            </BricksButton>
        </div>
    </form>
</template>

<style module lang="scss">
.BuilderAuthProfileDetailsForm {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.photo {
    display: flex;
    align-items: flex-start;
    gap: 1.6rem;
}

.photoActions {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
}

.photoButtons {
    display: flex;
    align-items: center;
    gap: 0.8rem;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
}

.role {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.8rem;
}

.roleLabel {
    font-size: 1.4rem;
    color: var(--bricks-base-700);
}

.footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-top: 0.4rem;
    gap: 0.8rem;
}
</style>
