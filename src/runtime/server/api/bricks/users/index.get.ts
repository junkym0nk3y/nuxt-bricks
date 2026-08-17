import { defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../modules/persistence/server/registry';
import { toUsersHttpError } from '../../../../modules/persistence/server/utils/handlerHelpers';
import { assertUserManagementAvailable } from '../../../utils/auth/userManagement';

/**
 * GET /api/bricks/users — список учёток для раздела «Пользователи» (admin).
 *
 * Отдаёт и собственную учётку запрашивающего: строка «это вы» — часть экрана,
 * а не лишняя запись. Секретов в ответе нет (ни хеша пароля, ни поколения
 * учётных данных), поэтому фильтровать поля клиенту не приходится.
 */
export default defineEventHandler(async (event) => {
    try {
        assertUserManagementAvailable(event);

        return { users: await useBricksAuthAdapter().listUsers() };
    } catch (error: unknown) {
        toUsersHttpError(error, 'Failed to list users');
    }
});
