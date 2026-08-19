<script setup lang="ts">
/**
 * @description Полоса-предупреждение: учётка всё ещё живёт с дефолтным паролем
 * сида миграции (`admin` / `bricks-pass`). Пароль одинаков во всех инсталляциях
 * и напечатан в README — до смены учётка защищена ровно ничем.
 *
 * Предупреждение, а не принудительный экран смены: заблокировать интерфейс до
 * смены пароля значило бы запереть и того, кто только поднял playground, а
 * блокировать вход в production (как это делает basic-режим с паролем
 * `change-me`) здесь нельзя вовсе — сменить пароль можно только войдя.
 *
 * Своего запроса компонент не делает: флаг приезжает вместе с сессией, которую
 * билдер и так резолвит на SSR.
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
    canChangePassword: true,
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
 * Просит открыть форму смены пароля.
 */
function handleChangePassword(): void {
    emit('change-password');
}
// #endregion
</script>

<template>
    <!--
        role="status", а не "alert": полоса живёт на странице постоянно, пока
        пароль дефолтный, и «alert» перебивал бы озвучку каждого экрана billboard
        assertive-объявлением.
    -->
    <div v-if="isDefaultPassword" :class="$style.BuilderAuthDefaultPasswordNotice" role="status">
        <BricksIcon icon="ta:outline-key" :class="$style.icon" />

        <p :class="$style.text">
            <strong :class="$style.title">
                {{ t('bricks.auth.defaultPassword.title') }}
            </strong>
            {{ t('bricks.auth.defaultPassword.description') }}
        </p>

        <!--
            Смена своего пароля выключена конфигом (`auth.allowPasswordChange`):
            кнопка вела бы в форму, которой нет. Предупреждение при этом
            остаётся верным — пароль всё тот же, менять его придётся снаружи.
        -->
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

    /* Жёлтый — единственный акцент предупреждения в палитре; фон собирается из
       него прозрачностью, чтобы полоса читалась и в тёмной теме, где готового
       светлого тона у этого цвета нет. */
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
