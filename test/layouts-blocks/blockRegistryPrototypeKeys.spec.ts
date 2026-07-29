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
describe('layouts-blocks registry: имена из Object.prototype', () => {
    it('getBlockDefinition не отдаёт унаследованный toString под видом блока', () => {
        expect(getBlockDefinition('toString')).toBeUndefined();
    });

    it('getBlockProperties отдаёт пустой массив для prototype-имени', () => {
        expect(getBlockProperties('toString')).toEqual([]);
    });

    it('resolveBlockProps не падает на __proto__ и возвращает копию пропсов', () => {
        const baseProps = { title: 'hello' };

        const resolved = resolveBlockProps('__proto__', baseProps, 'desktop');

        expect(resolved).toEqual(baseProps);
        expect(resolved).not.toBe(baseProps);
    });

    it('известные блоки резолвятся в обоих регистрах', () => {
        expect(getBlockDefinition('Grid')?.name).toBe('Grid');
        expect(getBlockDefinition('grid')?.name).toBe('Grid');
        expect(getBlockProperties('Grid').length).toBeGreaterThan(0);
    });
});
