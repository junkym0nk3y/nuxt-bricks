// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sharp
import sharp from 'sharp';

// Types
import type { H3Event } from 'h3';
import type { IThrownHttpError } from '../helpers/types';
import type { IUploadedFilePart } from '../../src/runtime/modules/persistence/types/media';

// Utils
import { createFakeH3Event } from '../helpers/h3Events';
// #endregion

/**
 * Жизненный цикл имени и фото профиля: что уходит в адаптер, в каком порядке
 * трогается хранилище и какие отказы видит клиент. Здесь же — уборка файла фото
 * при удалении учётки администратором: та же тема и те же подставные адаптеры.
 * Смена своего пароля — в test/server/authOwnPassword.spec.ts.
 *
 * Порядок операций здесь — не деталь реализации: сначала запись новой ссылки на
 * фото, потом удаление прежнего файла. Обратный порядок оставляет учётку со
 * ссылкой на удалённый объект, если запись откажет, — то есть пустой квадрат
 * вместо прежнего фото.
 */

// #region Mocks
const { runtimeConfig, authAdapterMock, publishAdapterMock, bodyMock, formParts, calls } =
    vi.hoisted(() => ({
        runtimeConfig: { bricksAuthMode: 'database' } as Record<string, unknown>,
        authAdapterMock: {
            updateUserProfile: vi.fn(),
            deleteUser: vi.fn(),
        },
        publishAdapterMock: {
            buildFileKey: vi.fn(),
            uploadFile: vi.fn(),
            deleteFile: vi.fn(),
            isOwnedUrl: vi.fn(),
        },
        bodyMock: { value: {} as Record<string, unknown> },
        formParts: { value: [] as IUploadedFilePart[] },
        /** Хронология обращений к хранилищу и базе — ею проверяется порядок. */
        calls: [] as string[],
    }));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => runtimeConfig,
    useAppConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksAuthAdapter: () => authAdapterMock,
    useBricksPublishAdapter: () => publishAdapterMock,
}));

vi.mock(
    '../../src/runtime/modules/persistence/server/utils/handlerHelpers',
    async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        readNormalizedBody: async () => bodyMock.value,
    })
);

vi.mock(
    '../../src/runtime/modules/persistence/server/utils/requestBodyLimits',
    async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        withMultipartFormData: async (
            _event: H3Event,
            _maxBytes: number,
            use: (parts: IUploadedFilePart[]) => Promise<unknown>
        ) => use(formParts.value),
    })
);

const patchProfile = (await import('../../src/runtime/server/api/bricks/users/me.patch')).default;
const uploadAvatar = (await import('../../src/runtime/server/api/bricks/users/me/avatar.post'))
    .default;
const deleteAvatar = (await import('../../src/runtime/server/api/bricks/users/me/avatar.delete'))
    .default;
const deleteUser = (await import('../../src/runtime/server/api/bricks/users/[id].delete')).default;
// #endregion

// #region Fixtures
/** Прежнее фото учётки — его файл обязан уйти из хранилища после смены. */
const PREVIOUS_AVATAR_URL = 'https://s3.example/bucket/bricks-avatars/user-7-old.webp';

/** Учётка сессии: id и логин, по которым ручки находят цель правки. */
const SESSION_USER = {
    id: 7,
    username: 'ivan',
    isActive: true,
    role: 'editor' as const,
    authVersion: 4,
    displayName: null,
    avatarUrl: PREVIOUS_AVATAR_URL,
};

/**
 * Строка учётки, какой её отдаёт адаптер после правки.
 *
 * @param overrides - Поля, которые отличаются от базовых.
 * @returns Строка учётки.
 */
function makeUserRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 7,
        username: 'ivan',
        role: 'editor',
        isActive: true,
        displayName: null,
        avatarUrl: null,
        createdAt: '2026-08-17T00:00:00.000Z',
        ...overrides,
    };
}

/**
 * Событие запроса от пользователя сессии.
 *
 * @param user - Пользователь запроса (по умолчанию — учётка фикстуры).
 * @returns Событие h3 в минимальной форме.
 */
function createEvent(user: Record<string, unknown> | null = SESSION_USER): H3Event {
    return createFakeH3Event({
        path: '/api/bricks/users/me',
        method: 'PATCH',
        context: user ? { bricksUser: user } : {},
    });
}

/**
 * Выполняет ручку и возвращает брошенную ей ошибку.
 *
 * @param handler - Обработчик маршрута.
 * @param event - Событие запроса.
 * @returns Пойманная ошибка.
 */
async function catchThrown(
    handler: (event: H3Event) => unknown,
    event: H3Event = createEvent()
): Promise<IThrownHttpError> {
    try {
        await handler(event);
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected handler to throw');
}

/**
 * Готовит поля multipart-формы загрузки аватара.
 *
 * @param file - Байты файла.
 * @param frame - Значения полей рамки (строками, как в форме).
 * @returns Коллекция полей формы.
 */
function makeAvatarForm(
    file: Buffer,
    frame: Record<string, string> = { cropX: '10', cropY: '20', cropSide: '100' }
): IUploadedFilePart[] {
    return [
        { name: 'file', filename: 'photo.jpg', type: 'image/jpeg', data: file },
        ...Object.entries(frame).map(([name, value]) => ({ name, data: Buffer.from(value) })),
    ];
}

/**
 * Собирает тестовое растровое изображение.
 *
 * @param width - Ширина.
 * @param height - Высота.
 * @returns Байты JPEG.
 */
async function makeImage(width: number, height: number): Promise<Buffer> {
    return sharp({
        create: { width, height, channels: 3, background: '#3355ff' },
    })
        .jpeg()
        .toBuffer();
}
// #endregion

beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    runtimeConfig.bricksAuthMode = 'database';
    runtimeConfig.bricksAuthAllowUserManagement = true;
    bodyMock.value = {};
    formParts.value = [];

    publishAdapterMock.buildFileKey.mockImplementation(
        (kind: string, filename: string) => `bricks-${kind}s/${filename}`
    );
    publishAdapterMock.uploadFile.mockImplementation(({ key }: { key: string }) => {
        calls.push(`upload:${key}`);

        return { url: `https://s3.example/bucket/${key}`, key, size: 1024 };
    });
    publishAdapterMock.deleteFile.mockImplementation((url: string) => {
        calls.push(`delete:${url}`);
    });
    publishAdapterMock.isOwnedUrl.mockReturnValue(true);
});

describe('PATCH /users/me: отображаемое имя', () => {
    it('правит учётку из сессии и отдаёт проекцию профиля', async () => {
        bodyMock.value = { displayName: 'Иван Петров' };
        authAdapterMock.updateUserProfile.mockResolvedValue({
            user: makeUserRow({ displayName: 'Иван Петров' }),
            previousAvatarUrl: null,
        });

        const response = await patchProfile(createEvent());

        // Поколение из сессии уходит условием записи: за время запроса учётку
        // могли деактивировать или сбросить ей пароль
        expect(authAdapterMock.updateUserProfile).toHaveBeenCalledWith(
            7,
            { displayName: 'Иван Петров' },
            4
        );
        expect(response).toEqual({
            user: {
                id: 7,
                username: 'ivan',
                role: 'editor',
                displayName: 'Иван Петров',
                avatarUrl: null,
            },
        });
    });

    it('отвечает 401, если живой учётки с этими креденшелами уже нет', async () => {
        // Удалена, деактивирована или поколение сдвинулось — снаружи это одно и
        // то же: сессия мертва, и клиент уйдёт на форму логина. 404 утверждал бы,
        // что не существует самой ручки
        bodyMock.value = { displayName: 'Иван' };
        authAdapterMock.updateUserProfile.mockResolvedValue(null);

        expect((await catchThrown(patchProfile)).statusCode).toBe(401);
    });
});

describe('POST /users/me/avatar: загрузка фото', () => {
    it('кладёт один webp 256×256 в свой namespace и только потом убирает прежний файл', async () => {
        formParts.value = makeAvatarForm(await makeImage(400, 300));
        authAdapterMock.updateUserProfile.mockImplementation(
            (_userId: number, change: Record<string, unknown>) => {
                calls.push(`write:${String(change.avatarUrl)}`);

                return {
                    user: makeUserRow({ avatarUrl: change.avatarUrl }),
                    previousAvatarUrl: PREVIOUS_AVATAR_URL,
                };
            }
        );

        const response = await uploadAvatar(createEvent());

        // Namespace фото, а не медиатеки: иначе аватары попали бы в галерею
        expect(publishAdapterMock.buildFileKey).toHaveBeenCalledWith(
            'avatar',
            expect.stringMatching(/^user-7-[0-9a-f-]+\.webp$/)
        );

        const uploaded = publishAdapterMock.uploadFile.mock.calls[0][0];
        const metadata = await sharp(uploaded.buffer).metadata();

        expect(uploaded.mimeType).toBe('image/webp');
        expect(metadata.format).toBe('webp');
        expect([metadata.width, metadata.height]).toEqual([256, 256]);

        // Порядок: заливка → запись ссылки → удаление прежнего файла
        expect(calls).toEqual([
            expect.stringContaining('upload:bricks-avatars/user-7-'),
            expect.stringContaining('write:https://s3.example/bucket/bricks-avatars/user-7-'),
            `delete:${PREVIOUS_AVATAR_URL}`,
        ]);
        expect(response).toEqual({
            user: expect.objectContaining({
                id: 7,
                avatarUrl: expect.stringContaining('bricks-avatars/user-7-'),
            }),
        });
    });

    it('кадрирует по присланной рамке, а не по центру', async () => {
        // Половины разного цвета: рамка указывает на ПРАВУЮ. Кроп по центру (или
        // по левому краю) захватил бы синее — центр фотографии почти никогда не
        // совпадает с лицом, и молчаливый выбор кадра был бы чужим
        const source = await sharp({
            create: { width: 200, height: 100, channels: 3, background: '#ff0000' },
        })
            .composite([
                {
                    input: await sharp({
                        create: { width: 100, height: 100, channels: 3, background: '#0000ff' },
                    })
                        .png()
                        .toBuffer(),
                    left: 0,
                    top: 0,
                },
            ])
            .jpeg()
            .toBuffer();

        formParts.value = makeAvatarForm(source, { cropX: '100', cropY: '0', cropSide: '100' });
        authAdapterMock.updateUserProfile.mockResolvedValue({
            user: makeUserRow(),
            previousAvatarUrl: null,
        });

        await uploadAvatar(createEvent());

        const uploaded = publishAdapterMock.uploadFile.mock.calls[0][0];
        const stats = await sharp(uploaded.buffer).stats();
        const [red, green, blue] = stats.channels.map((channel) => channel.mean);

        // Кадр целиком красный: синяя половина в него не попала
        expect(red).toBeGreaterThan(200);
        expect(blue).toBeLessThan(60);
        expect(green).toBeLessThan(60);
    });

    it('отклоняет рамку за краем изображения до заливки', async () => {
        formParts.value = makeAvatarForm(await makeImage(120, 120), {
            cropX: '100',
            cropY: '0',
            cropSide: '100',
        });

        const error = await catchThrown(uploadAvatar);

        expect(error.statusCode).toBe(400);
        expect(publishAdapterMock.uploadFile).not.toHaveBeenCalled();
        expect(authAdapterMock.updateUserProfile).not.toHaveBeenCalled();
    });

    it('требует все поля рамки и минимальную сторону', async () => {
        const image = await makeImage(400, 400);

        formParts.value = makeAvatarForm(image, { cropX: '0', cropY: '0' });
        expect((await catchThrown(uploadAvatar)).statusCode).toBe(400);

        formParts.value = makeAvatarForm(image, { cropX: '0', cropY: '0', cropSide: '-10' });
        expect((await catchThrown(uploadAvatar)).statusCode).toBe(400);

        formParts.value = makeAvatarForm(image, { cropX: '0', cropY: '0', cropSide: '8' });
        expect((await catchThrown(uploadAvatar)).statusCode).toBe(400);

        expect(publishAdapterMock.uploadFile).not.toHaveBeenCalled();
    });

    it('не принимает вектор: наружу уходит только пережатый растр', async () => {
        formParts.value = [
            {
                name: 'file',
                filename: 'logo.svg',
                type: 'image/svg+xml',
                data: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
            },
            { name: 'cropX', data: Buffer.from('0') },
            { name: 'cropY', data: Buffer.from('0') },
            { name: 'cropSide', data: Buffer.from('100') },
        ];

        expect((await catchThrown(uploadAvatar)).statusCode).toBe(400);
        expect(publishAdapterMock.uploadFile).not.toHaveBeenCalled();
    });

    it('убирает загруженный файл, если креденшелы отозваны за время заливки', async () => {
        // Условие поколения не совпало — записи не было ТОЧНО, сослаться на файл
        // нечему. Ответ 401: сессия мертва
        formParts.value = makeAvatarForm(await makeImage(400, 400));
        authAdapterMock.updateUserProfile.mockResolvedValue(null);

        const error = await catchThrown(uploadAvatar);

        expect(error.statusCode).toBe(401);
        expect(publishAdapterMock.deleteFile).toHaveBeenCalledWith(
            expect.stringContaining('bricks-avatars/user-7-')
        );
    });

    it('СОХРАНЯЕТ загруженный файл при неизвестном исходе записи', async () => {
        // Лимит времени базы или обрыв соединения: запись могла закоммититься, и
        // удаление сняло бы объект из-под живой ссылки
        formParts.value = makeAvatarForm(await makeImage(400, 400));
        authAdapterMock.updateUserProfile.mockRejectedValue(new Error('connection terminated'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        expect((await catchThrown(uploadAvatar)).statusCode).toBe(500);
        expect(publishAdapterMock.deleteFile).not.toHaveBeenCalled();
    });
});

describe('DELETE /users/me/avatar: снятие фото', () => {
    it('снимает ссылку и убирает прежний файл в этом порядке', async () => {
        authAdapterMock.updateUserProfile.mockImplementation(
            (_userId: number, change: Record<string, unknown>) => {
                calls.push(`write:${String(change.avatarUrl)}`);

                return { user: makeUserRow(), previousAvatarUrl: PREVIOUS_AVATAR_URL };
            }
        );

        const response = await deleteAvatar(createEvent());

        expect(authAdapterMock.updateUserProfile).toHaveBeenCalledWith(7, { avatarUrl: null }, 4);
        expect(calls).toEqual(['write:null', `delete:${PREVIOUS_AVATAR_URL}`]);
        expect(response).toEqual({ user: expect.objectContaining({ avatarUrl: null }) });
    });

    it('идемпотентна: без прежнего фото хранилище не трогается', async () => {
        authAdapterMock.updateUserProfile.mockResolvedValue({
            user: makeUserRow(),
            previousAvatarUrl: null,
        });

        await deleteAvatar(createEvent());

        expect(publishAdapterMock.deleteFile).not.toHaveBeenCalled();
    });
});

describe('DELETE /users/:id: файл фото удалённой учётки', () => {
    /**
     * Событие админского удаления чужой учётки.
     *
     * @returns Событие h3 с параметром маршрута и администратором в контексте.
     */
    function createAdminEvent(): H3Event {
        return createFakeH3Event({
            path: '/api/bricks/users/9',
            method: 'DELETE',
            context: {
                params: { id: '9' },
                bricksUser: { id: 1, username: 'admin', isActive: true, role: 'admin' },
            },
        });
    }

    it('убирает файл по ссылке из снятой строки', async () => {
        // Ссылки на файл больше нет нигде: без уборки он остался бы в хранилище
        // навсегда. Ссылка берётся из строки, снятой тем же запросом, — чтение
        // до удаления могло бы застать прежнее фото
        authAdapterMock.deleteUser.mockResolvedValue(
            makeUserRow({ id: 9, avatarUrl: PREVIOUS_AVATAR_URL })
        );

        expect(await deleteUser(createAdminEvent())).toEqual({ success: true });
        expect(publishAdapterMock.deleteFile).toHaveBeenCalledWith(PREVIOUS_AVATAR_URL);
    });

    it('не трогает хранилище, если фото не было', async () => {
        authAdapterMock.deleteUser.mockResolvedValue(makeUserRow({ id: 9, avatarUrl: null }));

        await deleteUser(createAdminEvent());

        expect(publishAdapterMock.deleteFile).not.toHaveBeenCalled();
    });

    it('отвечает 404, если учётки нет', async () => {
        authAdapterMock.deleteUser.mockResolvedValue(null);

        expect((await catchThrown(deleteUser, createAdminEvent())).statusCode).toBe(404);
        expect(publishAdapterMock.deleteFile).not.toHaveBeenCalled();
    });
});
