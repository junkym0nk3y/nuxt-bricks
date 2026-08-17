import { createError, defineEventHandler } from 'h3';
import { useBricksAuthAdapter } from '../../../../../modules/persistence/server/registry';
import {
    readNormalizedBody,
    toHttpError,
} from '../../../../../modules/persistence/server/utils/handlerHelpers';
import {
    assertProfileAvailable,
    invalidCurrentPassword,
    requireSessionUser,
    validateOwnPasswordPayload,
} from '../../../../utils/auth/profile';
import {
    assertPasswordChangeAllowed,
    hashPasswordUnderGate,
} from '../../../../utils/auth/userManagement';
import { verifyPassword } from '../../../../utils/auth/passwords';
import { GateOverflowError, runScryptTask } from '../../../../utils/auth/scryptGate';
import { clearSessionCookie } from '../../../../utils/auth/sessionCookie';
import {
    assertWithinRateLimit,
    createFixedWindowRateLimiter,
} from '../../../../utils/requestRateLimiter';

/**
 * Лимит попыток смены своего пароля с одного IP в минуту.
 *
 * Нужен из-за ТЕКУЩЕГО пароля: ручка проверяет его, то есть отвечает на вопрос
 * «этот пароль верный?». Украденная кука иначе перебирала бы по нему сам пароль —
 * а пароль человек, скорее всего, использует и где-то ещё. Заодно граница
 * держит CPU: каждая попытка — две scrypt-дериватации.
 */
const PASSWORD_CHANGES_PER_MINUTE = 10;
const passwordChangeRateLimiter = createFixedWindowRateLimiter({
    limit: PASSWORD_CHANGES_PER_MINUTE,
    windowMs: 60_000,
});

/**
 * POST /api/bricks/users/me/password — смена СВОЕГО пароля (любая роль).
 *
 * Текущий пароль обязателен, и это главное отличие от админской ручки: без него
 * украденная кука сменила бы пароль сама и заперла владельца снаружи.
 * Администратор чужой пароль задаёт без текущего (он его не знает) — поэтому та
 * ручка отказывает на собственной учётке.
 *
 * Успех отзывает ВСЕ сессии учётки, включая ту, из которой пришёл запрос:
 * поколение учётных данных поднимается одним UPDATE, и прежние сессии перестают
 * совпадать с учёткой. Так и задумано — если пароль меняют из-за подозрения на
 * кражу куки, выжившая сессия обесценила бы смену. Cookie чистится тем же
 * ответом, чтобы браузер не носил мёртвый токен до первого 401.
 *
 * Запись условна по поколению, прочитанному ДО проверки пароля: проверка идёт под
 * scrypt секунды, и за это время администратор мог сбросить пароль этой учётке,
 * чтобы отобрать её. Безусловная запись отменила бы сброс старым паролем.
 */
export default defineEventHandler(async (event) => {
    try {
        assertProfileAvailable(event);
        assertPasswordChangeAllowed(event);

        const sessionUser = requireSessionUser(event);

        // После проверок доступности: 404 выключенного режима и 403 флага не
        // должны тратить бюджет попыток
        assertWithinRateLimit(
            event,
            passwordChangeRateLimiter,
            'Too many password change attempts'
        );

        const { currentPassword, newPassword } = validateOwnPasswordPayload(
            await readNormalizedBody<Record<string, unknown>>(event)
        );
        const auth = useBricksAuthAdapter();
        const record = await auth.getUserByUsername(sessionUser.username);

        // Учётку удалили или её логин занят уже другой строкой: обе ситуации
        // означают, что сессия относится к тому, чего больше нет.
        //
        // Поколение сверяется с ПОКОЛЕНИЕМ СЕССИИ, а не берётся из свежего
        // чтения: смена роли поднимает поколение и отзывает сессии, но пароль при
        // этом не меняет, — значит прежний пароль всё ещё подходит, и запись,
        // условная по свежепрочитанному поколению, прошла бы из уже отозванной
        // сессии. Тот же обход давала деактивация с быстрой повторной
        // активацией. Профиль и аватар считают по поколению сессии по той же
        // причине.
        if (
            !record ||
            record.id !== sessionUser.id ||
            !record.isActive ||
            record.authVersion !== sessionUser.authVersion
        ) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        let isCurrentPasswordValid: boolean;

        try {
            isCurrentPasswordValid = await runScryptTask(() =>
                verifyPassword(currentPassword, record.passwordHash)
            );
        } catch (error: unknown) {
            if (error instanceof GateOverflowError) {
                throw createError({
                    statusCode: 503,
                    statusMessage: 'Server is busy, try again later',
                });
            }

            throw error;
        }

        if (!isCurrentPasswordValid) {
            invalidCurrentPassword();
        }

        const isApplied = await auth.updateOwnPassword(sessionUser.id, {
            passwordHash: await hashPasswordUnderGate(newPassword),
            expectedAuthVersion: sessionUser.authVersion,
        });

        // Состояние учётки изменилось, пока шли scrypt-проверки: пароль сбросил
        // администратор либо учётку отключили. Ответ — 401: сессия уже мертва, и
        // клиент уйдёт на форму логина, где и выяснится, чей пароль в силе
        if (!isApplied) {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }

        clearSessionCookie(event);

        return { success: true };
    } catch (error: unknown) {
        toHttpError(error, 'Failed to change password');
    }
});
