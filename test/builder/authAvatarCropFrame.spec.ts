/**
 * Рамка кадрирования аватара уходит на сервер числами, и сервер отклоняет её,
 * если она вылезла за край изображения (`Crop frame is outside the image`) или
 * если сторона меньше 32 px. Оба отказа выглядели бы для человека как
 * «кадрирование не работает» на законном снимке, поэтому инварианты держатся
 * конструкцией: сторона округляется ВНИЗ и подрезается по меньшей стороне
 * снимка, и только после этого зажимаются координаты.
 *
 * Накопление жеста проверяется здесь же (`clampCropOffset` + `dragBy`-арифметика):
 * координаты кадра живут в пикселях исходника и `getBoundingClientRect` в этом
 * пути не участвует вовсе, поэтому DOM для проверки не нужен. Не покрыт только
 * сам указатель (захват, `clientX`) — это уже браузер.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    AUTH_AVATAR_CROP_CIRCLE_PX,
    AUTH_AVATAR_MIN_CROP_SIDE_PX,
    clampCropOffset,
    isCroppableImage,
    resolveCenteredOffset,
    resolveCropFrame,
    resolveMaxCropZoom,
} from '../../src/runtime/modules/builder/auth/utils/avatarCropFrame';
// #endregion

/**
 * Повторяет арифметику `dragBy`: сдвиг копится ДРОБНЫМ, округляет только рамка.
 *
 * @param width - Ширина изображения.
 * @param height - Высота изображения.
 * @param zoom - Масштаб.
 * @param steps - Сколько событий указателя.
 * @param stepPx - Смещение курсора в каждом событии (px экрана).
 * @returns Пройденное рамкой расстояние в пикселях исходника.
 */
function dragDistance(
    width: number,
    height: number,
    zoom: number,
    steps: number,
    stepPx: number
): number {
    const side = resolveCropFrame(width, height, zoom, 0, 0).side;
    let offsetLeft = (width - side) / 2;
    const startLeft = resolveCropFrame(width, height, zoom, offsetLeft, 0).left;

    for (let step = 0; step < steps; step += 1) {
        const scale = AUTH_AVATAR_CROP_CIRCLE_PX / side;

        offsetLeft = clampCropOffset(offsetLeft - stepPx / scale, width - side);
    }

    return startLeft - resolveCropFrame(width, height, zoom, offsetLeft, 0).left;
}

describe('resolveCropFrame: рамка всегда внутри изображения', () => {
    it('при масштабе 1 сторона равна меньшей стороне снимка', () => {
        const frame = resolveCropFrame(400, 300, 1, 50, 0);

        expect(frame.side).toBe(300);
    });

    it('центрированная рамка неквадратного снимка стоит по центру', () => {
        const centered = resolveCenteredOffset(400, 300, 300);
        const frame = resolveCropFrame(400, 300, 1, centered.left, centered.top);

        expect(frame).toEqual({ left: 50, top: 0, side: 300 });
    });

    it('координаты и сторона — целые числа при дробном масштабе', () => {
        const frame = resolveCropFrame(1001, 667, 1.37, 120.4, 33.7);

        expect(Number.isInteger(frame.left)).toBe(true);
        expect(Number.isInteger(frame.top)).toBe(true);
        expect(Number.isInteger(frame.side)).toBe(true);
    });

    // Мутация `Math.floor` → `Math.ceil` в стороне рамки валит именно это:
    // сторона на пиксель больше уводит правый край за границу снимка
    it('правый и нижний край рамки не выходят за снимок ни при каком масштабе', () => {
        const width = 1001;
        const height = 667;

        for (let zoom = 1; zoom <= 20; zoom += 0.37) {
            const frame = resolveCropFrame(width, height, zoom, width, height);

            expect(frame.left + frame.side).toBeLessThanOrEqual(width);
            expect(frame.top + frame.side).toBeLessThanOrEqual(height);
        }
    });

    it('сдвиг за левый и верхний край зажимается нулём', () => {
        const frame = resolveCropFrame(400, 300, 2, -500, -500);

        expect(frame.left).toBe(0);
        expect(frame.top).toBe(0);
    });

    it('панорама кадрируется по высоте, а не по ширине', () => {
        const frame = resolveCropFrame(4000, 200, 1, 0, 0);

        expect(frame.side).toBe(200);
    });

    it('нечисловой сдвиг не уносит рамку в NaN', () => {
        const frame = resolveCropFrame(400, 300, 1, Number.NaN, Number.NaN);

        expect(frame).toEqual({ left: 0, top: 0, side: 300 });
    });

    it('масштаб меньше единицы не растягивает рамку за пределы снимка', () => {
        const frame = resolveCropFrame(400, 300, 0.2, 0, 0);

        expect(frame.side).toBe(300);
    });
});

describe('resolveMaxCropZoom: потолок масштаба не уводит сторону под минимум сервера', () => {
    it('на максимальном масштабе сторона равна минимально допустимой', () => {
        const width = 640;
        const height = 480;
        const frame = resolveCropFrame(width, height, resolveMaxCropZoom(width, height), 0, 0);

        expect(frame.side).toBe(AUTH_AVATAR_MIN_CROP_SIDE_PX);
    });

    it('мелкий снимок ещё допускает приближение до минимальной рамки', () => {
        expect(resolveMaxCropZoom(40, 40)).toBe(40 / AUTH_AVATAR_MIN_CROP_SIDE_PX);
    });

    // Такой снимок отклоняется ещё на выборе файла (`isCroppableImage`), но
    // потолок обязан остаться ≥ 1: перевёрнутый диапазон ползунка (max < min)
    // сделал бы дорожку масштаба неуправляемой
    it('снимок мельче минимальной рамки не переворачивает диапазон ползунка', () => {
        expect(resolveMaxCropZoom(20, 20)).toBe(1);
    });
});

// Жест копил сдвиг от УЖЕ округлённой рамки, и дробный остаток терялся на каждом
// событии: при сильном приближении один пиксель экрана меньше половины пикселя
// исходника, поэтому медленное перетаскивание не двигало кадр вовсе, а на других
// масштабах систематическое округление вверх уводило его быстрее курсора
describe('накопление жеста: мелкие шаги не теряются и не удваиваются', () => {
    it('на максимальном приближении тридцать мелких шагов двигают кадр', () => {
        const moved = dragDistance(3000, 2000, resolveMaxCropZoom(3000, 2000), 30, 3);

        expect(moved).toBeGreaterThan(0);
    });

    it('тридцать шагов по 3 px равны одному шагу на 90 px', () => {
        const zoom = resolveMaxCropZoom(3000, 2000);

        expect(dragDistance(3000, 2000, zoom, 30, 3)).toBe(dragDistance(3000, 2000, zoom, 1, 90));
    });

    it('пройденное расстояние совпадает с курсором в пределах пикселя', () => {
        const side = resolveCropFrame(3000, 2000, 20, 0, 0).side;
        const expected = (20 * 2) / (AUTH_AVATAR_CROP_CIRCLE_PX / side);

        expect(Math.abs(dragDistance(3000, 2000, 20, 20, 2) - expected)).toBeLessThanOrEqual(1);
    });

    it('кламп держит рамку у края, а не копит «долг» за его пределами', () => {
        const side = resolveCropFrame(1200, 800, 1, 0, 0).side;

        expect(clampCropOffset(-500, 1200 - side)).toBe(0);
        expect(clampCropOffset(5000, 1200 - side)).toBe(1200 - side);
        // Дробное значение сохраняется: округляет только рамка
        expect(clampCropOffset(12.4, 1200 - side)).toBe(12.4);
    });
});

describe('isCroppableImage: снимок мельче минимальной рамки отклоняется до кадрирования', () => {
    it('снимок по границе принимается', () => {
        expect(isCroppableImage(32, 4000)).toBe(true);
    });

    it('снимок на пиксель меньше границы отклоняется', () => {
        expect(isCroppableImage(31, 4000)).toBe(false);
    });
});
