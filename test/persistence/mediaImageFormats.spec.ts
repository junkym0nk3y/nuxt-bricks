// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// imageProcessing тянет nitropack/runtime (useAppConfig) — в node-тестах стабим
// (тот же паттерн, что test/persistence/mediaUploadSvg.spec.ts)
vi.mock('nitropack/runtime', () => ({
    useAppConfig: () => ({}),
    useRuntimeConfig: () => ({}),
}));

// Utils
import {
    isWebSafeImageExtension,
    resolveImageFormat,
} from '../../src/runtime/modules/persistence/server/utils/imageProcessing';
import { prepareUpload } from '../../src/runtime/server/api/bricks/media/upload.post';
import type { IResolvedMediaConfig } from '../../src/runtime/modules/persistence/types/media';
// #endregion

/** Медиа-конфиг с достаточными лимитами для тестовых байтов. */
function makeConfig(): IResolvedMediaConfig {
    return {
        maxUploadSizeBytes: 5 * 1024 * 1024,
        maxUploadSizeMb: 5,
        maxVideoUploadSizeBytes: 5 * 1024 * 1024,
        maxVideoUploadSizeMb: 5,
        optimization: { format: 'webp', maxWidth: 1920, quality: 80 },
    };
}

describe('«Оригинал» ограничен web-safe форматами', () => {
    it('форматы, которые браузер обязан показать, сохраняются как есть', () => {
        for (const extension of ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'svg']) {
            expect(isWebSafeImageExtension(extension)).toBe(true);
        }
    });

    it('HEIC/HEIF, TIFF и BMP web-safe не считаются', () => {
        // Сервер их принимает, но браузер показывать не обязан: сохранив такой вход
        // как есть, постепенная загрузка подменила бы видимое webp-превью
        // неоткрываемым полным файлом
        for (const extension of ['heic', 'heif', 'tif', 'tiff', 'bmp']) {
            expect(isWebSafeImageExtension(extension)).toBe(false);
        }
    });
});

describe('разбор запрошенного формата', () => {
    it('известные значения проходят как есть', () => {
        expect(resolveImageFormat('webp', 'webp')).toBe('webp');
        expect(resolveImageFormat('original', 'webp')).toBe('original');
    });

    it('мусор из multipart-поля молча заменяется дефолтом, а не роняет загрузку', () => {
        expect(resolveImageFormat('jpeg2000', 'webp')).toBe('webp');
        expect(resolveImageFormat('', 'original')).toBe('original');
        expect(resolveImageFormat(undefined, 'webp')).toBe('webp');
        expect(resolveImageFormat(42, 'webp')).toBe('webp');
    });

    // Формат больше не выбирается: перекодирование в проекте одно — webp.
    // Значение из старого конфига должно уходить в дефолт, а не проезжать в
    // sharp, который на неизвестном формате упал бы уже внутри загрузки
    it('снятый avif обрабатывается как неизвестное значение', () => {
        expect(resolveImageFormat('avif', 'webp')).toBe('webp');
    });
});

describe('формат берётся из содержимого, а не из имени файла', () => {
    /**
     * Валидный PNG 4×4: sharp его и читает, и перекодирует, а
     * `sniffImageFormat` опознаёт по magic bytes.
     */
    function makePngBytes(): Buffer {
        return Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAEElEQVR4nGM4UWEDRwzEcQBykhfBWhDcSAAAAABJRU5ErkJggg==',
            'base64'
        );
    }

    it('PNG, названный .gif, при «Оригинале» сохраняется как png с image/png', async () => {
        const prepared = await prepareUpload(
            { name: 'file', filename: 'photo.gif', type: 'image/gif', data: makePngBytes() },
            makeConfig(),
            { format: 'original', quality: 70, maxWidth: 1920 }
        );

        // Прежде расширение и MIME брались из имени: файл уезжал в бакет как
        // *.gif с image/gif, хотя байты — PNG
        expect(prepared.targetExtension).toBe('png');
        expect(prepared.mimeType).toBe('image/png');
    });

    it('тот же вход при webp-формате перекодируется, имя роли не играет', async () => {
        const prepared = await prepareUpload(
            { name: 'file', filename: 'photo.gif', type: 'image/gif', data: makePngBytes() },
            makeConfig(),
            { format: 'webp', quality: 70, maxWidth: 1920 }
        );

        expect(prepared.targetExtension).toBe('webp');
        expect(prepared.mimeType).toBe('image/webp');
    });
});
