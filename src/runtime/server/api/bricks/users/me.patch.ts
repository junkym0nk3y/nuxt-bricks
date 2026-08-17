import { createError, defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertProfileAvailable,
    requireSessionUser,
    toAuthProfileUser,
    validateProfilePayload,
} from '../../../utils/auth/profile';

/**
 * PATCH /api/bricks/users/me — отображаемое имя своего профиля.
 *
 * Доступна любому вошедшему, включая `viewer`: своё имя и фото — единственное,
 * что наблюдатель вообще может изменить. Флаг `allowUserManagement` профиля не
 * касается — он про ведение ЧУЖИХ учёток снаружи.
 *
 * Целевая учётка берётся из сессии, а не из пути: параметр `:id` превратил бы
 * «свой профиль» в правку любого профиля, отличающуюся от админской ручки только
 * тем, что её забыли закрыть. Логин при этом неизменяем, роль и активность себе
 * не правятся, а ссылку на фото ставят только ручки аватара — иначе в колонку
 * уехал бы произвольный внешний адрес.
 *
 * Сессии НЕ рвутся: имя — не креденшел, и переименование, выбрасывающее человека
 * из его сессии, не то, о чём он просил. Но сама запись условна по поколению
 * учётных данных из сессии: за время запроса администратор мог деактивировать
 * учётку или сбросить ей пароль, и правка не должна доезжать уже отозванными
 * креденшелами.
 */
export default defineEventHandler(async (event) => {
    try {
        assertProfileAvailable(event);

        const sessionUser = requireSessionUser(event);
        const change = validateProfilePayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        const result = await useBricksAuthAdapter().updateUserProfile(
            sessionUser.id,
            change,
            sessionUser.authVersion
        );

        // Живой учётки с этими креденшелами больше нет: удалена, отключена или
        // поколение сдвинулось. Ответ 401 — сессия уже мертва, и клиент уйдёт на
        // форму логина сам; 404 утверждал бы, что не существует самой ручки
        if (!result) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        return { user: toAuthProfileUser(result.user) };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to update profile');
    }
});
