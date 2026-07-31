// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Composables
import { useRendererBricks } from '../../src/runtime/modules/render/composables/useRendererBricks';
// #endregion

describe('resolveBrickComponent', () => {
    it('отдаёт null сразу, если лоадера в сборке нет — иначе отказ роняет всю страницу', () => {
        const findImportModule = vi.fn(() => undefined);
        const { resolveBrickComponent } = useRendererBricks({ findImportModule });

        expect(resolveBrickComponent('/components/Missing.brick.ts')).toBeNull();
        expect(findImportModule).toHaveBeenCalledOnce();
    });

    it('кеширует async-обёртку по нормализованному пути, а не по сырому', () => {
        const findImportModule = vi.fn(() => () => Promise.resolve({ default: {} }));
        const { resolveBrickComponent } = useRendererBricks({ findImportModule });

        const first = resolveBrickComponent('\\components\\Card.brick.ts');
        const second = resolveBrickComponent('\\components\\Card.brick.ts');

        expect(second).toBe(first);
        expect(findImportModule).toHaveBeenCalledOnce();
    });
});
