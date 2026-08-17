/**
 * Дефолтный IAuthAdapter поверх PostgreSQL (таблицы bricks_users / bricks_sessions).
 * Схема таблиц — versioned-миграции migrations/*.sql (CLI bricks-migrate);
 * runtime-DDL адаптер не выполняет.
 */
import { query, queryOne, withTransaction, type TTransactionQuery } from './client';
import { isUniqueViolation, readViolatedConstraint } from './queryBuilders';
import type {
    IAuthAdapter,
    IAuthUserRecord,
    IAuthSessionWithUser,
    IAuthUserStateChange,
    IAuthUserSummary,
    ICreateAuthSessionPayload,
    ICreateAuthUserPayload,
} from '../../types/adapters';
import type {
    IAuthSessionJoinRow,
    IAuthUserStateRow,
    IAuthUserSummaryRow,
    IGuardedUserMutation,
} from '../../types/postgres';
import { BricksLastActiveAdminError, BricksUsernameTakenError } from '../utils/authErrors';
import {
    breaksActiveAdminInvariant,
    isUserStateUnchanged,
    resolveNextUserState,
} from '../utils/authUserRules';

/**
 * Колонки учётки для раздела управления, с алиасами camelCase. Один список на
 * все методы: разъехавшись, они отдали бы клиенту разную форму одной сущности.
 */
const USER_SUMMARY_COLUMNS = `id, username, role, is_active AS "isActive",
    display_name AS "displayName", avatar_url AS "avatarUrl",
    created_at AS "createdAt"`;

/**
 * Приводит строку учётки к контракту: TIMESTAMPTZ-колонку — к ISO-строке.
 *
 * @param row - Строка результата запроса.
 * @returns Учётка в форме IAuthUserSummary.
 */
function toUserSummary(row: IAuthUserSummaryRow): IAuthUserSummary {
    return {
        ...row,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    };
}

/**
 * Первичный ключ `bricks_users`. Единственное уникальное ограничение таблицы,
 * которое НЕ может быть нарушено логином: остальные два (колоночное `UNIQUE` и
 * регистронезависимый индекс) построены по `username`.
 */
const USERS_PRIMARY_KEY_CONSTRAINT = 'bricks_users_pkey';

/**
 * Проверяет, что конфликт уникальности МОГ быть конфликтом по логину.
 *
 * Различать ограничения обязательно: после восстановления дампа с отставшей
 * `bricks_users_id_seq` вставка свободного логина упирается в первичный ключ, а
 * ответ «логин занят» отправляет администратора придумывать другой логин —
 * поломка базы маскируется штатным конфликтом и остаётся ненайденной.
 *
 * Исключается именно первичный ключ, а не сверяются имена индексов логина: имя
 * колоночного `UNIQUE` генерирует PostgreSQL, и опечатка в ожидаемом имени
 * превратила бы обычный занятый логин в 500 — отказ хуже нынешнего. Так же
 * трактуется ошибка без имени ограничения (совместимый сервер или прокси могут
 * его не прислать): худший исход — сегодняшнее поведение. Появится у таблицы
 * третий смысл уникальности — расширить исключение.
 *
 * @param error - Пойманная ошибка запроса.
 * @returns true, если конфликт мог произойти по логину.
 */
function isPossibleUsernameConflict(error: unknown): boolean {
    if (!isUniqueViolation(error)) {
        return false;
    }

    return readViolatedConstraint(error) !== USERS_PRIMARY_KEY_CONSTRAINT;
}

/**
 * Отзывает сессии учётки — уборка следом за инкрементом `auth_version`.
 *
 * Механизм отзыва — сам инкремент (сессия перестаёт совпадать с учёткой тем же
 * запросом, которым её читают), поэтому строки сессий удаляются только чтобы не
 * копить мусор. Полагаться на этот DELETE как на защиту нельзя: он может
 * отказать уже после успешной смены состояния.
 *
 * @param txQuery - Запрос внутри открытой транзакции.
 * @param userId - Идентификатор учётки.
 */
async function deleteUserSessions(txQuery: TTransactionQuery, userId: number): Promise<void> {
    await txQuery('DELETE FROM bricks_sessions WHERE user_id = $1', [userId]);
}

/**
 * Выполняет мутацию учётки под блокировкой набора активных администраторов.
 *
 * Порядок блокировок фиксирован: сначала ВСЕ активные админы в порядке `id`,
 * потом строка цели. Так это сделано против двух дефектов:
 *
 * 1. **Write skew.** При READ COMMITTED два одновременных понижения двух
 *    последних админов читают одно и то же «админов двое» и оба проходят —
 *    система остаётся без администратора. Блокировка всего набора превращает
 *    такую пару в очередь: второй пересчитывает набор уже после первого и
 *    получает отказ.
 * 2. **Взаимная блокировка.** Захватывай транзакции строки в разном порядке —
 *    две встречные операции ждали бы друг друга. Набор берётся первым и в
 *    порядке `id`, поэтому пересекающиеся операции всегда встают в одну очередь.
 *
 * Счётчик после блокировки не может оказаться завышенным: каждая строка набора
 * заблокирована, и перестать быть активным админом она до нашего коммита не
 * может. Заниженным — может (параллельная активация админа вне набора), и тогда
 * отказ придёт на безопасную операцию; это осознанный перекос в сторону отказа.
 *
 * @param userId - Идентификатор учётки-цели.
 * @param apply - Мутация; получает состояние цели и число активных админов.
 * @returns Результат `apply`; null — учётки нет.
 */
async function withActiveAdminLock(
    userId: number,
    apply: (
        txQuery: TTransactionQuery,
        target: IAuthUserStateRow,
        activeAdminCount: number
    ) => Promise<IGuardedUserMutation>
): Promise<IGuardedUserMutation | null> {
    return withTransaction(async (txQuery) => {
        const activeAdmins = await txQuery<{ id: number }>(
            `SELECT id FROM bricks_users
            WHERE is_active = TRUE AND role = 'admin'
            ORDER BY id
            FOR UPDATE`
        );

        const targetRows = await txQuery<IAuthUserStateRow>(
            `SELECT id, role, is_active AS "isActive"
            FROM bricks_users
            WHERE id = $1
            FOR UPDATE`,
            [userId]
        );

        if (targetRows.length === 0) {
            return null;
        }

        return apply(txQuery, targetRows[0], activeAdmins.length);
    });
}

/**
 * Читает учётку внутри открытой транзакции — ветка «состояние не изменилось»:
 * писать нечего, но ответ обязан нести актуальную строку.
 *
 * @param txQuery - Запрос внутри открытой транзакции.
 * @param userId - Идентификатор учётки (существование уже проверено).
 */
async function readUser(txQuery: TTransactionQuery, userId: number): Promise<IAuthUserSummary> {
    const rows = await txQuery<IAuthUserSummaryRow>(
        `SELECT ${USER_SUMMARY_COLUMNS} FROM bricks_users WHERE id = $1`,
        [userId]
    );

    return toUserSummary(rows[0]);
}

/**
 * Разворачивает исход мутации в контракт адаптера: отказ краевого правила — в
 * исключение (уже вне транзакции), отсутствие цели — в null.
 *
 * @param mutation - Исход `withActiveAdminLock`.
 */
function unwrapGuardedMutation(mutation: IGuardedUserMutation | null): IAuthUserSummary | null {
    if (mutation === null) {
        return null;
    }

    if (mutation.isRefused) {
        throw new BricksLastActiveAdminError();
    }

    return mutation.user;
}

/**
 * Создаёт Postgres-реализацию IAuthAdapter.
 *
 * @returns Адаптер пользователей и cookie-сессий.
 */
export function createPostgresAuthAdapter(): IAuthAdapter {
    return {
        /**
         * Возвращает пользователя по username (включая хеш пароля) или null.
         * Поиск регистронезависимый — под уникальным индексом по lower(username);
         * регистрозависимый поиск разошёлся бы с rate limiter'ом логина, который
         * считает `Admin` и `admin` одним ключом попыток.
         */
        async getUserByUsername(username: string): Promise<IAuthUserRecord | null> {
            return queryOne<IAuthUserRecord>(
                `SELECT id, username, password_hash AS "passwordHash", is_active AS "isActive",
                    role, auth_version AS "authVersion"
                FROM bricks_users
                WHERE lower(username) = lower($1)`,
                [username]
            );
        },

        /**
         * Возвращает непросроченную сессию вместе с пользователем или null.
         * Просроченная сессия неотличима от отсутствующей (SQL-фильтр по expires_at).
         *
         * Сверка `s.auth_version = u.auth_version` — носитель отзыва прав:
         * смена пароля, деактивация и смена роли поднимают поколение учётки, и
         * все прежние сессии перестают совпадать тем же запросом, которым их
         * читают. Полагаться вместо этого на удаление строк сессий нельзя:
         * отдельный DELETE может отказать уже после успешной смены пароля.
         */
        async getSessionWithUser(tokenHash: string): Promise<IAuthSessionWithUser | null> {
            const row = await queryOne<IAuthSessionJoinRow>(
                `SELECT s.token_hash AS "tokenHash",
                    s.expires_at AS "expiresAt",
                    s.last_used_at AS "lastUsedAt",
                    u.id AS "userId",
                    u.username,
                    u.is_active AS "isActive",
                    u.role,
                    u.display_name AS "displayName",
                    u.avatar_url AS "avatarUrl"
                FROM bricks_sessions s
                JOIN bricks_users u ON u.id = s.user_id
                WHERE s.token_hash = $1
                    AND s.expires_at > NOW()
                    AND s.auth_version = u.auth_version`,
                [tokenHash]
            );

            if (!row) {
                return null;
            }

            return {
                tokenHash: row.tokenHash,
                // TIMESTAMPTZ-колонка: node-postgres возвращает Date —
                // нормализуем до ISO-строки, контракт IAuthSessionWithUser.expiresAt
                // остаётся string (ISO 8601 UTC).
                expiresAt:
                    row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
                lastUsedAt: row.lastUsedAt,
                user: {
                    id: row.userId,
                    username: row.username,
                    isActive: row.isActive,
                    role: row.role,
                    displayName: row.displayName,
                    avatarUrl: row.avatarUrl,
                },
            };
        },

        /**
         * Создаёт сессию (в БД — только SHA-256 hex токена), если учётка всё ещё
         * активна и её поколение совпадает с прочитанным до проверки пароля.
         *
         * Вставка условная (INSERT ... SELECT), а не безусловная: проверка
         * пароля идёт под scrypt секунды, и параллельная смена пароля или
         * деактивация могли завершиться раньше вставки — тогда безусловный
         * INSERT выдал бы рабочую сессию по уже отозванным креденшелам.
         *
         * @returns false — состояние учётки изменилось, куку выставлять нельзя.
         */
        async createSession(payload: ICreateAuthSessionPayload): Promise<boolean> {
            const rows = await query<{ id: number }>(
                `INSERT INTO bricks_sessions (token_hash, user_id, auth_version, expires_at)
                SELECT $1, u.id, u.auth_version, $3
                FROM bricks_users u
                WHERE u.id = $2
                    AND u.is_active = TRUE
                    AND u.auth_version = $4
                RETURNING id`,
                [payload.tokenHash, payload.userId, payload.expiresAt, payload.expectedAuthVersion]
            );

            return rows.length > 0;
        },

        /**
         * Удаляет сессию по хешу токена (logout / отзыв).
         */
        async deleteSession(tokenHash: string): Promise<void> {
            await query('DELETE FROM bricks_sessions WHERE token_hash = $1', [tokenHash]);
        },

        /**
         * Удаляет просроченные сессии; возвращает количество удалённых.
         */
        async deleteExpiredSessions(): Promise<number> {
            const rows = await query<{ id: number }>(
                'DELETE FROM bricks_sessions WHERE expires_at <= NOW() RETURNING id'
            );

            return rows.length;
        },

        /**
         * Sliding-продление: обновляет expires_at и last_used_at сессии.
         */
        async touchSession(tokenHash: string, expiresAt: Date): Promise<void> {
            await query(
                `UPDATE bricks_sessions
                SET expires_at = $2, last_used_at = NOW()
                WHERE token_hash = $1`,
                [tokenHash, expiresAt]
            );
        },

        /**
         * Все учётки для раздела управления, в порядке создания (по id).
         */
        async listUsers(): Promise<IAuthUserSummary[]> {
            const rows = await query<IAuthUserSummaryRow>(
                `SELECT ${USER_SUMMARY_COLUMNS}
                FROM bricks_users
                ORDER BY id`
            );

            return rows.map(toUserSummary);
        },

        /**
         * Создаёт учётку. Логин канонизируется в нижний регистр — уникальность
         * держится индексом по `lower(username)`, а вход регистронезависим:
         * сохранённый `Admin` показывал бы в списке имя, которым нельзя войти
         * иначе как в любом регистре.
         *
         * Занятость логина определяется нарушением индекса, а не
         * предварительным чтением: между чтением и вставкой успевает
         * вклиниться параллельное создание.
         */
        async createUser(payload: ICreateAuthUserPayload): Promise<IAuthUserSummary> {
            try {
                const rows = await query<IAuthUserSummaryRow>(
                    `INSERT INTO bricks_users (username, password_hash, role)
                    VALUES (lower($1), $2, $3)
                    RETURNING ${USER_SUMMARY_COLUMNS}`,
                    [payload.username, payload.passwordHash, payload.role]
                );

                return toUserSummary(rows[0]);
            } catch (error: unknown) {
                if (isPossibleUsernameConflict(error)) {
                    throw new BricksUsernameTakenError(payload.username, error);
                }

                throw error;
            }
        },

        /**
         * Меняет роль и/или активность учётки и отзывает её сессии.
         *
         * Состояние, совпадающее с текущим, не пишется вовсе — иначе повторный
         * выбор того же пункта в меню роли выбрасывал бы человека из его сессии.
         */
        async updateUserState(
            userId: number,
            change: IAuthUserStateChange
        ): Promise<IAuthUserSummary | null> {
            const mutation = await withActiveAdminLock(
                userId,
                async (txQuery, target, activeAdminCount) => {
                    const next = resolveNextUserState(target, change);

                    if (isUserStateUnchanged(target, next)) {
                        return { isRefused: false, user: await readUser(txQuery, userId) };
                    }

                    if (breaksActiveAdminInvariant(target, next, activeAdminCount)) {
                        return { isRefused: true, user: null };
                    }

                    const rows = await txQuery<IAuthUserSummaryRow>(
                        `UPDATE bricks_users
                        SET role = $2, is_active = $3, auth_version = auth_version + 1
                        WHERE id = $1
                        RETURNING ${USER_SUMMARY_COLUMNS}`,
                        [userId, next.role, next.isActive]
                    );

                    await deleteUserSessions(txQuery, userId);

                    return { isRefused: false, user: toUserSummary(rows[0]) };
                }
            );

            return unwrapGuardedMutation(mutation);
        },

        /**
         * Ставит новый хеш пароля и отзывает сессии учётки.
         *
         * Набор админов здесь не блокируется: смена пароля не отнимает у
         * системы администратора — учётка входит заново с новым паролем.
         */
        async updateUserPassword(
            userId: number,
            passwordHash: string
        ): Promise<IAuthUserSummary | null> {
            return withTransaction(async (txQuery) => {
                const rows = await txQuery<IAuthUserSummaryRow>(
                    `UPDATE bricks_users
                    SET password_hash = $2, auth_version = auth_version + 1
                    WHERE id = $1
                    RETURNING ${USER_SUMMARY_COLUMNS}`,
                    [userId, passwordHash]
                );

                if (rows.length === 0) {
                    return null;
                }

                await deleteUserSessions(txQuery, userId);

                return toUserSummary(rows[0]);
            });
        },

        /**
         * Удаляет учётку; её сессии уходят каскадом внешнего ключа.
         */
        async deleteUser(userId: number): Promise<boolean> {
            const mutation = await withActiveAdminLock(
                userId,
                async (txQuery, target, activeAdminCount) => {
                    if (breaksActiveAdminInvariant(target, null, activeAdminCount)) {
                        return { isRefused: true, user: null };
                    }

                    await txQuery('DELETE FROM bricks_users WHERE id = $1', [userId]);

                    return { isRefused: false, user: null };
                }
            );

            if (mutation?.isRefused) {
                throw new BricksLastActiveAdminError();
            }

            return mutation !== null;
        },
    };
}
