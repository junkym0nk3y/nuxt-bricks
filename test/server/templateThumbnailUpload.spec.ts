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
import { BricksStorageWriteRejectedError } from '../../src/runtime/modules/persistence/server/utils/storageErrors';
// #endregion

/**
 * The preview of a template edited in the builder: the endpoint writes the URL of the
 * new frame into the row itself and removes the previous file. The order is the point:
 * removing the previous file before the row points elsewhere would leave the card with
 * a broken picture whenever the write fails, and removing the new file after a write of
 * unknown outcome would do the same to a row that did take it.
 */

// #region Mocks
const { storageMock, publishMock, formParts, calls } = vi.hoisted(() => ({
    storageMock: {
        getTemplate: vi.fn(),
        updateTemplate: vi.fn(),
    },
    publishMock: {
        buildFileKey: vi.fn(),
        uploadFile: vi.fn(),
        deleteFile: vi.fn(),
        isOwnedUrl: vi.fn(),
    },
    formParts: { value: [] as IUploadedFilePart[] },
    /** The chronology of the calls to the storage and the database */
    calls: [] as string[],
}));

vi.mock('nitropack/runtime', () => ({
    useRuntimeConfig: () => ({}),
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksStorageAdapter: () => storageMock,
    useBricksPublishAdapter: () => publishMock,
}));

vi.mock(
    '../../src/runtime/modules/persistence/server/utils/multipartStream',
    async (importOriginal) => ({
        ...(await importOriginal<Record<string, unknown>>()),
        withMultipartFormData: async (
            _event: H3Event,
            _maxBytes: number,
            use: (parts: IUploadedFilePart[]) => Promise<unknown>
        ) => use(formParts.value),
    })
);

const uploadThumbnail = (
    await import('../../src/runtime/server/api/bricks/templates/[id]/thumbnail.post')
).default;
// #endregion

// #region Fixtures
const PREVIOUS_URL = 'https://s3.example/bucket/bricks-thumbnails/template-old.webp';

/**
 * A template row as the adapter returns it.
 *
 * @param thumbnailUrl - The preview of the row.
 * @returns The row.
 */
function makeTemplateRow(thumbnailUrl: string | null): Record<string, unknown> {
    return {
        id: 5,
        name: 'Landing',
        description: null,
        thumbnailUrl,
        schema: { components: [] },
        pageMeta: { layout: null, backgroundColor: null, viewportConfig: null },
        createdAt: '2026-11-20T00:00:00.000Z',
        updatedAt: '2026-11-26T00:00:00.000Z',
    };
}

/**
 * Runs the handler and returns what it threw.
 *
 * @returns The caught error.
 */
async function catchThrown(): Promise<IThrownHttpError> {
    try {
        await uploadThumbnail(createEvent());
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected handler to throw');
}

/**
 * The request for the preview of template 5.
 *
 * @returns The h3 event in its minimal shape.
 */
function createEvent(): H3Event {
    return createFakeH3Event({
        path: '/api/bricks/templates/5/thumbnail',
        method: 'POST',
        context: { params: { id: '5' } },
    });
}
// #endregion

beforeEach(async () => {
    vi.clearAllMocks();
    calls.length = 0;
    formParts.value = [
        {
            name: 'file',
            filename: 'frame.png',
            type: 'image/png',
            data: await sharp({
                create: { width: 960, height: 600, channels: 3, background: '#3355ff' },
            })
                .png()
                .toBuffer(),
        },
    ];

    storageMock.getTemplate.mockResolvedValue(makeTemplateRow(PREVIOUS_URL));
    publishMock.buildFileKey.mockImplementation(
        (kind: string, filename: string) => `bricks-${kind}s/${filename}`
    );
    publishMock.uploadFile.mockImplementation(({ key }: { key: string }) => {
        calls.push(`upload:${key}`);

        return { url: `https://s3.example/bucket/${key}`, key, size: 1024 };
    });
    publishMock.deleteFile.mockImplementation((url: string) => {
        calls.push(`delete:${url}`);
    });
    publishMock.isOwnedUrl.mockReturnValue(true);
});

describe('POST /api/bricks/templates/:id/thumbnail', () => {
    it('points the template at the new frame and only then removes the previous file', async () => {
        storageMock.updateTemplate.mockImplementation(
            (_id: number, change: { thumbnailUrl: string }) => {
                calls.push(`write:${change.thumbnailUrl}`);

                return makeTemplateRow(change.thumbnailUrl);
            }
        );

        const response = await uploadThumbnail(createEvent());
        const uploaded = publishMock.uploadFile.mock.calls[0][0];

        expect((await sharp(uploaded.buffer).metadata()).width).toBe(480);
        expect(calls).toEqual([
            expect.stringMatching(/^upload:bricks-thumbnails\/template-[0-9a-f-]+\.webp$/),
            expect.stringMatching(/^write:https:\/\/s3\.example\/bucket\/bricks-thumbnails\//),
            `delete:${PREVIOUS_URL}`,
        ]);
        expect(storageMock.updateTemplate).toHaveBeenCalledWith(5, {
            thumbnailUrl: expect.stringContaining('/template-'),
        });
        expect(response).toEqual(
            expect.objectContaining({ id: 5, thumbnailUrl: expect.stringContaining('/template-') })
        );
    });

    it('removes the new frame when the template vanished while it was uploading', async () => {
        storageMock.updateTemplate.mockResolvedValue(null);

        expect((await catchThrown()).statusCode).toBe(404);
        expect(calls).toEqual([
            expect.stringMatching(/^upload:/),
            expect.stringMatching(
                /^delete:https:\/\/s3\.example\/bucket\/bricks-thumbnails\/template-/
            ),
        ]);
    });

    it('removes the new frame when the database proved the write refused', async () => {
        storageMock.updateTemplate.mockRejectedValue(
            new BricksStorageWriteRejectedError('Template row was rejected by the database')
        );

        expect((await catchThrown()).statusCode).toBe(500);
        expect(calls).toEqual([
            expect.stringMatching(/^upload:/),
            expect.stringMatching(
                /^delete:https:\/\/s3\.example\/bucket\/bricks-thumbnails\/template-/
            ),
        ]);
    });

    it('keeps both files when the write of the row fails with an unknown outcome', async () => {
        // The statement could have committed before the connection broke: removing the
        // new file then would take the picture from under the row
        storageMock.updateTemplate.mockRejectedValue(new Error('Connection terminated'));

        expect((await catchThrown()).statusCode).toBe(500);
        expect(publishMock.deleteFile).not.toHaveBeenCalled();
    });
});
