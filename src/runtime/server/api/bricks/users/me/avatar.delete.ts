import { createError, defineEventHandler } from 'h3';
import {
    useBricksAuthAdapter,
    useBricksPublishAdapter,
} from '../../../../../modules/persistence/server/registry';
import { discardAvatarFile } from '../../../../../modules/persistence/server/utils/avatarFiles';
import { toHttpError } from '../../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertProfileAvailable,
    requireSessionUser,
    toAuthProfileUser,
} from '../../../../utils/auth/profile';

/**
 * DELETE /api/bricks/users/me/avatar — снимает фото своего профиля (любая роль).
 *
 * Идемпотентна: у учётки без фото снимать нечего, и ответ тот же — незачем
 * заставлять интерфейс различать «сняли» и «уже не было».
 *
 * Порядок тот же, что у загрузки: сначала снимается ссылка, потом убирается файл.
 * Обратный порядок оставлял бы учётку со ссылкой на удалённый объект, если запись
 * откажет.
 */
export default defineEventHandler(async (event) => {
    try {
        assertProfileAvailable(event);

        const sessionUser = requireSessionUser(event);
        const result = await useBricksAuthAdapter().updateUserProfile(
            sessionUser.id,
            { avatarUrl: null },
            sessionUser.authVersion
        );

        // Учётки с этими креденшелами больше нет (удалена, отключена, поколение
        // сдвинулось) — сессия мертва, и это 401, а не «нет такой ручки»
        if (!result) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        await discardAvatarFile(useBricksPublishAdapter(), result.previousAvatarUrl);

        return { user: toAuthProfileUser(result.user) };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to delete avatar');
    }
});
