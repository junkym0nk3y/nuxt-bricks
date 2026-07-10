<script setup lang="ts">
// #region Imports
// Utils
import { sanitizeRedirectPath } from '../utils/redirects';

// Vue
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useAuthLoginForm } from '../composables/useAuthLoginForm';
import { useAuthSession } from '../composables/useAuthSession';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';

// Components
import BricksInput from '../../../ui/inputs/BricksInput.vue';
import BricksFieldError from '../../../ui/inputs/BricksFieldError.vue';
import BricksButton from '../../../ui/base/button/BricksButton.vue';

// Nuxt
import { navigateTo, useRoute } from '#imports';
// #endregion

// #region Data
const { t } = useI18n();
const route = useRoute();
const { isDatabaseMode, fetchMe } = useAuthSession();
const { builderRootPath } = useBricksRoutePaths();
const { username, password, errors, isSubmitting, generalError, submitForm } = useAuthLoginForm();
// #endregion

// #region Lifecycle
onMounted(async () => {
    // В basic-режиме страница логина не нужна — на дашборд
    if (!isDatabaseMode) {
        await navigateTo(builderRootPath);
        return;
    }

    // Уже авторизован — сразу на возвратный путь
    const user = await fetchMe();

    if (user) {
        await navigateTo(sanitizeRedirectPath(route.query.redirect, builderRootPath));
    }
});
// #endregion
</script>

<template>
    <div :class="$style.BuilderAuthLogin">
        <form :class="$style.card" novalidate @submit.prevent="submitForm">
            <h1 :class="$style.title">{{ t('bricks.auth.login.title') }}</h1>

            <div :class="$style.fields">
                <BricksInput
                    :label="t('bricks.auth.login.username')"
                    :value="username"
                    type="text"
                    autocomplete="username"
                    :max-length="255"
                    :placeholder="t('bricks.auth.login.usernamePlaceholder')"
                    :disabled="isSubmitting"
                    :error-message="errors.username"
                    @update:value="(val: string) => (username = val)"
                />

                <BricksInput
                    :label="t('bricks.auth.login.password')"
                    :value="password"
                    type="password"
                    autocomplete="current-password"
                    :max-length="1024"
                    :placeholder="t('bricks.auth.login.passwordPlaceholder')"
                    :disabled="isSubmitting"
                    :error-message="errors.password"
                    @update:value="(val: string) => (password = val)"
                />
            </div>

            <BricksFieldError :class="$style.generalError" :message="generalError" />

            <BricksButton
                :class="$style.submit"
                size="md"
                variant="primary"
                type="submit"
                :disabled="isSubmitting"
            >
                {{ t('bricks.auth.login.submit') }}
            </BricksButton>
        </form>
    </div>
</template>

<style lang="scss" module>
.BuilderAuthLogin {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2.4rem;
    background: var(--bricks-base-50);
}

.card {
    display: flex;
    width: 100%;
    max-width: 36rem;
    padding: 3.2rem;
    border-radius: var(--bricks-border-radius-md);
    border: 1px solid var(--bricks-base-200);
    background: var(--bricks-base-0);
    box-shadow: var(--bricks-shadow-lg);
    flex-direction: column;
}

.title {
    margin: 0 0 2.4rem;
    text-align: center;
    font-size: 1.8rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}

.fields {
    display: flex;
    flex-direction: column;
    gap: 1.6rem;
}

.generalError {
    margin-top: 1.2rem;
}

.submit {
    width: 100%;
    margin-top: 2.4rem;
}
</style>
