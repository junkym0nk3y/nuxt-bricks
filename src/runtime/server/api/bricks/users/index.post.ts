import { defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toUsersHttpError,
} from '../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertUserManagementAvailable,
    buildCreateUserPayload,
} from '../../../utils/auth/userManagement';

/**
 * POST /api/bricks/users — создаёт учётку (admin).
 *
 * Логин канонизируется в нижний регистр, пароль уходит в базу только хешем
 * (scrypt под общим семафором). Занятый логин — 409 с кодом `USERNAME_TAKEN`:
 * форма подставляет подсказку под поле, а не общий текст ошибки.
 *
 * Отображаемое имя и активность необязательны: без них учётка активна и
 * показывается логином. Имя администратор задаёт только ЗДЕСЬ — список должен
 * читаться до первого входа новых людей; дальше подпись правит себе сам человек
 * ручкой профиля, и переписать её администратор уже не может. Заведённая
 * выключенной учётка входа не даёт, пока её не включат в строке списка.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);

        const payload = await buildCreateUserPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        return { user: await useBricksAuthAdapter().createUser(payload) };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to create user');
    }
});
