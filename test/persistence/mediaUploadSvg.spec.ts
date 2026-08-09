// #region Imports
// Types
import type {
    IResolvedMediaConfig,
    IUploadedFilePart,
} from '../../src/runtime/modules/persistence/types/media';
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
import type {
    ICreateMediaPayload,
    IUploadFileParams,
} from '../../src/runtime/modules/persistence/types/adapters';

// Vitest
import { describe, expect, it, vi } from 'vitest';

// mediaProcessing → imageProcessing тянет nitropack/runtime (useAppConfig) —
// в node-тестах стабим (тот же паттерн, что test/persistence/mediaImport.spec.ts)
vi.mock('nitropack/runtime', () => ({
    useAppConfig: () => ({}),
    useRuntimeConfig: () => ({}),
}));

// Utils
import { prepareUpload } from '../../src/runtime/server/api/bricks/media/upload.post';
import { sanitizeSvgMarkup } from '../../src/runtime/modules/common/utils/sanitize/sanitizeSvg';
import {
    uploadAndRegisterMedia,
    type IMediaOrchestrationDeps,
} from '../../src/runtime/modules/persistence/server/utils/mediaOrchestration';
// #endregion

// #region Fakes
/** Медиа-конфиг с достаточными лимитами для тестового SVG. */
function makeConfig(): IResolvedMediaConfig {
    return {
        maxUploadSizeBytes: 5 * 1024 * 1024,
        maxUploadSizeMb: 5,
        maxVideoUploadSizeBytes: 5 * 1024 * 1024,
        maxVideoUploadSizeMb: 5,
        optimization: { format: 'webp', maxWidth: 1920, quality: 80 },
    };
}

/** Multipart-файл SVG с заданным содержимым. */
function makeSvgFile(markup: string): IUploadedFilePart {
    return {
        name: 'file',
        filename: 'a.svg',
        type: 'image/svg+xml',
        data: Buffer.from(markup, 'utf8'),
    };
}
// #endregion

describe('prepareUpload: SVG buffer == svgContent, оба санитизированы (R0.1)', () => {
    it('очищает hostile SVG: buffer и svgContent равны sanitizeSvgMarkup(исходника)', async () => {
        const hostile =
            '<svg xmlns="http://www.w3.org/2000/svg">' +
            '<rect fill="url(javascript:alert(1))"/>' +
            '<script>alert(1)</script>' +
            '</svg>';
        const expected = sanitizeSvgMarkup(hostile);

        const prepared = await prepareUpload(makeSvgFile(hostile), makeConfig());

        expect(prepared.svgContent).not.toBeNull();
        expect(prepared.svgContent).not.toContain('javascript');
        expect(prepared.svgContent).not.toContain('script');

        // buffer (S3) и svgContent (БД) — оба ровно sanitizeSvgMarkup(исходника),
        // не исходный buffer
        expect(prepared.svgContent).toBe(expected);
        expect(prepared.buffer.toString('utf8')).toBe(expected);
    });

    it('mock publish adapter получает уже очищенный SVG buffer (не исходный)', async () => {
        const hostile =
            '<svg xmlns="http://www.w3.org/2000/svg">' +
            '<rect fill="url(javascript:alert(1))" filter="url(https://evil.example/x)"/>' +
            '</svg>';

        const prepared = await prepareUpload(makeSvgFile(hostile), makeConfig());
        expect(prepared.buffer.toString('utf8')).not.toContain('javascript');
        expect(prepared.buffer.toString('utf8')).not.toContain('evil.example');

        let uploadedBuffer: Buffer | null = null;
        const deps: IMediaOrchestrationDeps = {
            storage: {
                async getMedia(): Promise<IMediaItem | null> {
                    return null;
                },
                async createMedia(payload: ICreateMediaPayload): Promise<IMediaItem> {
                    return {
                        id: 1,
                        url: payload.url,
                        filename: payload.filename,
                        alt: '',
                        size: payload.size ?? 0,
                        uploadedAt: '2026-07-11T00:00:00.000Z',
                        mimeType: payload.mimeType,
                        category: payload.category,
                        svgContent: payload.svgContent ?? null,
                        width: payload.width ?? null,
                        height: payload.height ?? null,
                        previewUrl: payload.previewUrl ?? null,
                        mockUrl: payload.mockUrl ?? null,
                    };
                },
                async deleteMedia(): Promise<boolean> {
                    return true;
                },
            },
            publish: {
                buildFileKey(kind, filename): string {
                    return `bricks-${kind}/${filename}`;
                },
                async uploadFile(params: IUploadFileParams) {
                    uploadedBuffer = params.buffer;
                    return {
                        url: `https://storage.example.com/my-bucket/${params.key}`,
                        key: params.key,
                        size: params.buffer.length,
                    };
                },
                async deleteFile(): Promise<void> {
                    // не вызывается в этом сценарии (createMedia не падает)
                },
                isOwnedUrl(): boolean {
                    return true;
                },
            },
        };

        const item = await uploadAndRegisterMedia(deps, {
            buffer: prepared.buffer,
            mimeType: prepared.mimeType,
            storedFilename: 'uuid.svg',
            displayFilename: 'a.svg',
            category: 'other',
            svgContent: prepared.svgContent,
        });

        // Буфер, который "ушёл в S3" (мок publish adapter), побайтно совпадает с БД-полем
        expect(uploadedBuffer).not.toBeNull();
        expect((uploadedBuffer as unknown as Buffer).toString('utf8')).toBe(item.svgContent);
        expect(item.svgContent).toBe(prepared.svgContent);
    });
});
