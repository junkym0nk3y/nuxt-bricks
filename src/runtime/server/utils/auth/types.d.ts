/**
 * Типы database-auth: режим и augmentation H3EventContext.
 */
import type { IAuthSessionUser } from '../../../modules/persistence/types/adapters';

/** Режим авторизации защищённых путей. */
export type TBricksAuthMode = 'basic' | 'database';

declare module 'h3' {
    interface H3EventContext {
        /** Пользователь авторизованной database-auth сессии (ставит middleware auth). */
        bricksUser?: IAuthSessionUser;
    }
}
