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

import { createPostgresTemplateMethods } from '../../src/runtime/modules/persistence/server/postgres/postgresTemplateMethods';
import {
    BricksPostgresQueryNotStartedError,
    BricksStatementTimeoutError,
    BricksStorageWriteRejectedError,
    BricksTemplateNameConflictError,
} from '../../src/runtime/modules/persistence/server/utils/storageErrors';
import type { ICreateTemplatePayload } from '../../src/runtime/modules/common/types/templates';

/**
 * Вставка шаблона несёт внешний побочный эффект — скопированный файл превью, —
 * и убрать его ручка вправе только под гарантию, что строки нет. Поэтому
 * доказанные отказы базы обязаны приходить маркером отвергнутой записи, а
 * неизвестный исход — оставаться неизвестным: ошибка в первую сторону оставляет
 * файл-сироту, во вторую — удаляет картинку из-под живого шаблона.
 */

// #region Fixtures
/** Payload создания шаблона. */
function makeCreatePayload(): ICreateTemplatePayload {
    return {
        name: 'Лендинг продукта',
        description: null,
        schema: { components: [] },
        pageMeta: { layout: null, backgroundColor: null, viewportConfig: null },
        thumbnailUrl: 'https://bucket.example/bricks-thumbnails/template-uuid.webp',
    };
}

/**
 * Ошибка pg с заданным SQLSTATE.
 *
 * @param code - Код SQLSTATE.
 * @param constraint - Имя нарушенного ограничения; не передан — драйвер имени не
 * прислал.
 * @returns Ошибка драйвера.
 */
function makePgError(code: string, constraint?: string): Error & { code: string } {
    return Object.assign(new Error(`pg error ${code}`), {
        code,
        ...(constraint === undefined ? {} : { constraint }),
    });
}
// #endregion

describe('postgresTemplateMethods: исход вставки шаблона', () => {
    beforeEach(() => {
        queryMock.mockReset();
        queryOneMock.mockReset();
        withTransactionMock.mockReset();
    });

    it('занятое имя приходит доменным конфликтом, а не маркером отказа', async () => {
        // Клиенту нужен именно конфликт: по нему форма краснеет полем имени
        queryOneMock.mockRejectedValueOnce(makePgError('23505'));

        await expect(
            createPostgresTemplateMethods().createTemplate(makeCreatePayload())
        ).rejects.toBeInstanceOf(BricksTemplateNameConflictError);
    });

    it('нарушение индекса имени — тот же доменный конфликт', async () => {
        queryOneMock.mockRejectedValueOnce(makePgError('23505', 'bricks_templates_name_key'));

        await expect(
            createPostgresTemplateMethods().createTemplate(makeCreatePayload())
        ).rejects.toBeInstanceOf(BricksTemplateNameConflictError);
    });

    // Отставшая после восстановления дампа SERIAL-sequence упирает вставку в
    // первичный ключ. Имя при этом свободно, и конфликт имени показал бы форме
    // красное поле там, где чинить нужно базу. Строки нет — значит это доказанный
    // отказ, и скопированное превью ручка вправе удалить
    it('нарушение первичного ключа — доказанный отказ, а не занятое имя', async () => {
        queryOneMock.mockRejectedValueOnce(makePgError('23505', 'bricks_templates_pkey'));

        const thrown = await createPostgresTemplateMethods()
            .createTemplate(makeCreatePayload())
            .catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(BricksStorageWriteRejectedError);
        expect(thrown).not.toBeInstanceOf(BricksTemplateNameConflictError);
    });

    it('неотправленный запрос — доказанный отказ', async () => {
        queryOneMock.mockRejectedValueOnce(
            new BricksPostgresQueryNotStartedError(new Error('database url is not configured'))
        );

        await expect(
            createPostgresTemplateMethods().createTemplate(makeCreatePayload())
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);
    });

    it('остановка лимитом времени и несуществующая таблица — тоже доказанный отказ', async () => {
        queryOneMock.mockRejectedValueOnce(new BricksStatementTimeoutError());

        await expect(
            createPostgresTemplateMethods().createTemplate(makeCreatePayload())
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);

        queryOneMock.mockRejectedValueOnce(makePgError('42P01'));

        await expect(
            createPostgresTemplateMethods().createTemplate(makeCreatePayload())
        ).rejects.toBeInstanceOf(BricksStorageWriteRejectedError);
    });

    it('SQLSTATE неизвестного исхода маркером не оборачивается', async () => {
        // `08007` и `40003` прямо означают «результат неизвестен»: строка могла
        // появиться, и удалять её картинку нельзя
        for (const code of ['08007', '40003', '57014']) {
            queryOneMock.mockRejectedValueOnce(makePgError(code));

            const thrown = await createPostgresTemplateMethods()
                .createTemplate(makeCreatePayload())
                .catch((error: unknown) => error);

            expect(thrown).not.toBeInstanceOf(BricksStorageWriteRejectedError);
            expect(thrown).not.toBeInstanceOf(BricksTemplateNameConflictError);
        }
    });

    it('обрыв соединения без кода остаётся неизвестным исходом', async () => {
        queryOneMock.mockRejectedValueOnce(new Error('socket hang up'));

        const thrown = await createPostgresTemplateMethods()
            .createTemplate(makeCreatePayload())
            .catch((error: unknown) => error);

        expect(thrown).not.toBeInstanceOf(BricksStorageWriteRejectedError);
    });

    it('правка подписи переводит занятое имя в тот же доменный конфликт', async () => {
        queryOneMock.mockRejectedValueOnce(makePgError('23505'));

        await expect(
            createPostgresTemplateMethods().updateTemplate(3, { name: 'Занято' })
        ).rejects.toBeInstanceOf(BricksTemplateNameConflictError);
    });

    it('удаление отдаёт URL превью — по нему ручка убирает файл', async () => {
        queryOneMock.mockResolvedValueOnce({ thumbnailUrl: 'https://bucket.example/t.webp' });

        expect(await createPostgresTemplateMethods().deleteTemplate(3)).toEqual({
            thumbnailUrl: 'https://bucket.example/t.webp',
        });

        queryOneMock.mockResolvedValueOnce(null);

        expect(await createPostgresTemplateMethods().deleteTemplate(3)).toBeNull();
    });
});
