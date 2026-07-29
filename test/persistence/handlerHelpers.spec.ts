// #region Imports
// Vitest
import { afterEach, describe, expect, it, vi } from 'vitest';

// Types
import type { H3Event } from 'h3';

// Utils
import {
    readNormalizedBody,
    toHttpError,
    toPageHttpError,
} from '../../src/runtime/modules/persistence/server/utils/handlerHelpers';
import {
    BricksPagenameConflictError,
    BricksRevisionConflictError,
} from '../../src/runtime/modules/persistence/server/utils/storageErrors';
import { PAGE_CONFLICT_CODES } from '../../src/runtime/modules/common/constants/publish';
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

    it('toPageHttpError: доменные конфликты маппятся на 409 с машиночитаемым кодом', () => {
        const pagenameConflict = catchThrown(() =>
            toPageHttpError(new BricksPagenameConflictError('landing'), 'Failed to save page')
        ) as { statusCode: number; data: { code: string } };

        expect(pagenameConflict.statusCode).toBe(409);
        expect(pagenameConflict.data.code).toBe(PAGE_CONFLICT_CODES.pagename);

        const revisionConflict = catchThrown(() =>
            toPageHttpError(new BricksRevisionConflictError(1), 'Failed to save page')
        ) as { statusCode: number; data: { code: string } };

        expect(revisionConflict.statusCode).toBe(409);
        expect(revisionConflict.data.code).toBe(PAGE_CONFLICT_CODES.revision);
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
