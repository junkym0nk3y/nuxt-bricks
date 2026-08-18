<script setup lang="ts">
/**
 * @description Вкладка «Профиль»: фото, отображаемое имя, логин и роль.
 *
 * Правится здесь ровно то, что человек может изменить себе сам. Логин показан
 * полем только для чтения, а не спрятан: по нему вход и по нему учётка видна в
 * списке, поэтому его нужно видеть и при желании скопировать — а переименование
 * учётки это отдельный разговор про чужие ссылки, уникальность и журналы. Роль —
 * плашка на просмотр: себе её не меняют, иначе последний администратор разжаловал
 * бы сам себя.
 *
 * Фото применяется СРАЗУ своими ручками, а имя — по «Сохранить». Это следствие
 * раздельных ручек, а не недосмотр: загрузка обязана быть отдельным запросом
 * («сначала ссылка, потом старый файл»), и откладывать её до общего сохранения
 * значило бы держать файл в памяти до конца формы. Поэтому «Отмена» снятое фото
 * не вернёт — об удалении сообщает тост, а вернуть букву можно тем же удалением.
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

/** Любая операция формы блокирует остальные: обе пишут одну учётку. */
const isBusy = computed<boolean>(() => isSubmitting.value || isRemovingPhoto.value);
// #endregion

// #region Methods
/**
 * Просит модалку открыть выбор файла: кадрирование живёт в её вложенной модалке.
 */
function handlePickPhoto(): void {
    emit('pick-photo');
}

/**
 * Снимает фото профиля.
 *
 * Без подтверждения: вернуть букву стоит одного клика по «Загрузить фото», а
 * тост сообщает, что действие уже применено, — иначе человек ждал бы, что его
 * отменит «Отмена».
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
 * Сохраняет отображаемое имя и закрывает модалку.
 *
 * Закрытие после успеха — как у создания страницы: форма отвечала на один
 * вопрос, и оставлять её открытой значит предлагать сохранить ещё раз.
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

                <p :class="$style.hint">
                    {{
                        hasPhoto
                            ? t('bricks.auth.profile.photo.hint', {
                                  max: BRICKS_AVATAR_MAX_UPLOAD_MB,
                              })
                            : t('bricks.auth.profile.photo.emptyHint', {
                                  max: BRICKS_AVATAR_MAX_UPLOAD_MB,
                              })
                    }}
                </p>
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
            <span :class="$style.hint">{{ t('bricks.auth.profile.displayNameHint') }}</span>
        </div>

        <div :class="$style.field">
            <!--
                Логин — read-only, а не выключенное поле: `disabled` гасит поле до
                половинной прозрачности и означает «сейчас неприменимо», а логин
                показывают ровно для того, чтобы его прочитали и при желании
                скопировали
            -->
            <BricksInput
                :label="t('bricks.auth.login.username')"
                :value="props.profile.username"
                type="text"
                readonly
            />
            <span :class="$style.hint">{{ t('bricks.auth.profile.usernameHint') }}</span>
        </div>

        <div :class="$style.role">
            <span :class="$style.roleLabel">{{ t('bricks.auth.profile.role') }}</span>
            <BricksBadge variant="primary">{{ roleLabel }}</BricksBadge>
            <span :class="$style.hint">{{ t('bricks.auth.profile.roleHint') }}</span>
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

.hint {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-base-500);
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
