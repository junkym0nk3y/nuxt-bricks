/**
 * Типы database-auth: режим и augmentation H3EventContext.
 */
import type { IAuthSessionUser } from '../../../modules/persistence/types/adapters';
import type { IBricksRoutePrefixes } from '../../../modules/common/utils/bricks/routePaths';

/** Режим авторизации защищённых путей. */
export type TBricksAuthMode = 'basic' | 'database';

/** Разобранная цель запроса для auth-middleware (логический путь без baseURL). */
export interface IAuthRequestTarget {
    /** Путь без `app.baseURL` и query — вход матрицы защиты. */
    logicalPathname: string;
    /** Query-строка запроса (с ведущим `?` или пустая). */
    search: string;
    /** Активные префиксы маршрутов bricks. */
    prefixes: IBricksRoutePrefixes;
    /** `app.baseURL` приложения (для построения redirect-URL). */
    baseURL: string;
}

declare module 'h3' {
    interface H3EventContext {
        /** Пользователь авторизованной database-auth сессии (ставит middleware auth). */
        bricksUser?: IAuthSessionUser;
    }
}
