// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Sharp
import sharp from 'sharp';

// Utils
import {
    cropSquareImage,
    readOrientedImageDimensions,
} from '../../src/runtime/modules/persistence/server/utils/imageProcessing';
// #endregion

/**
 * Кадрирование считается в координатах, в которых изображение видит браузер: он
 * применяет EXIF-ориентацию сам, а `metadata()` отдаёт размеры до поворота.
 * Разойдись эти системы — рамка, нарисованная человеком по фотографии со съёмки
 * «портретом», кадрировала бы совсем другое место (или отвергалась бы как
 * выходящая за край).
 */

/** Сторона готового аватара — та же, что у ручки загрузки. */
const AVATAR_SIZE_PX = 256;

/**
 * Собирает изображение с половинами разного цвета: по цвету результата видно,
 * какой участок попал в кадр.
 *
 * @param width - Ширина.
 * @param height - Высота.
 * @param orientation - EXIF-ориентация (6 — поворот на 90°).
 * @returns Байты JPEG.
 */
async function makeTwoToneImage(
    width: number,
    height: number,
    orientation?: number
): Promise<Buffer> {
    const overlay = await sharp({
        create: {
            width: Math.floor(width / 2),
            height,
            channels: 3,
            background: '#0000ff',
        },
    })
        .png()
        .toBuffer();
    const pipeline = sharp({
        create: { width, height, channels: 3, background: '#ff0000' },
    }).composite([{ input: overlay, left: 0, top: 0 }]);

    return (orientation ? pipeline.withMetadata({ orientation }) : pipeline).jpeg().toBuffer();
}

/**
 * Средние значения каналов результата.
 *
 * @param buffer - Байты изображения.
 * @returns Средние red/green/blue.
 */
async function readChannelMeans(buffer: Buffer): Promise<number[]> {
    const stats = await sharp(buffer).stats();

    return stats.channels.map((channel) => channel.mean);
}

describe('readOrientedImageDimensions: размеры глазами браузера', () => {
    it('отдаёт размеры как есть, если ориентации нет', async () => {
        expect(await readOrientedImageDimensions(await makeTwoToneImage(200, 100))).toEqual({
            width: 200,
            height: 100,
        });
    });

    it('меняет стороны при повороте из EXIF', async () => {
        // Иначе проверка границ рамки считалась бы по перепутанным сторонам:
        // законная рамка отвергалась бы, а невалидная доходила до sharp
        expect(await readOrientedImageDimensions(await makeTwoToneImage(200, 100, 6))).toEqual({
            width: 100,
            height: 200,
        });
    });

    it('отдаёт null на не-растре: вызывающий отвечает 400, а не 500', async () => {
        // Предупреждение sharp в этом кейсе ожидаемо — глушим, чтобы не выдавать
        // его за проблему прогона
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        expect(await readOrientedImageDimensions(Buffer.from('not an image at all'))).toBeNull();

        vi.restoreAllMocks();
    });
});

describe('cropSquareImage: один webp на все размеры показа', () => {
    it('вырезает указанный квадрат и приводит его к целевой стороне', async () => {
        const source = await makeTwoToneImage(200, 100);
        const result = await cropSquareImage(
            source,
            { left: 100, top: 0, side: 100 },
            AVATAR_SIZE_PX,
            82
        );
        const metadata = await sharp(result.buffer).metadata();

        expect(result.mimeType).toBe('image/webp');
        expect(result.extension).toBe('webp');
        expect([metadata.width, metadata.height]).toEqual([AVATAR_SIZE_PX, AVATAR_SIZE_PX]);

        const [red, , blue] = await readChannelMeans(result.buffer);

        // Правая половина — красная: рамка соблюдена
        expect(red).toBeGreaterThan(200);
        expect(blue).toBeLessThan(60);
    });

    it('увеличивает мелкую рамку до целевой стороны', async () => {
        // Иначе часть аватаров была бы меньше остальных, и угол экрана «прыгал» бы
        const result = await cropSquareImage(
            await makeTwoToneImage(200, 100),
            { left: 100, top: 0, side: 40 },
            AVATAR_SIZE_PX,
            82
        );
        const metadata = await sharp(result.buffer).metadata();

        expect([metadata.width, metadata.height]).toEqual([AVATAR_SIZE_PX, AVATAR_SIZE_PX]);
    });

    it('считает рамку по ориентированному изображению', async () => {
        // Съёмка «портретом»: в файле 200×100 с поворотом на 90° по часовой, на
        // экране — 100×200, где левая (синяя) половина файла оказывается СВЕРХУ, а
        // красная — снизу. Рамка `top: 100` существует только в этих координатах:
        // работай extract по неповёрнутым байтам, он вышел бы за нижний край
        // (100 + 100 > 100) и отказал вовсе, а цвет доказывает, что взят именно
        // нижний участок картинки на экране
        const source = await makeTwoToneImage(200, 100, 6);
        const result = await cropSquareImage(
            source,
            { left: 0, top: 100, side: 100 },
            AVATAR_SIZE_PX,
            82
        );
        const [red, , blue] = await readChannelMeans(result.buffer);

        expect(red).toBeGreaterThan(200);
        expect(blue).toBeLessThan(60);
    });
});
