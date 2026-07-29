// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Utils
import { buildForceRenderSnapshot } from '../../src/runtime/modules/builder/canvas/item/utils/forceRenderSnapshot';
// #endregion

/**
 * Снимок forceRender-пропов собирался в обычный объект. Проп
 * `__proto__` own-ключа в нём не создавал, поэтому его правка не меняла снимок
 * и принудительный перерендер не срабатывал; проп `toString` без значения в
 * схеме читался как метод прототипа.
 */

describe('buildForceRenderSnapshot', () => {
    it('пустой список forceRender-пропов даёт пустой снимок', () => {
        expect(buildForceRenderSnapshot([], { title: 'a' })).toBe('');
    });

    it('снимок меняется при правке пропа с именем __proto__', () => {
        const before = buildForceRenderSnapshot(['__proto__'], JSON.parse('{"__proto__": "a"}'));
        const after = buildForceRenderSnapshot(['__proto__'], JSON.parse('{"__proto__": "b"}'));

        expect(before).not.toBe(after);
    });

    it('не подставляет метод прототипа для отсутствующего пропа toString', () => {
        const missing = buildForceRenderSnapshot(['toString'], {});
        const own = buildForceRenderSnapshot(['toString'], JSON.parse('{"toString": "value"}'));

        expect(missing).toBe('[["toString",null]]');
        expect(own).toBe('[["toString","value"]]');
    });

    it('снимок различает изменение обычного пропа', () => {
        const before = buildForceRenderSnapshot(['title', 'count'], { title: 'a', count: 1 });
        const after = buildForceRenderSnapshot(['title', 'count'], { title: 'a', count: 2 });

        expect(before).not.toBe(after);
        expect(buildForceRenderSnapshot(['title', 'count'], { title: 'a', count: 1 })).toBe(before);
    });
});
