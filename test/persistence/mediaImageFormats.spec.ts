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
    resolveVideoMime,
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

/**
 * Границы MIME: колонка `mime_type` — `VARCHAR(255)`, и заявленный Content-Type
 * доезжал до записи там, где тип нельзя вывести из содержимого.
 */
describe('MIME запроса не проезжает в запись без границ', () => {
    const svgMarkup = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>';

    /** Multipart-файл SVG с заданным заявленным типом. */
    function makeSvgFile(type: string): {
        name: string;
        filename: string;
        type: string;
        data: Buffer;
    } {
        return { name: 'file', filename: 'a.svg', type, data: Buffer.from(svgMarkup, 'utf8') };
    }

    it('SVG получает канонический тип, а не заявленный клиентом', async () => {
        const prepared = await prepareUpload(
            makeSvgFile('image/svg+xml; charset=utf-8-and-a-lie'),
            makeConfig()
        );

        // Содержимое уже подтверждено как SVG-разметка, то есть тип известен
        // точно — клиентскую строку здесь принимать не за что
        expect(prepared.mimeType).toBe('image/svg+xml');
    });

    it('расширение SVG тоже каноническое, а не из клиентского имени', async () => {
        const prepared = await prepareUpload(
            {
                name: 'file',
                filename: 'photo.png',
                type: 'image/svg+xml',
                data: Buffer.from(svgMarkup, 'utf8'),
            },
            makeConfig()
        );

        // Прежде валидный SVG с таким именем уезжал в бакет как `uuid.png`, и
        // импорт из бакета опознавал его как PNG по расширению
        expect(prepared.mimeType).toBe('image/svg+xml');
        expect(prepared.targetExtension).toBe('svg');
    });

    it('нераспознанное содержимое отклоняется, а не считается вектором', async () => {
        // Ветка «формат не распознан» прежде возвращала isSvg: true, то есть
        // читалась как «нераспознанный формат = SVG»
        await expect(
            prepareUpload(
                {
                    name: 'file',
                    filename: 'photo.png',
                    type: 'image/png',
                    data: Buffer.from('not an image at all'),
                },
                makeConfig()
            )
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining('not a supported image'),
        });
    });

    it('слишком длинный Content-Type отклоняется до обработки файла', async () => {
        // Прежде такой вход проходил валидацию, занимал место в бакете и падал
        // уже на вставке: пользователь получал generic 500, а sharp и заливка
        // делались зря
        await expect(
            prepareUpload(makeSvgFile(`image/${'x'.repeat(300)}`), makeConfig())
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('граница проходит ровно по колонке: 255 принимается, 256 отклоняется', async () => {
        const pad = (length: number): string => `image/${'x'.repeat(length - 'image/'.length)}`;

        // 255 — предел колонки `mime_type`, и он обязан оставаться рабочим: тип с
        // параметрами (`; charset=...`) бывает длинным законно
        await expect(prepareUpload(makeSvgFile(pad(255)), makeConfig())).resolves.toMatchObject({
            mimeType: 'image/svg+xml',
        });

        await expect(prepareUpload(makeSvgFile(pad(256)), makeConfig())).rejects.toMatchObject({
            statusCode: 400,
        });
    });

    it('видео тоже отклоняет длинный Content-Type до обработки', async () => {
        // Видео-ветка идёт мимо `validateAndOptimizeImage`, то есть проверка
        // обязана стоять в обеих валидациях, а не в одной. Сверяется ИМЕННО
        // сообщение: без границы этот вход тоже отказал бы 400, но уже по
        // сигнатуре содержимого, то есть проверка ничего бы не доказывала
        await expect(
            prepareUpload(
                {
                    name: 'file',
                    filename: 'clip.mp4',
                    type: `video/${'x'.repeat(300)}`,
                    data: Buffer.from('not-a-real-video'),
                },
                makeConfig()
            )
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringContaining('longer than 255'),
        });
    });
});

/**
 * MIME контейнера выводится из содержимого, а не из клиентского заголовка. Дыра
 * была в `m4v`: расширение попадает в целевое имя как ISO-BMFF, но строки в карте
 * не имело, и MIME брался из запроса — то есть произвольной строкой.
 */
describe('MIME видео берётся из карты контейнеров, а не из запроса', () => {
    it('каждое расширение, которое может стать целевым, имеет свой MIME', () => {
        const containerMimes: Record<string, string> = {
            mp4: 'video/mp4',
            m4v: 'video/x-m4v',
            mov: 'video/quicktime',
            webm: 'video/webm',
            ogg: 'video/ogg',
            avi: 'video/x-msvideo',
        };

        for (const [extension, mime] of Object.entries(containerMimes)) {
            // Второй аргумент — клиентский MIME: он не должен побеждать ни в
            // одном из этих случаев
            expect(resolveVideoMime(extension, 'video/whatever-the-client-said')).toBe(mime);
        }
    });
});
