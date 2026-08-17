// #region Imports
// Types
import type { IBuilderPermissions, TFetchSessionRole } from '../types/permissions';
import type { TBricksUserRole } from '../../../common/types/auth';

// Vue
import { computed } from 'vue';

// Utils
import { parseBricksBooleanFlag } from '../../../common/utils/main';

// Constants
import { BRICKS_BASIC_MODE_ROLE, BRICKS_ROLE_RANK } from '../../../common/constants/auth';

// Nuxt
import { useRequestEvent, useRuntimeConfig, useState } from '#imports';
// #endregion

// #region Data
/** Ключ общего состояния роли: одно значение на приложение. */
const ROLE_STATE_KEY = 'bricks-session-role';

/** Роль, от которой считаются права, пока настоящая неизвестна. */
const FALLBACK_ROLE: TBricksUserRole = 'viewer';
// #endregion

/**
 * Права билдера по роли учётки.
 *
 * Роль берётся из контекста запроса на SSR — её уже разрешил auth-middleware
 * для самой HTML-страницы билдера, поэтому лишнего запроса не нужно и первый
 * кадр рисуется сразу с верным набором действий. Дополни это запросом `me` на
 * клиенте, и наблюдатель на мгновение увидел бы кнопки, которые у него тут же
 * отберут; поставь по умолчанию полные права — то же самое, но с отказом сервера
 * в конце. Клиентский запрос остаётся только фоллбэком для сборок без SSR
 * (`ssr: false`), где контекста запроса нет вовсе: его передаёт composition root
 * загрузчиком в `ensureRole` — сам запрос живёт в auth-домене, а сюда, в нижний
 * слой, он не виден по границам модулей.
 *
 * Права читаются компонентами напрямую, а не прокидываются пропами: их
 * спрашивает и рекурсивное дерево канваса, где проп потерялся бы на первом
 * пропущенном уровне, — а состояние тут ровно одно на сессию.
 *
 * @returns Флаги прав и досылка роли.
 */
export function useBuilderPermissions(): IBuilderPermissions {
    // #region Data
    const config = useRuntimeConfig();
    const event = useRequestEvent();

    const isDatabaseMode = (config.public?.bricksAuthMode as string | undefined) === 'database';
    // Дефолт «включено» — и для незаданного флага, и для пустой строки:
    // `NUXT_PUBLIC_BRICKS_AUTH_ALLOW_USER_MANAGEMENT=` доезжает до собранного
    // приложения как `''`, мимо build-time нормализации
    const isUserManagementAllowed = parseBricksBooleanFlag(
        config.public?.bricksAuthAllowUserManagement,
        true
    );
    // Тот же дефолт и та же причина: пустая строка публичного флага — не
    // «выключено», а «не задано»
    const isPasswordChangeAllowedByFlag = parseBricksBooleanFlag(
        config.public?.bricksAuthAllowPasswordChange,
        true
    );

    // В basic-режиме учёток нет вовсе: identity одна на всех и задана
    // окружением, поэтому сужать права не по кому — роль известна сразу и
    // запроса не требует
    const roleState = useState<TBricksUserRole | null>(ROLE_STATE_KEY, () =>
        isDatabaseMode ? (event?.context.bricksUser?.role ?? null) : BRICKS_BASIC_MODE_ROLE
    );
    // #endregion

    // #region Computed
    const role = computed<TBricksUserRole>(() => roleState.value ?? FALLBACK_ROLE);
    const isRoleKnown = computed<boolean>(() => roleState.value !== null);

    const canEdit = computed<boolean>(
        () => BRICKS_ROLE_RANK[role.value] >= BRICKS_ROLE_RANK.editor
    );
    const canDelete = computed<boolean>(
        () => BRICKS_ROLE_RANK[role.value] >= BRICKS_ROLE_RANK.admin
    );
    const canManageUsers = computed<boolean>(
        () => canDelete.value && isDatabaseMode && isUserManagementAllowed
    );
    // Роль не участвует: свой пароль меняет любой вошедший, включая наблюдателя.
    // Ручка чужого пароля закрыта тем же флагом, но требует ещё и `canManageUsers`
    const canChangePassword = computed<boolean>(
        () => isDatabaseMode && isPasswordChangeAllowedByFlag
    );
    // #endregion

    // #region Methods
    /**
     * Досылает роль, если контекст запроса её не дал (сборка без SSR).
     *
     * Отказ запроса не бросается наружу: composition root вызывает это до
     * рендера, и упавший `me` унёс бы весь экран, хотя права уже посчитаны по
     * самой узкой роли и интерфейс останется в режиме просмотра.
     *
     * @param fetchRole - Загрузчик роли из auth-домена.
     */
    async function ensureRole(fetchRole: TFetchSessionRole): Promise<void> {
        if (isRoleKnown.value) {
            return;
        }

        try {
            roleState.value = await fetchRole();
        } catch (error: unknown) {
            console.error('[Builder] Failed to resolve session role:', error);
        }
    }
    // #endregion

    return { role, isRoleKnown, canEdit, canDelete, canManageUsers, canChangePassword, ensureRole };
}
