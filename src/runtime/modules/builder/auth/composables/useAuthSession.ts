// #region Imports
// Types
import type { IAuthSessionResponse, IAuthSessionUserPayload } from '../types/auth';

// Composables
import { useApiClient } from '../../../common/composables/useApiClient';

// Nuxt
import { useRuntimeConfig } from '#imports';
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
        });

        return response.user;
    }

    /**
     * Выход: удаляет сессию и уходит на login полной перезагрузкой
     * (чисто сбрасывает сторы билдера).
     */
    async function logout(): Promise<void> {
        await apiFetcher('/api/bricks/auth/logout', { method: 'POST' });
        window.location.assign('/bricks/login');
    }

    /**
     * Текущий пользователь сессии; null — если не авторизован (401).
     */
    async function fetchMe(): Promise<IAuthSessionUserPayload | null> {
        try {
            const response = await apiFetcher<IAuthSessionResponse>('/api/bricks/auth/me');
            return response.user;
        } catch {
            return null;
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
