// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';
import type { IThrownHttpError } from '../helpers/types';

// Utils
import { createFakeH3Event } from '../helpers/h3Events';
// #endregion

/**
 * Ключ операции при создании учётки: `POST /api/bricks/users`.
 *
 * Зачем он нужен. Хеш пароля считается намеренно медленно (scrypt под общим
 * семафором процесса), поэтому ответ может не успеть приехать в клиентский потолок
 * ожидания, а учётка при этом уже создана. По списку клиент своего запроса не
 * узнаёт: строка с таким логином могла прийти от другого администратора, локальный
 * список мог отстать от базы задолго до отправки, а пароля в проекции списка нет
 * вовсе. Ключ даёт запросу имя — и повтор спрашивает про СВОЮ операцию.
 *
 * Что здесь сторожится:
 *
 * 1. Порядок: тело проверяется до захвата ключа (иначе битый запрос сжигает ключ, и
 *    исправленный повтор получает «этот ключ был с другим телом»), а захват — до
 *    хеширования (иначе повтор во время первой отправки платит за второй дорогой
 *    вывод ключа ровно тогда, когда сервер уже занят первым).
 * 2. Каждый исход захвата, который клиент обязан различать: результат первой
 *    операции, «ещё идёт», терминальный отказ, удалённая учётка, чужое тело.
 * 3. Оборвавшаяся попытка отдаёт захват, а не оставляет его дотлевать: иначе повтор
 *    получал бы «первая отправка ещё идёт», когда не идёт ничего.
 */

// #region Mocks
const { runtimeConfig, authAdapterMock, bodyMock, gateMock, calls } = vi.hoisted(() => ({
    runtimeConfig: { bricksAuthMode: 'database', bricksAuthAllowUserManagement: true } as Record<
        string,
        unknown
    >,
    authAdapterMock: {
        claimUserCreateOperation: vi.fn(),
        createUserForOperation: vi.fn(),
        releaseUserCreateOperation: vi.fn(),
    },
    bodyMock: { value: {} as Record<string, unknown> },
    /** Подставной семафор scrypt: тест смотрит, считался ли хеш вообще */
    gateMock: vi.fn(),
    /** Хронология шагов — ею проверяется порядок захвата и хеширования */
    calls: [] as string[],
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
    useAppConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksAuthAdapter: () => authAdapterMock,
}));

vi.mock(
    '../../src/runtime/modules/persistence/server/utils/handlerHelpers',
    async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        readNormalizedBody: async () => bodyMock.value,
    })
);

vi.mock('../../src/runtime/server/utils/auth/scryptGate', () => ({
    runScryptTask: gateMock,
    GateOverflowError: class GateOverflowError extends Error {},
}));

const createUser = (await import('../../src/runtime/server/api/bricks/users/index.post')).default;
const { BRICKS_API_ERROR_CODES } =
    await import('../../src/runtime/modules/common/constants/apiErrors');
const { buildUserCreateFingerprint } =
    await import('../../src/runtime/server/utils/auth/userCreateOperations');
// #endregion

// #region Fixtures
const KEY = 'b'.repeat(32);

/** Учётка, какой её отдаёт адаптер. */
const CREATED_USER = {
    id: 11,
    username: 'ivan',
    role: 'editor' as const,
    isActive: true,
    displayName: null,
    avatarUrl: null,
    createdAt: '2026-08-23T10:00:00.000Z',
    lastLoginAt: null,
};

/**
 * Событие запроса администратора с ключом операции в заголовке.
 *
 * @param key - Значение заголовка; null — заголовка нет вовсе.
 * @returns Событие h3 в минимальной форме.
 */
function createEvent(key: string | null = KEY): H3Event {
    return createFakeH3Event({
        path: '/api/bricks/users',
        method: 'POST',
        headers: key === null ? {} : { 'idempotency-key': key },
        context: { bricksUser: { id: 1, username: 'admin', role: 'admin', isActive: true } },
    });
}

/**
 * Выполняет ручку и возвращает выброшенный ею HTTP-отказ.
 *
 * @param event - Событие запроса.
 * @returns Ошибка с полями статуса и кода.
 */
async function callAndCatch(event: H3Event): Promise<IThrownHttpError> {
    return (await createUser(event).then(
        () => {
            throw new Error('Ручка ответила успехом, а ожидался отказ');
        },
        (error: unknown) => error
    )) as IThrownHttpError;
}
// #endregion

describe('POST /api/bricks/users: ключ операции', () => {
    beforeEach(() => {
        calls.length = 0;
        authAdapterMock.claimUserCreateOperation.mockReset();
        authAdapterMock.createUserForOperation.mockReset();
        authAdapterMock.releaseUserCreateOperation.mockReset();
        gateMock.mockReset();

        bodyMock.value = {
            username: 'ivan',
            password: 'sufficient-password',
            role: 'editor',
        };

        authAdapterMock.claimUserCreateOperation.mockImplementation(async () => {
            calls.push('claim');

            return { status: 'claimed', attempt: 1 };
        });
        authAdapterMock.createUserForOperation.mockImplementation(async () => {
            calls.push('create');

            return { status: 'created', user: CREATED_USER };
        });
        gateMock.mockImplementation(async (task: () => Promise<string>) => {
            calls.push('hash');

            return task();
        });
    });

    it('захват ключа идёт до расчёта хеша', async () => {
        const answer = await createUser(createEvent());

        expect(answer).toEqual({ user: CREATED_USER });
        expect(calls).toEqual(['claim', 'hash', 'create']);

        const [claim] = authAdapterMock.claimUserCreateOperation.mock.calls[0] as [
            { idempotencyKey: string; requestFingerprint: string; leaseMs: number },
        ];

        expect(claim.idempotencyKey).toBe(KEY);
        expect(claim.leaseMs).toBeGreaterThan(0);
    });

    it('запрос без ключа отклоняется до захвата и до хеша', async () => {
        const error = await callAndCatch(createEvent(null));

        expect(error.statusCode).toBe(400);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.idempotencyKeyRequired);
        expect(calls).toEqual([]);
    });

    it('ключ не той формы отклоняется так же, как отсутствующий', async () => {
        const error = await callAndCatch(createEvent('short'));

        expect(error.statusCode).toBe(400);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.idempotencyKeyRequired);
        expect(calls).toEqual([]);
    });

    // Битый запрос не должен сжигать ключ: исправленный повтор пришёл бы с тем же
    // ключом и другим телом, то есть получил бы отказ вместо создания
    it('невалидное тело отклоняется до захвата ключа', async () => {
        bodyMock.value = { username: 'ivan', password: 'short', role: 'editor' };

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(400);
        expect(authAdapterMock.claimUserCreateOperation).not.toHaveBeenCalled();
    });

    // Ровно то, ради чего ключ и заведён: ответ первой отправки пропал, повтор
    // получает её результат, а не создаёт вторую учётку
    it('завершённая операция отвечает своей учёткой без второго создания', async () => {
        authAdapterMock.claimUserCreateOperation.mockImplementation(async () => {
            calls.push('claim');

            return { status: 'completed', user: CREATED_USER };
        });

        const answer = await createUser(createEvent());

        expect(answer).toEqual({ user: CREATED_USER });
        expect(calls).toEqual(['claim']);
        expect(authAdapterMock.createUserForOperation).not.toHaveBeenCalled();
    });

    it('идущая первая отправка отвечает 409 и не считает второй хеш', async () => {
        authAdapterMock.claimUserCreateOperation.mockResolvedValueOnce({ status: 'running' });

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(409);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.userCreateInProgress);
        expect(gateMock).not.toHaveBeenCalled();
    });

    it('терминальный отказ повторяется как занятый логин', async () => {
        authAdapterMock.claimUserCreateOperation.mockResolvedValueOnce({
            status: 'rejected',
            code: 'USERNAME_TAKEN',
        });

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(409);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.usernameTaken);
        expect(gateMock).not.toHaveBeenCalled();
    });

    it('тот же ключ с другим телом отклоняется 422', async () => {
        authAdapterMock.claimUserCreateOperation.mockResolvedValueOnce({
            status: 'payloadMismatch',
        });

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(422);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.idempotencyKeyReused);
    });

    it('удалённая учётка завершённой операции — 410, а не создание заново', async () => {
        authAdapterMock.claimUserCreateOperation.mockResolvedValueOnce({
            status: 'completedUserGone',
        });

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(410);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.userCreateResultGone);
        expect(authAdapterMock.createUserForOperation).not.toHaveBeenCalled();
    });

    it('занятый логин на записи приходит клиенту кодом занятого логина', async () => {
        authAdapterMock.createUserForOperation.mockResolvedValueOnce({
            status: 'rejected',
            code: 'USERNAME_TAKEN',
        });

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(409);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.usernameTaken);
    });

    it('перехваченный захват отвечает «идёт», а не успехом', async () => {
        authAdapterMock.createUserForOperation.mockResolvedValueOnce({ status: 'staleClaim' });

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(409);
        expect(error.data?.code).toBe(BRICKS_API_ERROR_CODES.userCreateInProgress);
    });

    // Иначе повтор упирался бы в «первая отправка ещё идёт» до конца аренды, хотя не
    // идёт ничего: попытка оборвалась на занятом семафоре
    it('оборвавшаяся попытка отдаёт захват', async () => {
        gateMock.mockImplementationOnce(async () => {
            calls.push('hash');

            throw Object.assign(new Error('Server is busy'), { statusCode: 503 });
        });

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(503);
        expect(authAdapterMock.releaseUserCreateOperation).toHaveBeenCalledWith({
            idempotencyKey: KEY,
            attempt: 1,
        });
    });

    // Отказ самой отдачи захвата не должен подменять причину: клиенту нужен честный
    // «сервер занят», а не ошибка уборки. Операция при этом всё равно остаётся
    // восстановимой — аренда истечёт, и повтор её заберёт
    it('падение отдачи захвата не перекрывает исходную ошибку', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        gateMock.mockImplementationOnce(async () => {
            calls.push('hash');

            throw Object.assign(new Error('Server is busy'), { statusCode: 503 });
        });
        authAdapterMock.releaseUserCreateOperation.mockRejectedValueOnce(
            Object.assign(new Error('connection terminated'), { statusCode: 500 })
        );

        const error = await callAndCatch(createEvent());

        expect(error.statusCode).toBe(503);
        expect(error.message).toContain('Server is busy');
    });
});

describe('buildUserCreateFingerprint: отпечаток тела запроса', () => {
    const input = {
        username: 'ivan',
        password: 'sufficient-password',
        role: 'editor' as const,
        displayName: null,
        isActive: true,
    };

    it('одинаковое тело даёт одинаковый отпечаток', () => {
        expect(buildUserCreateFingerprint(input)).toBe(buildUserCreateFingerprint({ ...input }));
    });

    it('другая роль, имя или активность дают другой отпечаток', () => {
        const base = buildUserCreateFingerprint(input);

        expect(buildUserCreateFingerprint({ ...input, role: 'admin' })).not.toBe(base);
        expect(buildUserCreateFingerprint({ ...input, displayName: 'Иван' })).not.toBe(base);
        expect(buildUserCreateFingerprint({ ...input, isActive: false })).not.toBe(base);
        expect(buildUserCreateFingerprint({ ...input, username: 'ivan.petrov' })).not.toBe(base);
    });

    // Осознанное ограничение, а не упущение: простой отпечаток с паролем сделал бы
    // таблицу операций быстрым offline-оракулом для перебора паролей из украденного
    // дампа, а отпечаток с секретным ключом потребовал бы обязательной настройки
    // модуля. В интерфейсе случай не возникает: форма держит один ключ на одно
    // намерение и выдаёт новый при правке любого поля, пароля в том числе
    it('пароль в отпечаток не входит', () => {
        expect(buildUserCreateFingerprint({ ...input, password: 'another-password-1' })).toBe(
            buildUserCreateFingerprint(input)
        );
    });
});
