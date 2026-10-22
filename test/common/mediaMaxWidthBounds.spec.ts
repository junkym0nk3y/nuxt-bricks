/**
 * Нормализация конфигурационной ширины и границы поля ввода.
 *
 * Функция общая на клиент и сервер намеренно: от неё считаются границы, и
 * стоило сторонам трактовать непригодное значение по-своему, как границы
 * разъезжались — у одной `min: 0`, у другой `min: 16`. Ноль здесь не
 * теоретический: он уходит в `sharp.resize`, который принимает только
 * положительное целое, то есть валит каждую загрузку.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import {
    DEFAULT_MEDIA_OPTIMIZATION,
    resolveConfiguredMaxWidth,
    resolveMediaMaxWidthBounds,
} from '../../src/runtime/modules/common/constants/mediaOptimization';
// #endregion

describe('resolveConfiguredMaxWidth: конфигурационная ширина', () => {
    it.each([
        ['меньше пикселя', 0.4],
        ['ноль', 0],
        ['отрицательная', -100],
        ['нечисловая', 'широкая'],
        ['не задана', undefined],
        ['бесконечность', Number.POSITIVE_INFINITY],
    ])('%s заменяется дефолтом, а не превращается в ноль', (_case, value) => {
        expect(resolveConfiguredMaxWidth(value)).toBe(DEFAULT_MEDIA_OPTIMIZATION.maxWidth);
    });

    it('осмысленное значение ниже потолка поля сохраняется', () => {
        expect(resolveConfiguredMaxWidth(8)).toBe(8);
    });

    it('значение выше потолка поля сохраняется', () => {
        expect(resolveConfiguredMaxWidth(12000)).toBe(12000);
    });

    it('дробное округляется — sharp принимает только целое', () => {
        expect(resolveConfiguredMaxWidth(1920.6)).toBe(1921);
    });
});

describe('resolveMediaMaxWidthBounds: конфиг раздвигает границы поля', () => {
    it('обычный конфиг оставляет штатные границы', () => {
        expect(resolveMediaMaxWidthBounds(1920)).toEqual({ min: 16, max: 8000 });
    });

    it('конфиг выше потолка поднимает верхнюю границу', () => {
        expect(resolveMediaMaxWidthBounds(12000)).toEqual({ min: 16, max: 12000 });
    });

    it('конфиг ниже пола опускает нижнюю границу', () => {
        expect(resolveMediaMaxWidthBounds(8)).toEqual({ min: 8, max: 8000 });
    });

    it('непригодный конфиг не открывает нулевую ширину', () => {
        expect(resolveMediaMaxWidthBounds(0.4)).toEqual({ min: 16, max: 8000 });
    });
});
