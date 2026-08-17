/**
 * Резолв авторизованной сессии из запроса — общая логика для
 * middleware `server/middleware/auth.ts` и ручки `auth/me.get`.
 */
import { getSessionTokenFromCookie, hashSessionToken } from './sessionCookie';
import { useBricksAuthAdapter } from '../../../modules/persistence/server/registry';
import type { IAuthSessionWithUser } from '../../../modules/persistence/types/authAdapters';
import type { H3Event } from 'h3';

/**
 * Резолвит сессию пользователя по cookie запроса.
 * null — нет cookie, сессия не найдена/просрочена или пользователь деактивирован.
 * Ошибки адаптера (недоступная БД) пробрасываются — вызывающий решает, 503 это или 401.
 *
 * @param event - Событие запроса.
 * @returns Сессия с пользователем (без секретов) или null.
 */
export async function resolveSessionUser(event: H3Event): Promise<IAuthSessionWithUser | null> {
    const token = getSessionTokenFromCookie(event);

    if (!token) {
        return null;
    }

    const session = await useBricksAuthAdapter().getSessionWithUser(hashSessionToken(token));

    if (!session || !session.user.isActive) {
        return null;
    }

    return session;
}
