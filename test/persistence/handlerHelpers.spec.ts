// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';

// Utils
import {
    readNormalizedBody,
    rethrowStatementTimeoutError,
    toHttpError,
    toMediaHttpError,
    toPageHttpError,
} from '../../src/runtime/modules/persistence/server/utils/handlerHelpers';
import {
    BricksPageAddressConflictError,
    BricksRevisionConflictError,
    BricksStatementTimeoutError,
    BricksUnknownMediaCategoryError,
} from '../../src/runtime/modules/persistence/server/utils/storageErrors';
import { PAGE_CONFLICT_CODES } from '../../src/runtime/modules/common/constants/publish';
import { BRICKS_API_ERROR_CODES } from '../../src/runtime/modules/common/constants/apiErrors';
// #endregion

/**
 * Минимальный фейковый H3Event с заголовками (паттерн
 * test/persistence/requestBodyLimits.spec.ts / test/server/requestClientIp.spec.ts).
 */
function makeEvent(headers: Record<string, string>): H3Event {
    return {
        node: { req: { headers } },
    } as unknown as H3Event;
}

/** Формат UUID v4 для errorId. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Достаёт брошенную ошибку из never-функции. */
function catchThrown(fn: () => never): unknown {
    try {
        fn();
    } catch (error: unknown) {
        return error;
    }

    throw new Error('Expected function to throw');
}

describe('handlerHelpers: generic 500-envelope', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('toHttpError: h3-ошибки (со statusCode) перебрасываются как есть', () => {
        const httpError = Object.assign(new Error('Payload too large'), { statusCode: 413 });

        expect(catchThrown(() => toHttpError(httpError, 'Failed to save page'))).toBe(httpError);
    });

    it('toHttpError: внутреннее сообщение не утекает наружу, errorId в data и в логе', () => {
        const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const internalError = new Error('connection to server at "10.0.0.5", port 5432 failed');

        const thrown = catchThrown(() => toHttpError(internalError, 'Failed to save page')) as {
            statusCode: number;
            statusMessage: string;
            message: string;
            data: { errorId: string };
        };

        expect(thrown.statusCode).toBe(500);
        expect(thrown.statusMessage).toBe('Failed to save page');
        expect(thrown.message).not.toContain('10.0.0.5');
        expect(thrown.data.errorId).toMatch(UUID_PATTERN);

        // Полная ошибка с тем же errorId — в server-логе (корреляция)
        expect(consoleErrorMock).toHaveBeenCalledWith(
            `[Bricks API] Failed to save page (errorId=${thrown.data.errorId}):`,
            internalError
        );
    });

    it('toHttpError: остановка запроса лимитом БД — 504 с кодом, а не generic 500', () => {
        const consoleErrorMock = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const driverError = Object.assign(
            new Error('canceling statement due to statement timeout'),
            { code: '57014' }
        );
        const cancelled = new BricksStatementTimeoutError(driverError);

        const thrown = catchThrown(() => toHttpError(cancelled, 'Failed to save page')) as {
            statusCode: number;
            message: string;
            data: { code?: string; errorId?: string };
        };

        expect(thrown.statusCode).toBe(504);
        expect(thrown.data.code).toBe(BRICKS_API_ERROR_CODES.statementTimeout);
        // Причина известна, поэтому errorId для корреляции с логом не нужен,
        // а текст PostgreSQL наружу по-прежнему не отдаётся
        expect(thrown.data.errorId).toBeUndefined();
        expect(thrown.message).not.toContain('statement timeout due');
        expect(consoleErrorMock).toHaveBeenCalled();
    });

    it('rethrowStatementTimeoutError: свой статус только у остановки лимитом', () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const thrown = catchThrown(() => {
            rethrowStatementTimeoutError(new BricksStatementTimeoutError());

            throw new Error('Expected function to throw');
        }) as { statusCode: number; data: { code: string } };

        expect(thrown.statusCode).toBe(504);
        expect(thrown.data.code).toBe(BRICKS_API_ERROR_CODES.statementTimeout);

        // Остальное остаётся вызывающему: у middleware авторизации и media-прокси
        // на прочие ошибки свои статусы (503 и 500), и подменять их нельзя
        expect(() => rethrowStatementTimeoutError(new Error('connection refused'))).not.toThrow();
    });

    it('toPageHttpError: доменные конфликты маппятся на 409 с машиночитаемым кодом', () => {
        const pagenameConflict = catchThrown(() =>
            toPageHttpError(new BricksPageAddressConflictError(), 'Failed to save page')
        ) as { statusCode: number; data: { code: string } };

        expect(pagenameConflict.statusCode).toBe(409);
        expect(pagenameConflict.data.code).toBe(PAGE_CONFLICT_CODES.pagename);

        const revisionConflict = catchThrown(() =>
            toPageHttpError(new BricksRevisionConflictError(1), 'Failed to save page')
        ) as { statusCode: number; data: { code: string } };

        expect(revisionConflict.statusCode).toBe(409);
        expect(revisionConflict.data.code).toBe(PAGE_CONFLICT_CODES.revision);
    });

    it('toMediaHttpError: отсутствующая категория — 400 с кодом, а не generic 500', () => {
        // Пришла ли ошибка от ранней проверки ручки или от FK базы, поймавшего
        // удаление категории на лету, клиенту видно быть не должно
        const thrown = catchThrown(() =>
            toMediaHttpError(new BricksUnknownMediaCategoryError('gone'), 'Failed to patch media')
        ) as { statusCode: number; data: { code: string } };

        expect(thrown.statusCode).toBe(400);
        expect(thrown.data.code).toBe(BRICKS_API_ERROR_CODES.unknownMediaCategory);
    });

    it('toMediaHttpError: имя категории наружу не отдаётся', () => {
        const thrown = catchThrown(() =>
            toMediaHttpError(new BricksUnknownMediaCategoryError('gone'), 'Failed to patch media')
        ) as { statusMessage: string };

        expect(thrown.statusMessage).not.toContain('gone');
    });

    it('toMediaHttpError: прочие ошибки идут прежним путём', () => {
        const generic = catchThrown(() =>
            toMediaHttpError(new Error('column mismatch'), 'Failed to patch media')
        ) as { statusCode: number; statusMessage: string };

        expect(generic.statusCode).toBe(500);
        expect(generic.statusMessage).toBe('Failed to patch media');

        const cancelled = catchThrown(() =>
            toMediaHttpError(new BricksStatementTimeoutError(), 'Failed to patch media')
        ) as { statusCode: number; data: { code: string } };

        expect(cancelled.statusCode).toBe(504);
        expect(cancelled.data.code).toBe(BRICKS_API_ERROR_CODES.statementTimeout);
    });
});

describe('handlerHelpers: readNormalizedBody требует application/json', () => {
    it('не-JSON content-type (например form/text) — 415, до чтения тела', async () => {
        const event = makeEvent({ 'content-type': 'text/plain' });

        await expect(readNormalizedBody(event)).rejects.toMatchObject({
            statusCode: 415,
            statusMessage: 'Expected application/json body',
        });
    });
});
