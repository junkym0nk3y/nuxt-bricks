/**
 * Integration smoke external media flow (backend.mode = 'external', план Р2):
 * реальный HttpStorageAdapter против fake external backend (node http-сервер),
 * реальный sharp в валидации/оптимизации, in-memory S3 publish-фейк.
 *
 * Проверяет инварианты разделения данных и файлов: external backend получает
 * только JSON metadata (никогда binary), файл уходит в локальный S3-пайплайн;
 * отказ metadata-записи компенсируется удалением S3-объекта; удаление медиа —
 * file-first; thumbnail — обычный PATCH через storage-адаптер. Media/publish
 * handlers при этом не меняются — оркестрация та же, что у builtin.
 */
// #region Imports
// Types
import type { AddressInfo } from 'node:net';
import type { IUploadFileParams } from '../src/runtime/modules/persistence/types/adapters';
import type { IUploadedFilePart } from '../src/runtime/modules/persistence/types/media';

// Node
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

// Vitest
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// mediaProcessing → imageProcessing тянет nitropack/runtime (useAppConfig) —
// в node-тестах стабим (тот же паттерн, что persistenceMediaUploadSvg.spec.ts)
vi.mock('nitropack/runtime', () => ({
    useAppConfig: () => ({}),
    useRuntimeConfig: () => ({}),
}));

// Utils
import sharp from 'sharp';
import { createHttpStorageAdapter } from '../src/runtime/modules/persistence/server/http/httpStorageAdapter';
import {
    uploadAndRegisterMedia,
    deleteMediaWithFile,
    type IMediaOrchestrationDeps,
} from '../src/runtime/modules/persistence/server/utils/mediaOrchestration';
import { validateAndOptimizeImage } from '../src/runtime/modules/persistence/server/utils/mediaProcessing';
import { sniffImageFormat } from '../src/runtime/modules/persistence/server/utils/fileSignatures';
// #endregion

// #region Types
interface IRecordedRequest {
    method: string;
    path: string;
    contentType: string;
    authorization: string;
    body: unknown;
}

interface IFakeBackendState {
    /** Записи медиа, которые отдаёт GET {base}/media (сырой snake_case формат). */
    mediaRows: Array<Record<string, unknown>>;
    /** Следующий POST {base}/media отвечает 500 (сценарий компенсации). */
    failNextCreateMedia: boolean;
}
// #endregion

// #region Constants
const BACKEND_TOKEN = 'smoke-token';
const S3_PUBLIC_BASE = 'https://storage.example.com/bucket/bricks-media/';
// #endregion

// #region Fake external backend
const requests: IRecordedRequest[] = [];
/** Общий журнал порядка операций S3-фейка и external backend (file-first). */
const ops: string[] = [];
const state: IFakeBackendState = { mediaRows: [], failNextCreateMedia: false };

let server: Server;
let baseUrl = '';

/**
 * Читает тело запроса fake backend целиком.
 */
async function readRequestBody(request: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];

    for await (const chunk of request) {
        chunks.push(chunk as Buffer);
    }

    return Buffer.concat(chunks).toString('utf8');
}

/**
 * Отвечает JSON-телом с указанным статусом.
 */
function respondJson(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(body === undefined ? undefined : JSON.stringify(body));
}

/**
 * Роутинг fake external backend: зеркало контрактных ручек относительно /cms.
 */
async function handleBackendRequest(
    request: IncomingMessage,
    response: ServerResponse
): Promise<void> {
    const path = (request.url ?? '').split('?')[0];
    const rawBody = await readRequestBody(request);
    const recorded: IRecordedRequest = {
        method: request.method ?? '',
        path,
        contentType: String(request.headers['content-type'] ?? ''),
        authorization: String(request.headers.authorization ?? ''),
        body: rawBody ? JSON.parse(rawBody) : null,
    };

    requests.push(recorded);
    ops.push(`backend:${recorded.method}:${path}`);

    if (recorded.method === 'POST' && path === '/cms/media') {
        if (state.failNextCreateMedia) {
            state.failNextCreateMedia = false;
            respondJson(response, 500, { message: 'metadata write failed' });

            return;
        }

        const payload = recorded.body as Record<string, unknown>;
        const row = {
            id: state.mediaRows.length + 1,
            url: payload.url,
            filename: payload.filename,
            alt: '',
            size: payload.size,
            uploaded_at: '2026-07-12T00:00:00.000Z',
            mime_type: payload.mimeType,
            category: payload.category,
            svg_content: payload.svgContent ?? null,
        };

        state.mediaRows.push(row);
        respondJson(response, 201, row);

        return;
    }

    if (recorded.method === 'GET' && path === '/cms/media') {
        respondJson(response, 200, state.mediaRows);

        return;
    }

    const deleteMediaMatch = path.match(/^\/cms\/media\/(\d+)$/);

    if (recorded.method === 'DELETE' && deleteMediaMatch) {
        const id = Number(deleteMediaMatch[1]);

        state.mediaRows = state.mediaRows.filter((row) => row.id !== id);
        respondJson(response, 204, undefined);

        return;
    }

    const pageMatch = path.match(/^\/cms\/(\d+)$/);

    if (recorded.method === 'PATCH' && pageMatch) {
        const payload = recorded.body as Record<string, unknown>;

        respondJson(response, 200, {
            id: Number(pageMatch[1]),
            pagename: 'landing',
            thumbnail_url: payload.thumbnailUrl ?? null,
            revision: 3,
        });

        return;
    }

    respondJson(response, 404, { message: 'not found' });
}
// #endregion

// #region Fake S3 publish adapter
/**
 * In-memory S3-фейк: хранит загруженные объекты, журналирует порядок операций.
 */
function createPublishFake(overrides: { deleteFileError?: Error } = {}) {
    const objects = new Map<string, Buffer>();

    return {
        objects,
        adapter: {
            buildFileKey(kind: string, filename: string): string {
                return `bricks-media/${kind}-${filename}`;
            },
            async uploadFile(params: IUploadFileParams) {
                const url = `${S3_PUBLIC_BASE}${params.key.replace('bricks-media/', '')}`;

                objects.set(url, params.buffer);
                ops.push(`s3:upload:${url}`);

                return { url, key: params.key, size: params.buffer.length };
            },
            async deleteFile(url: string): Promise<void> {
                ops.push(`s3:delete:${url}`);

                if (overrides.deleteFileError) {
                    throw overrides.deleteFileError;
                }

                objects.delete(url);
            },
            isOwnedUrl(url: string): boolean {
                return url.startsWith(S3_PUBLIC_BASE);
            },
        } satisfies IMediaOrchestrationDeps['publish'],
    };
}
// #endregion

// #region Helpers
/**
 * Реальный HttpStorageAdapter поверх fake backend.
 */
function createAdapter() {
    return createHttpStorageAdapter({ baseUrl, token: BACKEND_TOKEN });
}

/**
 * Генерирует настоящий PNG и оборачивает его в multipart-часть загрузки.
 */
async function makePngUpload(): Promise<IUploadedFilePart> {
    const png = await sharp({
        create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 40, b: 40 } },
    })
        .png()
        .toBuffer();

    return { name: 'file', filename: 'photo.png', type: 'image/png', data: png };
}
// #endregion

beforeAll(async () => {
    server = createServer((request, response) => {
        handleBackendRequest(request, response).catch(() => {
            respondJson(response, 500, { message: 'fake backend error' });
        });
    });

    await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/cms`;
});

afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
});

beforeEach(() => {
    requests.length = 0;
    ops.length = 0;
    state.mediaRows = [];
    state.failNextCreateMedia = false;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('External media smoke: upload → sharp → S3 → JSON metadata', () => {
    it('файл обрабатывается sharp и уходит в S3, external получает только JSON metadata с Bearer', async () => {
        const file = await makePngUpload();
        const validated = await validateAndOptimizeImage(file, 10 * 1024 * 1024, 10, {
            maxWidth: 1920,
            quality: 80,
        });

        // Реальный sharp: растр конвертирован в WebP (magic bytes, не заявленный тип)
        expect(validated.mimeType).toBe('image/webp');
        expect(sniffImageFormat(validated.optimizedBuffer)).toBe('webp');

        const publish = createPublishFake();
        const media = await uploadAndRegisterMedia(
            { storage: createAdapter(), publish: publish.adapter },
            {
                buffer: validated.optimizedBuffer,
                mimeType: validated.mimeType,
                storedFilename: 'uuid.webp',
                displayFilename: 'photo.webp',
                category: 'image',
            }
        );

        // Binary остался в локальном S3-пайплайне
        const uploadedUrl = `${S3_PUBLIC_BASE}media-uuid.webp`;
        expect(publish.objects.get(uploadedUrl)).toEqual(validated.optimizedBuffer);

        // External backend получил ровно один server-to-server JSON-запрос без binary
        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('POST');
        expect(requests[0].path).toBe('/cms/media');
        expect(requests[0].contentType).toBe('application/json');
        expect(requests[0].authorization).toBe(`Bearer ${BACKEND_TOKEN}`);
        expect(requests[0].body).toEqual({
            url: uploadedUrl,
            filename: 'photo.webp',
            size: validated.optimizedBuffer.length,
            mimeType: 'image/webp',
            category: 'image',
            svgContent: null,
        });

        // Ответ backend (snake_case) нормализован в IMediaItem
        expect(media).toMatchObject({
            id: 1,
            url: uploadedUrl,
            mimeType: 'image/webp',
            uploadedAt: '2026-07-12T00:00:00.000Z',
        });
    });

    it('отказ external metadata-записи компенсируется удалением загруженного S3-объекта', async () => {
        state.failNextCreateMedia = true;
        const publish = createPublishFake();

        await expect(
            uploadAndRegisterMedia(
                { storage: createAdapter(), publish: publish.adapter },
                {
                    buffer: Buffer.from('webp-bytes'),
                    mimeType: 'image/webp',
                    storedFilename: 'orphan.webp',
                    displayFilename: 'orphan.webp',
                    category: 'image',
                }
            )
        ).rejects.toThrow('HTTP 500');

        const uploadedUrl = `${S3_PUBLIC_BASE}media-orphan.webp`;
        expect(ops).toEqual([
            `s3:upload:${uploadedUrl}`,
            'backend:POST:/cms/media',
            `s3:delete:${uploadedUrl}`,
        ]);
        expect(publish.objects.size).toBe(0);
    });
});

describe('External media smoke: file-first delete', () => {
    const ownedUrl = `${S3_PUBLIC_BASE}existing.webp`;

    beforeEach(() => {
        state.mediaRows = [
            {
                id: 5,
                url: ownedUrl,
                filename: 'existing.webp',
                alt: '',
                size: 100,
                uploaded_at: '2026-07-12T00:00:00.000Z',
                mime_type: 'image/webp',
                category: 'image',
                svg_content: null,
            },
        ];
    });

    it('S3-объект удаляется ДО удаления metadata на external backend', async () => {
        const publish = createPublishFake();

        const deleted = await deleteMediaWithFile(
            { storage: createAdapter(), publish: publish.adapter },
            5
        );

        expect(deleted).toBe(true);
        // getMedia HTTP-адаптера — list+find, затем file-first порядок
        expect(ops).toEqual([
            'backend:GET:/cms/media',
            `s3:delete:${ownedUrl}`,
            'backend:DELETE:/cms/media/5',
        ]);
        expect(state.mediaRows).toHaveLength(0);
    });

    it('ошибка S3 → 502, metadata-запись на external остаётся (безопасный ретрай)', async () => {
        const publish = createPublishFake({ deleteFileError: new Error('s3 down') });

        await expect(
            deleteMediaWithFile({ storage: createAdapter(), publish: publish.adapter }, 5)
        ).rejects.toMatchObject({ statusCode: 502 });

        expect(ops).toEqual(['backend:GET:/cms/media', `s3:delete:${ownedUrl}`]);
        expect(state.mediaRows).toHaveLength(1);
    });
});

describe('External media smoke: thumbnail PATCH', () => {
    it('thumbnail URL уходит обычным PATCH страницы через storage-адаптер', async () => {
        const thumbnailUrl = 'https://storage.example.com/bucket/bricks-thumbnails/7.webp?v=2';

        const page = await createAdapter().updatePage(7, { thumbnailUrl });

        expect(requests).toHaveLength(1);
        expect(requests[0].method).toBe('PATCH');
        expect(requests[0].path).toBe('/cms/7');
        expect(requests[0].body).toEqual({ thumbnailUrl });
        expect(page?.thumbnailUrl).toBe(thumbnailUrl);
    });
});
