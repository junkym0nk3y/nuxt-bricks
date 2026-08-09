/**
 * Разбор параметров оптимизации: что пришло с формой, а что взято из конфига.
 *
 * Различение здесь не косметическое. Пока функция принимала уже склеенный
 * объект, границы поля ввода накрывали и значения конфига: `maxWidth: 12000`
 * молча становился 8000 на каждой загрузке, хотя конфиг ставит разработчик и
 * потолком, придуманным для поля ввода, не ограничен.
 */

// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Types
import type { IBricksMediaOptimization } from '../../src/runtime/modules/common/types/media';
// #endregion

// #region Mocks
const { appConfig } = vi.hoisted(() => ({ appConfig: { value: {} as Record<string, unknown> } }));

vi.mock('nitropack/runtime', () => ({ useAppConfig: () => appConfig.value }));
// #endregion

import {
    resolveMediaConfig,
    resolveRequestedOptimization,
} from '../../src/runtime/modules/persistence/server/utils/imageProcessing';

// #region Helpers
/**
 * Собирает параметры конфига, от которых считаются дефолты и границы запроса.
 *
 * @param maxWidth - Ширина из конфига.
 * @returns Разрешённые параметры оптимизации.
 */
function buildFallback(maxWidth: number): IBricksMediaOptimization {
    return { format: 'webp', quality: 70, maxWidth };
}
// #endregion

describe('resolveRequestedOptimization: значения конфига не режутся границами поля', () => {
    it('отсутствующее поле оставляет ширину конфига выше обычного потолка', () => {
        const resolved = resolveRequestedOptimization({}, buildFallback(12000));

        expect(resolved.maxWidth).toBe(12000);
    });

    it('ширина, отправленная интерфейсом дословно, равна конфигурационной и доживает до сервера', () => {
        const resolved = resolveRequestedOptimization({ maxWidth: '12000' }, buildFallback(12000));

        expect(resolved.maxWidth).toBe(12000);
    });

    it('конфиг раздвигает границы запроса, но не отменяет их', () => {
        const resolved = resolveRequestedOptimization({ maxWidth: '20000' }, buildFallback(12000));

        expect(resolved.maxWidth).toBe(12000);
    });

    it('ширина ниже конфигурационной принимается как есть', () => {
        const resolved = resolveRequestedOptimization({ maxWidth: '9000' }, buildFallback(12000));

        expect(resolved.maxWidth).toBe(9000);
    });

    it('конфиг ниже обычного пола опускает и нижнюю границу запроса', () => {
        const resolved = resolveRequestedOptimization({ maxWidth: '8' }, buildFallback(8));

        expect(resolved.maxWidth).toBe(8);
    });

    it('при обычном конфиге действуют штатные границы поля ввода', () => {
        const fallback = buildFallback(1920);

        expect(resolveRequestedOptimization({ maxWidth: '1' }, fallback).maxWidth).toBe(16);
        expect(resolveRequestedOptimization({ maxWidth: '20000' }, fallback).maxWidth).toBe(8000);
    });
});

describe('resolveRequestedOptimization: непригодное поле — это отсутствие переопределения', () => {
    it.each([
        ['пустая строка', ''],
        ['пробелы', '   '],
        ['нечисловое', 'abc'],
        ['ноль', '0'],
        ['отрицательное', '-100'],
        ['бесконечность', 'Infinity'],
    ])('%s не меняет ширину и качество конфига', (_case, raw) => {
        const resolved = resolveRequestedOptimization(
            { quality: raw, maxWidth: raw },
            buildFallback(12000)
        );

        expect(resolved.maxWidth).toBe(12000);
        expect(resolved.quality).toBe(70);
    });

    it('неизвестный формат заменяется форматом конфига', () => {
        const resolved = resolveRequestedOptimization({ format: 'jpeg2000' }, buildFallback(1920));

        expect(resolved.format).toBe('webp');
    });

    it('известный формат применяется', () => {
        const resolved = resolveRequestedOptimization({ format: 'original' }, buildFallback(1920));

        expect(resolved.format).toBe('original');
    });
});

describe('resolveMediaConfig: ширина из конфига доходит до sharp пригодной', () => {
    it('непригодная ширина не превращается в ноль по пути к оптимизации', () => {
        appConfig.value = { bricks: { media: { optimization: { maxWidth: 0.4 } } } };

        const resolved = resolveMediaConfig();

        expect(resolved.optimization.maxWidth).toBe(1920);
        // Поля формы нет — значение конфига уходит в sharp напрямую
        expect(resolveRequestedOptimization({}, resolved.optimization).maxWidth).toBe(1920);
    });

    it('осознанно малая ширина сохраняется и не поднимается до потолка поля', () => {
        appConfig.value = { bricks: { media: { optimization: { maxWidth: 8 } } } };

        expect(resolveMediaConfig().optimization.maxWidth).toBe(8);
    });

    it('ширина выше потолка поля сохраняется', () => {
        appConfig.value = { bricks: { media: { optimization: { maxWidth: 12000 } } } };

        expect(resolveMediaConfig().optimization.maxWidth).toBe(12000);
    });
});

describe('resolveRequestedOptimization: приведение годных значений', () => {
    it('дробная ширина округляется — sharp принимает только целое', () => {
        const resolved = resolveRequestedOptimization({ maxWidth: '1920.6' }, buildFallback(1920));

        expect(resolved.maxWidth).toBe(1921);
    });

    it('качество режется всегда: вне 1..100 падает сам кодировщик', () => {
        const fallback = buildFallback(1920);

        expect(resolveRequestedOptimization({ quality: '150' }, fallback).quality).toBe(100);
        expect(resolveRequestedOptimization({ quality: '0.2' }, fallback).quality).toBe(1);
    });
});
