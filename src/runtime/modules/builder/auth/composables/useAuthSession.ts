// #region Imports
// Types
import type { IAuthSessionResponse, IAuthSessionUserPayload } from '../types/auth';
import type { TRequestErrorLike } from '../../../common/types/bricks-api';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';
import { useBricksRoutePaths } from '../../../common/composables/useBricksRoutePaths';

// Constants
import { BRICKS_AUTH_REQUEST_TIMEOUT_MS } from '../../../common/constants/apiTimeouts';

// Nuxt
import { useRuntimeConfig } from '#imports';
// #endregion

// #region Data
/** Единственный статус, который означает «сессии нет», а не «проверить не удалось». */
const UNAUTHORIZED_STATUS = 401;
// #endregion

/**
 * Клиентская сессия database-auth: режим, login/logout, текущий пользователь.
 * В basic-режиме isDatabaseMode = false — UI (кнопка «Выйти», login-страница)
 * не показывается/редиректит.
 */
export function useAuthSession() {
    // #region Data
    const config = useRuntimeConfig();
    const { apiFetcher } = useApiClient();
    const { builderLoginPath, withBase } = useBricksRoutePaths();

    const isDatabaseMode = (config.public?.bricksAuthMode as string | undefined) === 'database';
    // #endregion

    // #region Methods
    /**
     * Логин по username/password; успех создаёт cookie-сессию на сервере.
     * Ошибки (401/429/503) пробрасываются вызывающему — форма мапит их на сообщения.
     *
     * @param username - Имя пользователя.
     * @param password - Пароль.
     * @returns Пользователь созданной сессии.
     */
    async function login(username: string, password: string): Promise<IAuthSessionUserPayload> {
        const response = await apiFetcher<IAuthSessionResponse>('/api/bricks/auth/login', {
            method: 'POST',
            body: { username, password },
            // Короткая запись: общий потолок записи (30 с) держал бы кнопку формы
            // втрое дольше нужного
            timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
        });

        return response.user;
    }

    /**
     * Выход: удаляет сессию и уходит на login полной перезагрузкой
     * (чисто сбрасывает сторы билдера).
     */
    async function logout(): Promise<void> {
        await apiFetcher('/api/bricks/auth/logout', {
            method: 'POST',
            timeout: BRICKS_AUTH_REQUEST_TIMEOUT_MS,
        });
        window.location.assign(withBase(builderLoginPath));
    }

    /**
     * Текущая сессия целиком; null — если не авторизован (401).
     *
     * Отдаётся весь ответ, а не только пользователь: рядом с ним приезжает
     * признак дефолтного пароля, и вытащить его вторым запросом значило бы
     * спросить сервер о том же самом дважды.
     *
     * Прочие отказы (5xx, обрыв по потолку ожидания) пробрасываются: они не
     * означают «не авторизован», и вызывающий, приняв их за 401, показал бы форму
     * логина человеку с рабочей сессией — или, наоборот, увёл бы его в цикл
     * входа. Различить их можно только здесь: наружу уходит один и тот же `null`.
     */
    async function fetchMe(): Promise<IAuthSessionResponse | null> {
        try {
            return await apiFetcher<IAuthSessionResponse>('/api/bricks/auth/me');
        } catch (error: unknown) {
            if ((error as TRequestErrorLike).statusCode === UNAUTHORIZED_STATUS) {
                return null;
            }

            throw error;
        }
    }
    // #endregion

    return {
        isDatabaseMode,
        login,
        logout,
        fetchMe,
    };
}
