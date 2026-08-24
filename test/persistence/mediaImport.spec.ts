// #region Imports
// Types
import type { IMediaItem } from '../../src/runtime/modules/common/types/media';
import type { ICreateMediaPayload } from '../../src/runtime/modules/persistence/types/adapters';

// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';
// #endregion

// #region Mocks
const { listFilesMock, readFileHeadMock, createMediaMock, getMediaByUrlMock } = vi.hoisted(() => ({
    listFilesMock: vi.fn(),
    readFileHeadMock: vi.fn(),
    createMediaMock: vi.fn(),
    getMediaByUrlMock: vi.fn(),
}));

vi.mock('../../src/runtime/modules/persistence/server/registry', () => ({
    useBricksPublishAdapter: () => ({
        listFiles: listFilesMock,
        readFileHead: readFileHeadMock,
    }),
    useBricksStorageAdapter: () => ({
        createMedia: createMediaMock,
        getMediaByUrl: getMediaByUrlMock,
    }),
}));

import { importMediaFromStorage } from '../../src/runtime/modules/persistence/server/utils/mediaImport';
// #endregion

/** Описание файла бакета для listFiles. */
function makeFile(key: string) {
    return {
        key,
        url: `https://storage.example.com/bucket/${key}`,
        size: 1024,
        lastModified: '2026-07-01T00:00:00.000Z',
    };
}

/** The head of a real WebP: a RIFF container with the WEBP tag. */
function webpHead(): Buffer {
    return Buffer.concat([
        Buffer.from('RIFF', 'latin1'),
        Buffer.from([0x10, 0x00, 0x00, 0x00]),
        Buffer.from('WEBP', 'latin1'),
    ]);
}

/** The head of a real PNG. */
function pngHead(): Buffer {
    return Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

/** The head of a real Ogg. */
function oggHead(): Buffer {
    return Buffer.from('OggS', 'latin1');
}

/** An ISO-BMFF head with a QuickTime brand (one signature for mp4, m4v and mov). */
function quickTimeHead(): Buffer {
    return Buffer.concat([
        Buffer.from([0x00, 0x00, 0x00, 0x14]),
        Buffer.from('ftypqt', 'latin1'),
        Buffer.from([0x20, 0x20]),
    ]);
}

/** SVG markup (the format is recognized by the textual heuristic). */
function svgHead(): Buffer {
    return Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect /></svg>', 'utf8');
}

describe('importMediaFromStorage: импорт бакета без N+1', () => {
    beforeEach(() => {
        listFilesMock.mockReset();
        readFileHeadMock.mockReset();
        createMediaMock.mockReset();
        getMediaByUrlMock.mockReset();
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        createMediaMock.mockImplementation((payload: ICreateMediaPayload) =>
            Promise.resolve({ id: 1, ...payload } as unknown as IMediaItem)
        );
    });

    it('создаёт запись на файл через идемпотентный createMedia, без per-file SELECT', async () => {
        listFilesMock.mockResolvedValue([
            makeFile('bricks-media/a.webp'),
            makeFile('bricks-media/b.webp'),
        ]);
        readFileHeadMock.mockResolvedValue(webpHead());

        const items = await importMediaFromStorage();

        expect(items).toHaveLength(2);
        expect(createMediaMock).toHaveBeenCalledTimes(2);
        // Дедуп — контрактом уникальности url в createMedia: отдельный SELECT на файл убран
        expect(getMediaByUrlMock).not.toHaveBeenCalled();

        const payload = createMediaMock.mock.calls[0][0] as ICreateMediaPayload;
        expect(payload.url).toBe('https://storage.example.com/bucket/bricks-media/a.webp');
        expect(payload.mimeType).toBe('image/webp');
        expect(payload.uploadedAt).toBe('2026-07-01T00:00:00.000Z');
    });

    it('тип берётся из содержимого, а не из имени файла', async () => {
        // The name-based decision used to declare this object an image/png, and the
        // library shows everything that is not video/* as a picture
        listFilesMock.mockResolvedValue([makeFile('bricks-media/clip.png')]);
        readFileHeadMock.mockResolvedValue(oggHead());

        await importMediaFromStorage();

        const payload = createMediaMock.mock.calls[0][0] as ICreateMediaPayload;
        expect(payload.mimeType).toBe('video/ogg');
        expect(readFileHeadMock).toHaveBeenCalledWith('bricks-media/clip.png', 4096);
    });

    it('расширение уточняет контейнер только внутри своей сигнатуры', async () => {
        // One ISO-BMFF signature covers mp4, m4v and mov: here the name is the only
        // thing that tells them apart, and it agrees with the content
        listFilesMock.mockResolvedValue([makeFile('bricks-media/movie.mov')]);
        readFileHeadMock.mockResolvedValue(quickTimeHead());

        await importMediaFromStorage();

        expect((createMediaMock.mock.calls[0][0] as ICreateMediaPayload).mimeType).toBe(
            'video/quicktime'
        );
    });

    it('расширение из чужого семейства контейнеров игнорируется', async () => {
        // A name from another family must not override the signature: this is the
        // difference between refining a container and trusting the name
        listFilesMock.mockResolvedValue([makeFile('bricks-media/clip.mp4')]);
        readFileHeadMock.mockResolvedValue(oggHead());

        await importMediaFromStorage();

        expect((createMediaMock.mock.calls[0][0] as ICreateMediaPayload).mimeType).toBe(
            'video/ogg'
        );
    });

    it('имя .svg у не-SVG содержимого не запускает загрузку файла', async () => {
        // The name used to decide whether to pull the whole object down and
        // sanitize it as an SVG
        listFilesMock.mockResolvedValue([makeFile('bricks-media/hostile.svg')]);
        readFileHeadMock.mockResolvedValue(pngHead());

        await importMediaFromStorage();

        const payload = createMediaMock.mock.calls[0][0] as ICreateMediaPayload;
        expect(payload.mimeType).toBe('image/png');
        expect(payload.svgContent).toBeNull();
        // The head is read once: the second read is the markup of a real SVG only
        expect(readFileHeadMock).toHaveBeenCalledTimes(1);
    });

    it('настоящий SVG опознаётся под любым именем и попадает в базу санитизированным', async () => {
        listFilesMock.mockResolvedValue([makeFile('bricks-media/asset.bin')]);
        readFileHeadMock
            .mockResolvedValueOnce(svgHead())
            .mockResolvedValueOnce(
                Buffer.from(
                    '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
                    'utf8'
                )
            );

        await importMediaFromStorage();

        const payload = createMediaMock.mock.calls[0][0] as ICreateMediaPayload;
        expect(payload.mimeType).toBe('image/svg+xml');
        // The markup is read through the adapter, not over the public URL of the
        // file, and with a bound of its own
        expect(readFileHeadMock).toHaveBeenLastCalledWith(
            'bricks-media/asset.bin',
            2 * 1024 * 1024 + 1
        );
        expect(payload.svgContent).not.toContain('<script');
    });

    it('отказ чтения разметки SVG не заводит запись с пустым содержимым', async () => {
        // A swallowed failure used to register the file with an empty svgContent,
        // and that record was permanent: a repeated import returns the existing row
        // on a url conflict without updating it
        listFilesMock.mockResolvedValue([makeFile('bricks-media/logo.svg')]);
        readFileHeadMock
            .mockResolvedValueOnce(svgHead())
            .mockRejectedValueOnce(new Error('read timed out'));

        await expect(importMediaFromStorage()).resolves.toEqual([]);
        expect(createMediaMock).not.toHaveBeenCalled();
    });

    it('SVG больше лимита пропускается, а не режется по границе чтения', async () => {
        listFilesMock.mockResolvedValue([makeFile('bricks-media/huge.svg')]);
        readFileHeadMock
            .mockResolvedValueOnce(svgHead())
            .mockResolvedValueOnce(Buffer.alloc(2 * 1024 * 1024 + 1, 0x20));

        const items = await importMediaFromStorage();

        expect(items).toEqual([]);
        expect(createMediaMock).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('exceeds'),
            'bricks-media/huge.svg'
        );
    });

    it('форматы, которые загрузка всегда перекодирует, импортом не заводятся', async () => {
        // An upload turns TIFF, BMP and HEIF into webp because a browser does not
        // display them; an import re-encodes nothing, so such a record would be a
        // broken picture in the library
        listFilesMock.mockResolvedValue([makeFile('bricks-media/scan.tiff')]);
        readFileHeadMock.mockResolvedValue(Buffer.from([0x49, 0x49, 0x2a, 0x00]));

        const items = await importMediaFromStorage();

        expect(items).toEqual([]);
        expect(createMediaMock).not.toHaveBeenCalled();
    });

    it('объект неизвестного формата пропускается, а не заводится записью', async () => {
        listFilesMock.mockResolvedValue([
            makeFile('bricks-media/archive.zip'),
            makeFile('bricks-media/a.webp'),
        ]);
        readFileHeadMock.mockImplementation((key: string) =>
            Promise.resolve(key.endsWith('.webp') ? webpHead() : Buffer.from('PK'))
        );

        const items = await importMediaFromStorage();

        expect(items).toHaveLength(1);
        expect(createMediaMock).toHaveBeenCalledTimes(1);
        expect((createMediaMock.mock.calls[0][0] as ICreateMediaPayload).filename).toBe('a.webp');
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('not a supported media file'),
            'bricks-media/archive.zip'
        );
    });

    it('недоступное хранилище → пустой список без ошибки', async () => {
        listFilesMock.mockRejectedValue(new Error('S3 down'));

        await expect(importMediaFromStorage()).resolves.toEqual([]);
        expect(createMediaMock).not.toHaveBeenCalled();
    });

    it('отказ чтения на середине бакета не оставляет половину библиотеки', async () => {
        // The import is the fallback for an EMPTY media table: half of the files
        // written would leave it non-empty, and the import would never run again to
        // finish the job
        listFilesMock.mockResolvedValue([
            makeFile('bricks-media/a.webp'),
            makeFile('bricks-media/b.webp'),
        ]);
        readFileHeadMock.mockImplementation((key: string) =>
            key.endsWith('a.webp')
                ? Promise.resolve(webpHead())
                : Promise.reject(new Error('range read failed'))
        );

        await expect(importMediaFromStorage()).resolves.toEqual([]);
        expect(createMediaMock).not.toHaveBeenCalled();
    });

    it('варианты прогрессивной загрузки не читаются и не заводятся записями', async () => {
        listFilesMock.mockResolvedValue([
            makeFile('bricks-media/a.webp'),
            makeFile('bricks-media/a-preview.webp'),
        ]);
        readFileHeadMock.mockResolvedValue(webpHead());

        const items = await importMediaFromStorage();

        expect(items).toHaveLength(1);
        expect(readFileHeadMock).toHaveBeenCalledTimes(1);
    });
});
