// #region Imports
// Vitest
import { describe, expect, it, vi } from 'vitest';

// Vue
import type { AsyncComponentLoader } from 'vue';

// Composables
import { useRendererBricks } from '../../src/runtime/modules/render/composables/useRendererBricks';
// #endregion

/**
 * Runs the loader of an async wrapper the way Vue does on mount.
 *
 * @param component - Wrapper returned by resolveBrickComponent.
 * @returns The promise of the loader.
 */
function runLoader(component: unknown): Promise<unknown> {
    const loader = (component as { __asyncLoader?: AsyncComponentLoader }).__asyncLoader;

    if (!loader) {
        throw new Error('The resolved component is not an async wrapper');
    }

    return Promise.resolve(loader());
}

describe('resolveBrickComponent', () => {
    it('отдаёт null сразу, если лоадера в сборке нет — иначе отказ роняет всю страницу', () => {
        const findImportModule = vi.fn(() => undefined);
        const { resolveBrickComponent } = useRendererBricks({ findImportModule });

        expect(resolveBrickComponent('/components/Missing.brick.ts')).toBeNull();
        expect(findImportModule).toHaveBeenCalledOnce();
    });

    it('после упавшего импорта следующий вызов повторяет загрузку', async () => {
        // The Vue wrapper keeps the rejected request inside itself and never calls the
        // loader again, while the cache lives at module scope and outlives a request on the
        // server: as long as the failed wrapper stayed in the cache, the component was
        // poisoned for the whole life of the process
        const importModule = vi
            .fn()
            .mockRejectedValueOnce(new Error('chunk load failed'))
            .mockResolvedValueOnce({ default: { name: 'Card' } });
        const findImportModule = vi.fn(() => importModule);
        const { resolveBrickComponent } = useRendererBricks({ findImportModule });

        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const first = resolveBrickComponent('/components/Broken.brick.ts');
        // `loadBrickComponent` swallows the import failure into the log and returns null,
        // so the loader throws a wording of its own — what matters is that it did throw
        await expect(runLoader(first)).rejects.toThrow('no usable component export');

        const second = resolveBrickComponent('/components/Broken.brick.ts');
        expect(second).not.toBe(first);
        await expect(runLoader(second)).resolves.toMatchObject({ name: 'Card' });
        expect(importModule).toHaveBeenCalledTimes(2);
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
