/**
 * Часть Postgres-адаптера учёток, работающая со СТРОКОЙ `bricks_users`: список,
 * создание, состояние (роль и активность), пароли, профиль и удаление.
 *
 * Отдельным файлом от `postgresAuthAdapter.ts` по шву ответственности — там
 * чтение сессий и вход, здесь мутации учёток со своими краевыми правилами и
 * блокировками; вместе файл перерастал потолок в 500 строк. Адаптер собирает
 * контракт спредом этих методов (тот же приём, что у медиа-части
 * storage-адаптера).
 */
import { query, withTransaction, type TTransactionQuery } from './client';
import { buildUpdateQuery, isUniqueViolation, readViolatedConstraint } from './queryBuilders';
import type {
    IAuthOwnPasswordChange,
    IAuthProfileUpdateResult,
    IAuthUserProfileChange,
    IAuthUserStateChange,
    IAuthUserSummary,
    ICreateAuthUserPayload,
    TAuthUserMethods,
} from '../../types/authAdapters';
import type {
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
 * Колонки профиля, разрешённые к записи (camelCase-ключи контракта). Whitelist
 * нужен самому билдеру запроса: имена колонок интерполируются в SET, и ключ
 * мимо списка попал бы туда как есть.
 */
const USER_PROFILE_UPDATE_FIELDS: ReadonlySet<string> = new Set(['displayName', 'avatarUrl']);

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
 * Создаёт мутирующую часть Postgres-адаптера учёток.
 *
 * @returns Методы `IAuthAdapter`, работающие со строкой `bricks_users`.
 */
export function createPostgresAuthUserMethods(): TAuthUserMethods {
    return {
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
         * Правит отображаемое имя и/или ссылку на фото и отдаёт вместе с новым
         * состоянием прежнюю ссылку на фото — по ней вызывающий убирает
         * осиротевший файл.
         *
         * Поколение не поднимается и сессии не рвутся: имя и фото креденшелами
         * не являются, а переименование, выбрасывающее человека из его же
         * сессии, — не то, что он просил.
         *
         * Зато запись УСЛОВНА по поколению и активности, прочитанным при резолве
         * сессии: между проверкой сессии и этой записью проходит время (у
         * загрузки фото — секунды на sharp и заливку), и за него администратор
         * мог деактивировать учётку или сбросить ей пароль. Без условия правка
         * доезжала бы уже отозванными креденшелами, а фото ещё и уходило бы в
         * хранилище. Несовпадение неотличимо от отсутствия строки: и то и другое
         * означает «живой учётки с этими креденшелами нет».
         *
         * Строка блокируется до чтения прежней ссылки: без блокировки две
         * одновременные загрузки аватара прочитали бы одну и ту же прежнюю
         * ссылку, удалили бы один и тот же файл, и второй загруженный остался бы
         * в хранилище без ссылок навсегда.
         */
        async updateUserProfile(
            userId: number,
            change: IAuthUserProfileChange,
            expectedAuthVersion: number
        ): Promise<IAuthProfileUpdateResult | null> {
            const { updates, values } = buildUpdateQuery(change, USER_PROFILE_UPDATE_FIELDS);

            return withTransaction(async (txQuery) => {
                const currentRows = await txQuery<{ avatarUrl: string | null }>(
                    `SELECT avatar_url AS "avatarUrl"
                    FROM bricks_users
                    WHERE id = $1
                        AND is_active = TRUE
                        AND auth_version = $2
                    FOR UPDATE`,
                    [userId, expectedAuthVersion]
                );

                if (currentRows.length === 0) {
                    return null;
                }

                const previousAvatarUrl = currentRows[0].avatarUrl;

                // Пустая правка сюда не приходит (ручка требует хотя бы одно
                // поле), но собрать `SET` без выражений нельзя вовсе — вернём
                // актуальную строку чтением
                if (updates.length === 0) {
                    return { user: await readUser(txQuery, userId), previousAvatarUrl };
                }

                const rows = await txQuery<IAuthUserSummaryRow>(
                    `UPDATE bricks_users
                    SET ${updates.join(', ')}
                    WHERE id = $${values.length + 1}
                    RETURNING ${USER_SUMMARY_COLUMNS}`,
                    [...values, userId]
                );

                return { user: toUserSummary(rows[0]), previousAvatarUrl };
            });
        },

        /**
         * Ставит новый хеш пароля, если учётка активна и её поколение совпадает
         * с прочитанным до проверки текущего пароля, и отзывает все сессии.
         *
         * Условная запись (UPDATE с условием по поколению), а не безусловная:
         * проверка текущего пароля идёт под scrypt секунды, и за это время
         * администратор мог сбросить пароль этой учётке. Безусловная запись
         * отменила бы сброс паролем, который знает пришедший, — тем самым, от
         * которого учётку и отбирали.
         */
        async updateOwnPassword(userId: number, change: IAuthOwnPasswordChange): Promise<boolean> {
            return withTransaction(async (txQuery) => {
                const rows = await txQuery<{ id: number }>(
                    `UPDATE bricks_users
                    SET password_hash = $2, auth_version = auth_version + 1
                    WHERE id = $1
                        AND is_active = TRUE
                        AND auth_version = $3
                    RETURNING id`,
                    [userId, change.passwordHash, change.expectedAuthVersion]
                );

                if (rows.length === 0) {
                    return false;
                }

                await deleteUserSessions(txQuery, userId);

                return true;
            });
        },

        /**
         * Удаляет учётку; её сессии уходят каскадом внешнего ключа.
         *
         * Возвращает снятую строку: вызывающему нужен её `avatarUrl`, чтобы
         * убрать файл фото. Читается он тем же запросом, что удаляет
         * (`RETURNING`), — отдельное чтение до транзакции могло бы застать
         * прежнее фото, и из хранилища ушёл бы файл, на который уже никто не
         * ссылается, вместо актуального.
         */
        async deleteUser(userId: number): Promise<IAuthUserSummary | null> {
            const mutation = await withActiveAdminLock(
                userId,
                async (txQuery, target, activeAdminCount) => {
                    if (breaksActiveAdminInvariant(target, null, activeAdminCount)) {
                        return { isRefused: true, user: null };
                    }

                    const rows = await txQuery<IAuthUserSummaryRow>(
                        `DELETE FROM bricks_users
                        WHERE id = $1
                        RETURNING ${USER_SUMMARY_COLUMNS}`,
                        [userId]
                    );

                    return { isRefused: false, user: toUserSummary(rows[0]) };
                }
            );

            return unwrapGuardedMutation(mutation);
        },
    };
}
