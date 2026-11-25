/**
 * The document path of POST /api/bricks/media/upload over a real multipart body: the
 * routing by kind, the content check and the object the publish adapter receives. Only
 * the adapters are fakes.
 *
 * What a landing needs from the object is that a link downloads it under the name the
 * editor uploaded, so the disposition is asserted on what reaches the adapter rather
 * than on the helper that builds it.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { IThrownHttpError } from '../helpers/types';

// Helpers
import { buildMultipartBody, createMultipartEvent } from '../helpers/multipartRequests';
// #endregion

// #region Mocks
const { createMediaMock, uploadFileMock, appConfig } = vi.hoisted(() => ({
    createMediaMock: vi.fn(),
    uploadFileMock: vi.fn(),
    appConfig: { value: {} as Record<string, unknown> },
}));

vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => ({}) }));

vi.mock('#imports', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    useAppConfig: () => appConfig.value,
}));

vi.mock('../../src/runtime/modules/persistence/server/defaultStorage', () => ({
    getBricksDefaultStorageFactory: () => undefined,
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksStorageAdapter: () => ({
        createMedia: createMediaMock,
        listMediaCategories: vi.fn().mockResolvedValue([]),
    }),
    useBricksPublishAdapter: () => ({
        buildFileKey: (kind: string, filename: string): string => `bricks-${kind}/${filename}`,
        uploadFile: uploadFileMock,
        deleteFile: vi.fn(),
        isOwnedUrl: (): boolean => true,
    }),
}));

vi.mock('../../src/runtime/server/utils/requestRateLimiter', () => ({
    assertWithinRateLimit: vi.fn(),
    createFixedWindowRateLimiter: () => ({ hit: () => 0 }),
}));

import uploadMediaHandler from '../../src/runtime/server/api/bricks/media/upload.post';
// #endregion

// #region Fixtures
/**
 * Builds a zip with stored (uncompressed) entries — enough for the content check,
 * which reads the names out of the central directory.
 *
 * @param names - Entry names, in order.
 * @param comment - The archive comment after the end record.
 * @returns The zip bytes.
 */
function buildZip(names: string[], comment: Buffer = Buffer.alloc(0)): Buffer {
    const locals: Buffer[] = [];
    const centrals: Buffer[] = [];
    let offset = 0;

    for (const name of names) {
        const nameBytes = Buffer.from(name, 'utf8');
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(nameBytes.length, 26);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(nameBytes.length, 28);
        central.writeUInt32LE(offset, 42);
        locals.push(local, nameBytes);
        centrals.push(central, nameBytes);
        offset += local.length + nameBytes.length;
    }

    const directory = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(names.length, 8);
    end.writeUInt16LE(names.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(comment.length, 20);

    return Buffer.concat([...locals, directory, end, comment]);
}

/**
 * An end record closing the file that points at no directory: one entry promised, the
 * walk starts at the first local header and fails on its first step.
 */
function buildForgedEndRecord(): Buffer {
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(1, 10);

    return end;
}

/**
 * Builds a stub of an OLE compound file: the signature, then the names of the streams
 * in UTF-16LE, the way the directory of a real one stores them.
 *
 * @param streams - Stream names.
 * @returns The file bytes.
 */
function buildCompoundFile(streams: string[]): Buffer {
    return Buffer.concat([
        Buffer.from('d0cf11e0a1b11ae1', 'hex'),
        Buffer.alloc(504),
        ...streams.map((stream) => Buffer.from(stream, 'utf16le')),
    ]);
}

const DOCX_ENTRIES = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml'];
const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj << >> endobj\n%%EOF\n', 'latin1');
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
// #endregion

/** The error the handler threw. */
async function catchHandlerError(
    event: Parameters<typeof uploadMediaHandler>[0]
): Promise<IThrownHttpError> {
    try {
        await uploadMediaHandler(event);
    } catch (error: unknown) {
        return error as IThrownHttpError;
    }

    throw new Error('Expected the handler to throw');
}

describe('POST /media/upload: documents', () => {
    beforeEach(() => {
        createMediaMock.mockReset();
        uploadFileMock.mockReset();
        appConfig.value = {};

        createMediaMock.mockImplementation((payload: Record<string, unknown>) => ({
            id: 1,
            ...payload,
        }));
        uploadFileMock.mockImplementation(({ key, buffer }: { key: string; buffer: Buffer }) => ({
            url: `https://storage.example.com/${key}`,
            key,
            size: buffer.length,
        }));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('stores a PDF as is, downloadable under its Cyrillic name', async () => {
        const { event } = createMultipartEvent(
            buildMultipartBody([
                {
                    name: 'file',
                    filename: 'Презентация (2026).pdf',
                    type: 'application/pdf',
                    data: PDF_BYTES,
                },
            ])
        );

        await uploadMediaHandler(event);

        expect(uploadFileMock).toHaveBeenCalledTimes(1);
        expect(uploadFileMock).toHaveBeenCalledWith(
            expect.objectContaining({
                key: expect.stringMatching(/^bricks-media\/[0-9a-f-]{36}\.pdf$/),
                mimeType: 'application/pdf',
                buffer: PDF_BYTES,
                contentDisposition:
                    'attachment; filename="___________ (2026).pdf"; ' +
                    "filename*=UTF-8''%D0%9F%D1%80%D0%B5%D0%B7%D0%B5%D0%BD%D1%82%D0%B0%D1%86%D0%B8%D1%8F%20%282026%29.pdf",
            })
        );
        expect(createMediaMock).toHaveBeenCalledWith(
            expect.objectContaining({
                filename: 'Презентация (2026).pdf',
                mimeType: 'application/pdf',
                previewUrl: null,
                mockUrl: null,
            })
        );
    });

    it('takes the format from the content: a DOCX named .xlsx is stored and downloaded as .docx', async () => {
        const { event } = createMultipartEvent(
            buildMultipartBody([
                {
                    name: 'file',
                    filename: 'brief.xlsx',
                    type: XLSX_MIME,
                    data: buildZip(DOCX_ENTRIES),
                },
            ])
        );

        await uploadMediaHandler(event);

        expect(uploadFileMock).toHaveBeenCalledWith(
            expect.objectContaining({
                key: expect.stringMatching(/\.docx$/),
                mimeType: DOCX_MIME,
                contentDisposition: expect.stringContaining('filename="brief.docx"'),
            })
        );
    });

    it.each([
        ['a DOCX carrying a VBA project', buildZip([...DOCX_ENTRIES, 'word/vbaProject.bin'])],
        [
            'an XLSX carrying an Excel 4.0 macro sheet',
            buildZip(['[Content_Types].xml', 'xl/workbook.xml', 'xl/macrosheets/sheet1.xml']),
        ],
        // The legacy binary formats are not taken at all, a clean file included: the
        // macro sheets of an XLS live inside the workbook stream itself
        ['a legacy XLS', buildCompoundFile(['Root Entry', 'Workbook'])],
        ['a legacy DOC', buildCompoundFile(['Root Entry', 'WordDocument'])],
        ['a zip that is not an Office package', buildZip(['readme.txt', 'word/notes.txt'])],
        // Only the record closing the file is walked: falling back to earlier ones let a
        // tail of forged records cost a full directory walk each, synchronously
        [
            'a DOCX whose tail carries a forged end record',
            buildZip(DOCX_ENTRIES, buildForgedEndRecord()),
        ],
        ['an HTML page named .pdf', Buffer.from('<html><body>hi</body></html>', 'utf8')],
    ])('refuses %s before anything reaches storage', async (_case, data) => {
        const { event } = createMultipartEvent(
            buildMultipartBody([{ name: 'file', filename: 'file.docx', type: DOCX_MIME, data }])
        );

        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(400);
        expect(uploadFileMock).not.toHaveBeenCalled();
        expect(createMediaMock).not.toHaveBeenCalled();
    });

    it('refuses a document at its own ceiling, not at the image one', async () => {
        appConfig.value = {
            bricks: { media: { maxUploadSizeMb: 10, maxDocumentUploadSizeMb: 1 } },
        };
        const oversized = Buffer.concat([PDF_BYTES, Buffer.alloc(1024 * 1024, 0x20)]);
        const { event } = createMultipartEvent(
            buildMultipartBody([
                { name: 'file', filename: 'big.pdf', type: 'application/pdf', data: oversized },
            ])
        );

        const thrown = await catchHandlerError(event);

        expect(thrown.statusCode).toBe(413);
        expect(uploadFileMock).not.toHaveBeenCalled();
    });
});
