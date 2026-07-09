/**
 * Типы UI-домена авторизации (страница логина, сессия).
 */

/** Значения формы логина. */
export interface IAuthLoginFormValues {
    username: string;
    password: string;
}

/** Пользователь сессии в ответах auth-ручек (login/me). */
export interface IAuthSessionUserPayload {
    id: number;
    username: string;
}

/** Ответ ручек login/me. */
export interface IAuthSessionResponse {
    user: IAuthSessionUserPayload;
}
