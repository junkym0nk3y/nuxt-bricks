<script setup lang="ts">
/**
 * @description Warning bar: the account still lives with the default password of the
 * migration seed (`admin` / `bricks-pass`). The password is the same in every
 * installation and is printed in the README — until it is changed the account is
 * protected by exactly nothing.
 *
 * A warning rather than a forced change screen: locking the interface until the
 * password is changed would lock up whoever has only just started the playground,
 * while blocking the sign-in in production (the way basic mode does with the
 * `change-me` password) is impossible here at all — the password can only be changed
 * once signed in.
 *
 * The component makes no request of its own: the flag arrives together with the
 * session the builder resolves on SSR anyway.
 *
 * The bar carries `role="status"` and not `"alert"`: it lives on the page for as long
 * as the password stays the default, and "alert" would cut across the reading of
 * every screen with an assertive announcement.
 *
 * One decision is held by the style section: yellow is the only accent of a warning
 * in the palette, and the background is assembled out of it with transparency so that
 * the bar reads in the dark theme too, where this color has no ready light tone.
 */

// #region Imports
// Types
import type {
    IAuthDefaultPasswordNoticeEmits,
    IAuthDefaultPasswordNoticeProps,
} from '../types/auth';

// Vue
import { useI18n } from 'vue-i18n';

// Composables
import { useAuthProfile } from '../composables/useAuthProfile';

// Components
import BricksButton from '../../../ui/base/button/BricksButton.vue';
// #endregion

// #region Props
const props = withDefaults(defineProps<IAuthDefaultPasswordNoticeProps>(), {
    canChangePassword: false,
});
// #endregion

// #region Emits
const emit = defineEmits<IAuthDefaultPasswordNoticeEmits>();
// #endregion

// #region Data
const { t } = useI18n();
const { isDefaultPassword } = useAuthProfile();
// #endregion

// #region Methods
/**
 * Asks for the password change form to be opened.
 */
function handleChangePassword(): void {
    emit('change-password');
}
// #endregion
</script>

<template>
    <div v-if="isDefaultPassword" :class="$style.BuilderAuthDefaultPasswordNotice" role="status">
        <BricksIcon icon="ta:outline-key" :class="$style.icon" />

        <p :class="$style.text">
            <strong :class="$style.title">
                {{ t('bricks.auth.defaultPassword.title') }}
            </strong>
            {{ t('bricks.auth.defaultPassword.description') }}
        </p>

        <BricksButton
            v-if="props.canChangePassword"
            size="sm"
            variant="primary"
            @click="handleChangePassword"
        >
            {{ t('bricks.auth.defaultPassword.action') }}
        </BricksButton>
    </div>
</template>

<style module lang="scss">
.BuilderAuthDefaultPasswordNotice {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    padding: 1.2rem 2.4rem;
    border-bottom: 1px solid var(--bricks-base-200);
    background: rgb(var(--bricks-rgb-yellow) / 12%);
}

.icon {
    flex-shrink: 0;
    width: 2rem;
    height: 2rem;
    color: var(--bricks-yellow);
}

.text {
    flex: 1;
    margin: 0;
    font-size: 1.3rem;
    color: var(--bricks-base-700);
}

.title {
    margin-right: 0.4rem;
    font-weight: 600;
    color: var(--bricks-base-900);
}
</style>
