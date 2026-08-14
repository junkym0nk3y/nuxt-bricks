/**
 * Типы UI-домена авторизации (страница логина, сессия).
 */
import type { TBricksUserRole } from '../../../common/types/auth';

/** Значения формы логина. */
export interface IAuthLoginFormValues {
    username: string;
    password: string;
}

/** Пользователь сессии в ответах auth-ручек (login/me). */
export interface IAuthSessionUserPayload {
    id: number;
    username: string;
    role: TBricksUserRole;
    /**
     * Профиль отдаётся только ручкой `me`: ответу логина он не нужен —
     * форма сразу уходит с страницы, а угол экрана наполняет уже билдер.
     */
    displayName?: string | null;
    avatarUrl?: string | null;
}

/** Ответ ручек login/me. */
export interface IAuthSessionResponse {
    user: IAuthSessionUserPayload;
}
