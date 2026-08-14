/**
 * Типы database-auth: режим, ролевой гард и augmentation H3EventContext.
 */
import type { IAuthSessionUser } from '../../../modules/persistence/types/adapters';
import type { IBricksRoutePrefixes } from '../../../modules/common/utils/bricks/routePaths';
import type { TBricksUserRole } from '../../../modules/common/types/auth';

/** Режим авторизации защищённых путей. */
export type TBricksAuthMode = 'basic' | 'database';

/** Тело запроса логина (до валидации — поля произвольные). */
export interface IAuthLoginBody {
    username?: unknown;
    password?: unknown;
}

/** Проверенные креденшелы логина. */
export interface IAuthLoginCredentials {
    username: string;
    password: string;
}

/**
 * Кандидат на вход: прошёл проверку пароля, но сессии ещё не имеет.
 * `authVersion` прочитан ДО scrypt-проверки и уходит условием во вставку.
 */
export interface IAuthLoginCandidate {
    id: number;
    username: string;
    role: TBricksUserRole;
    authVersion: number;
}

/**
 * Требование доступа к пути `/api/bricks/**`.
 * `null` — путь открыт всем (public read-model, health, манифест компонентов);
 * `'authenticated'` — достаточно любой валидной сессии (собственный профиль);
 * роль — минимальный ранг из `BRICKS_ROLE_RANK`.
 */
export type TBricksAccessRequirement = TBricksUserRole | 'authenticated' | null;

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
