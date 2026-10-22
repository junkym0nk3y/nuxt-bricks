// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    convertFromPx,
    convertToPx,
    DEFAULT_PX_PER_EM,
} from '../../src/runtime/modules/text-editor/utils/sizeUnits';
// #endregion

/**
 * Ветки для процентов у `convertFromPx` не было, и `default` возвращал пиксели как
 * есть: у картинки шириной 300 px переключение единицы на `%` давало `customWidth:
 * '300%'`, то есть в DOM уезжало `width: 300%`.
 */
describe('convertFromPx', () => {
    it('считает проценты от ширины содержащего блока', () => {
        expect(convertFromPx(300, '%', DEFAULT_PX_PER_EM, 600)).toBe(50);
        expect(convertFromPx(600, '%', DEFAULT_PX_PER_EM, 600)).toBe(100);
    });

    it('не выдаёт больше 100%: шире контейнера картинку всё равно режет max-width', () => {
        expect(convertFromPx(900, '%', DEFAULT_PX_PER_EM, 600)).toBe(100);
    });

    it('без известной базы отдаёт полную ширину, а не ноль', () => {
        // Ноль означал бы `width: 0%` — медиа исчезло бы с экрана
        expect(convertFromPx(300, '%', DEFAULT_PX_PER_EM)).toBe(100);
        expect(convertFromPx(300, '%', DEFAULT_PX_PER_EM, 0)).toBe(100);
    });

    it('остальные единицы считает по-прежнему', () => {
        expect(convertFromPx(300, 'rem', DEFAULT_PX_PER_EM)).toBe(30);
        expect(convertFromPx(32, 'em', 16)).toBe(2);
        expect(convertFromPx(300, 'px', DEFAULT_PX_PER_EM)).toBe(300);
    });
});

describe('convertToPx', () => {
    // Пиксельного эквивалента у процентов нет намеренно: ноль оставляет пиксельные
    // attrs узла нетронутыми, а из них node view берёт отношение сторон
    it('для процентов и пикселей пиксельный эквивалент не считает', () => {
        expect(convertToPx(50, '%', DEFAULT_PX_PER_EM)).toBe(0);
        expect(convertToPx(300, 'px', DEFAULT_PX_PER_EM)).toBe(0);
    });

    it('rem и em переводит в пиксели', () => {
        expect(convertToPx(30, 'rem', DEFAULT_PX_PER_EM)).toBe(300);
        expect(convertToPx(2, 'em', 16)).toBe(32);
    });
});
