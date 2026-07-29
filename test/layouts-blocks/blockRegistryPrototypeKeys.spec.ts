// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Registry
import {
    getBlockDefinition,
    getBlockProperties,
    resolveBlockProps,
} from '../../src/runtime/modules/layouts-blocks/registry';
// #endregion

/**
 * `componentName` схемы проходит контракт как любая непустая строка, поэтому
 * lookup в BLOCK_REGISTRY по имени члена `Object.prototype` не должен выдавать
 * прототип за definition блока.
 */
const PROTOTYPE_KEYS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty'] as const;

describe('layouts-blocks registry: имена из Object.prototype', () => {
    it.each(PROTOTYPE_KEYS)('getBlockDefinition не находит блок %s', (name) => {
        expect(getBlockDefinition(name)).toBeUndefined();
    });

    it.each(PROTOTYPE_KEYS)('getBlockProperties отдаёт пустой массив для %s', (name) => {
        expect(getBlockProperties(name)).toEqual([]);
    });

    it.each(PROTOTYPE_KEYS)(
        'resolveBlockProps не падает на %s и возвращает копию пропсов',
        (name) => {
            const baseProps = { title: 'hello' };

            const resolved = resolveBlockProps(name, baseProps, 'desktop');

            expect(resolved).toEqual(baseProps);
            expect(resolved).not.toBe(baseProps);
        }
    );

    it('известные блоки резолвятся в обоих регистрах', () => {
        expect(getBlockDefinition('Grid')?.name).toBe('Grid');
        expect(getBlockDefinition('grid')?.name).toBe('Grid');
        expect(getBlockProperties('Grid').length).toBeGreaterThan(0);
    });
});
