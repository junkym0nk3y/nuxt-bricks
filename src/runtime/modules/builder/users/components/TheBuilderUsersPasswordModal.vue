<script setup lang="ts">
/**
 * @description Модалка «задать пароль» чужой учётке.
 *
 * Текущий пароль здесь не спрашивается: администратор его не знает, а сценарий —
 * вернуть доступ человеку, который свой пароль забыл. Свой пароль меняется
 * другой формой (вкладка профиля), и там текущий обязателен — иначе украденная
 * кука сменила бы пароль сама и заперла владельца. Поэтому это разные ручки и
 * разные формы, а не одна с необязательным полем.
 *
 * Запрос выполняет сама модалка, а не общие операции раздела: кнопка обязана
 * уйти в состояние отправки и держать окно открытым до ответа — закройся оно
 * раньше, человек не узнал бы, задан ли пароль, а повторить операцию значило бы
 * задать третий пароль.
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
import BricksCloseButton from '../../../ui/base/modal/BricksCloseButton.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksModal from '../../../ui/base/modal/BricksModal.vue';
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
 * Заголовок называет учётку: форма пароля выглядит одинаково для любой из них, и
 * без имени в шапке промах по строке остался бы незамеченным до того, как
 * человек не сможет войти.
 */
const modalTitle = computed<string>(() =>
    props.user
        ? t('bricks.users.passwordModal.title', { user: resolveUserLabel(props.user) })
        : t('bricks.users.passwordModal.titleFallback')
);
// #endregion

// #region Methods
/**
 * Закрывает модалку. Пока идёт отправка, закрытие не проходит: ответ ручки
 * некому будет показать, а пароль в этот момент уже мог примениться.
 */
function handleClose(): void {
    if (isSubmitting.value) {
        return;
    }

    emit('close');
}
// #endregion

// #region Lifecycle
// Поле чистится на каждом открытии: оставленный пароль предыдущей учётки был бы
// задан следующей одним нажатием кнопки
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
            <div :class="$style.header">
                <h3 :class="$style.title">{{ modalTitle }}</h3>
                <BricksCloseButton @click="handleClose" />
            </div>

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

                <!-- Отзыв сессий — следствие, о котором предупреждают заранее:
                     человек, которому меняют пароль, вылетит из своих вкладок -->
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

                <p :class="$style.hint">
                    {{ t('bricks.users.passwordModal.hint', { min: BRICKS_PASSWORD_MIN_LENGTH }) }}
                </p>

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

                    <BricksButton
                        size="md"
                        variant="primary"
                        type="submit"
                        :disabled="isSubmitting"
                    >
                        {{ t('bricks.users.passwordModal.submit') }}
                    </BricksButton>
                </div>
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
    overflow: hidden;
    margin: 0;
    text-overflow: ellipsis;
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

.hint {
    margin: 0;
    font-size: 1.2rem;
    line-height: 1.4;
    color: var(--bricks-base-500);
}

.footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-top: 0.4rem;
    gap: 0.8rem;
}
</style>
