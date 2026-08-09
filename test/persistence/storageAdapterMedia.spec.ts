// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

const { queryMock, queryOneMock, withTransactionMock } = vi.hoisted(() => ({
    queryMock: vi.fn(),
    queryOneMock: vi.fn(),
    withTransactionMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/persistence/server/postgres/client', () => ({
    query: queryMock,
    queryOne: queryOneMock,
    withTransaction: withTransactionMock,
}));

import { createPostgresMediaMethods } from '../../src/runtime/modules/persistence/server/postgres/postgresMediaMethods';
import {
    BricksPostgresQueryNotStartedError,
    BricksStatementTimeoutError,
    BricksStorageWriteRejectedError,
    BricksUnknownMediaCategoryError,
} from '../../src/runtime/modules/persistence/server/utils/storageErrors';
import { toHttpError } from '../../src/runtime/modules/persistence/server/utils/handlerHelpers';
import { BRICKS_API_ERROR_CODES } from '../../src/runtime/modules/common/constants/apiErrors';
import type { ICreateMediaPayload } from '../../src/runtime/modules/persistence/types/adapters';

/** Ошибка pg с SQLSTATE foreign_key_violation. */
function makeForeignKeyViolation(): Error & { code: string } {
    return Object.assign(new Error('insert violates foreign key constraint'), { code: '23503' });
}

/**
 * Ошибка pg с SQLSTATE unique_violation и именем нарушенного ограничения.
 *
 * @param constraint - Имя ограничения (undefined — драйвер имени не прислал).
 * @returns Ошибка драйвера.
 */
function makeUniqueViolation(constraint: string | undefined): Error & { code: string } {
    return Object.assign(new Error('duplicate key value'), { code: '23505', constraint });
}

/** Payload регистрации файла. */
function makeCreatePayload(category: string | null): ICreateMediaPayload {
    return {
        url: 'https://storage.example.com/my-bucket/bricks-media/uuid.webp',
        filename: 'photo.webp',
        size: 1024,
        mimeType: 'image/webp',
        category,
    };
}

describe('postgresMediaMethods: отказ внешнего ключа категории', () => {
    beforeEach(() => {
        queryMock.mockReset();
        queryOneMock.mockReset();
        withTransactionMock.mockReset();
    });

    it('createMedia переводит отказ FK в доменную ошибку с именем категории', async () => {
        queryOneMock.mockRejectedValueOnce(makeForeignKeyViolation());

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload('gone'))
        ).rejects.toMatchObject({
            name: 'BricksUnknownMediaCategoryError',
            category: 'gone',
        });
    });

    it('доменная ошибка FK гарантирует, что запись не применена', async () => {
        // Ровно этой гарантией оркестрация загрузки решает, можно ли удалять
        // уже залитый в бакет файл
        queryOneMock.mockRejectedValueOnce(makeForeignKeyViolation());

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload('gone'))
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);
    });

    it('исходная ошибка pg сохраняется в cause — SQLSTATE нужен в server-логе', async () => {
        const driverError = makeForeignKeyViolation();
        queryOneMock.mockRejectedValueOnce(driverError);

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload('gone'))
        ).rejects.toMatchObject({ cause: driverError });
    });

    it('updateMedia переводит тот же отказ при смене категории', async () => {
        queryOneMock.mockRejectedValueOnce(makeForeignKeyViolation());

        await expect(
            createPostgresMediaMethods().updateMedia(7, { category: 'gone' })
        ).rejects.toBeInstanceOf(BricksUnknownMediaCategoryError);
    });

    it('запись без категории отказ FK не присваивает категории, но отказом считает', async () => {
        // У bricks_media внешний ключ сейчас один, и без условия про категорию
        // будущий второй ключ начал бы врать про несуществующую категорию.
        // Отвергнутой запись при этом остаётся: ограничение отклонило строку
        const driverError = makeForeignKeyViolation();
        queryOneMock.mockRejectedValueOnce(driverError);

        const thrown = await createPostgresMediaMethods()
            .createMedia(makeCreatePayload(null))
            .catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(BricksStorageWriteRejectedError);
        expect(thrown).not.toBeInstanceOf(BricksUnknownMediaCategoryError);
        expect(thrown).toMatchObject({ cause: driverError });
    });

    it('правка имени файла отказ FK своим не считает', async () => {
        const driverError = makeForeignKeyViolation();
        queryOneMock.mockRejectedValueOnce(driverError);

        await expect(
            createPostgresMediaMethods().updateMedia(7, { filename: 'renamed.webp' })
        ).rejects.toBe(driverError);
    });

    it('конфликт индекса url разруливается перечитыванием строки', async () => {
        const existing = {
            id: 7,
            url: 'https://storage.example.com/my-bucket/bricks-media/u.webp',
        };
        queryOneMock
            .mockRejectedValueOnce(makeUniqueViolation('uq_bricks_media_url'))
            .mockResolvedValueOnce(existing);

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload('photos'))
        ).resolves.toBe(existing);
    });

    it('конфликт первичного ключа перечитыванием url не разруливается', async () => {
        // Отставшая sequence (восстановленный дамп) даёт конфликт по pkey:
        // строки с нашим url при этом нет, и уводить такой отказ в поиск по url
        // значило бы вернуть «не нашли» вместо гарантии и бросить файл сиротой
        queryOneMock.mockRejectedValueOnce(makeUniqueViolation('bricks_media_pkey'));

        const thrown = await createPostgresMediaMethods()
            .createMedia(makeCreatePayload('photos'))
            .catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(BricksStorageWriteRejectedError);
        expect(queryOneMock).toHaveBeenCalledTimes(1);
    });

    it('конфликт без имени ограничения перечитывает строку и возвращает её', async () => {
        // Отсутствие имени не доказывает, что конфликт не по url: его можно
        // поднять вручную, а совместимый сервер или прокси — потерять поле
        const existing = {
            id: 7,
            url: 'https://storage.example.com/my-bucket/bricks-media/u.webp',
        };
        queryOneMock
            .mockRejectedValueOnce(makeUniqueViolation(undefined))
            .mockResolvedValueOnce(existing);

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload('photos'))
        ).resolves.toBe(existing);
    });

    it('конфликт без имени ограничения не даёт маркера, даже если строки не нашлось', async () => {
        // Маркер здесь разрешил бы удалить файл под живой записью — цена
        // ошибки несимметрична, поэтому исход остаётся неизвестным
        queryOneMock
            .mockRejectedValueOnce(makeUniqueViolation(undefined))
            .mockResolvedValueOnce(null);

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload('photos'))
        ).rejects.not.toBeInstanceOf(BricksStorageWriteRejectedError);
    });
});

describe('postgresMediaMethods: что считается доказанным отказом вставки', () => {
    beforeEach(() => {
        queryMock.mockReset();
        queryOneMock.mockReset();
        withTransactionMock.mockReset();
    });

    it('неотправленный запрос — доказанный отказ: SQL до базы не дошёл', async () => {
        queryOneMock.mockRejectedValueOnce(
            new BricksPostgresQueryNotStartedError(new Error('database url is not configured'))
        );

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload(null))
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);
    });

    it('несуществующая таблица — доказанный отказ: миграции не накатаны', async () => {
        queryOneMock.mockRejectedValueOnce(
            Object.assign(new Error('relation "bricks_media" does not exist'), { code: '42P01' })
        );

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload(null))
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);
    });

    it('остановка вставки лимитом времени компенсируется и остаётся 504 для клиента', async () => {
        // Обёртка в маркер не должна съесть машиночитаемый код: без обхода
        // причины загрузка отдавала бы generic 500 вместо честного 504
        queryOneMock.mockRejectedValueOnce(new BricksStatementTimeoutError());

        const thrown = await createPostgresMediaMethods()
            .createMedia(makeCreatePayload(null))
            .catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(BricksStorageWriteRejectedError);

        let httpError: unknown;
        try {
            toHttpError(thrown, 'Failed to upload media file');
        } catch (error: unknown) {
            httpError = error;
        }

        expect(httpError).toMatchObject({
            statusCode: 504,
            data: { code: BRICKS_API_ERROR_CODES.statementTimeout },
        });
    });

    it('SQLSTATE неизвестного исхода доказанным отказом не считается', async () => {
        // 08007 и 40003 прямо означают «результат неизвестен»: правило «есть
        // код — значит откачено» разрешило бы удалить файл под живой записью
        for (const code of ['08007', '40003']) {
            queryOneMock.mockRejectedValueOnce(
                Object.assign(new Error(`outcome unknown ${code}`), { code })
            );

            await expect(
                createPostgresMediaMethods().createMedia(makeCreatePayload(null))
            ).rejects.not.toBeInstanceOf(BricksStorageWriteRejectedError);
        }
    });

    it('переросший колонку MIME — доказанный отказ, а не неизвестный исход', async () => {
        // Для SVG в базу уходит клиентский Content-Type как есть, а колонка
        // ограничена по длине: без этого класса файл оставался бы сиротой
        queryOneMock.mockRejectedValueOnce(
            Object.assign(new Error('value too long for type character varying(255)'), {
                code: '22001',
            })
        );

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload(null))
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);
    });

    it('несуществующая колонка — доказанный отказ', async () => {
        queryOneMock.mockRejectedValueOnce(
            Object.assign(new Error('column "mock_url" does not exist'), { code: '42703' })
        );

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload(null))
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);
    });

    it('исчерпание ресурсов и вмешательство оператора остаются неизвестными', async () => {
        // Классы 53 и 57 доказательства отката не дают: их разбирать отдельно,
        // а по умолчанию исход неизвестен
        for (const code of ['53100', '57P01']) {
            queryOneMock.mockRejectedValueOnce(
                Object.assign(new Error(`server-side failure ${code}`), { code })
            );

            await expect(
                createPostgresMediaMethods().createMedia(makeCreatePayload(null))
            ).rejects.not.toBeInstanceOf(BricksStorageWriteRejectedError);
        }
    });

    it('отказ перечитывания после конфликта маркера не получает', async () => {
        // Строка по этому url существует — иначе не было бы конфликта; удалять
        // файл нельзя ни при таймауте чтения, ни при исчезнувшей строке
        queryOneMock
            .mockRejectedValueOnce(makeUniqueViolation('uq_bricks_media_url'))
            .mockRejectedValueOnce(new BricksStatementTimeoutError());

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload(null))
        ).rejects.not.toBeInstanceOf(BricksStorageWriteRejectedError);

        queryOneMock
            .mockRejectedValueOnce(makeUniqueViolation('uq_bricks_media_url'))
            .mockResolvedValueOnce(null);

        await expect(
            createPostgresMediaMethods().createMedia(makeCreatePayload(null))
        ).rejects.not.toBeInstanceOf(BricksStorageWriteRejectedError);
    });
});
