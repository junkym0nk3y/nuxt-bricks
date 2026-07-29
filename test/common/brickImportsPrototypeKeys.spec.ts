// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Composables
import { useBrickImports } from '../../src/runtime/modules/common/composables/useBrickImports';
// #endregion

/**
 * `brickPath` берётся из схемы страницы, а карта лоадеров — обычный объект
 * `import.meta.glob`. Для имён членов `Object.prototype` прямой lookup отдавал
 * бы наружу `Object.prototype` / функцию `Object` под видом лоадера, причём
 * молча — промах не логировался.
 *
 * В окружении тестов glob пуст: `/components/**` резолвится от корня репозитория,
 * где каталога `components/` нет.
 */
describe('useBrickImports: brickPath с именем из Object.prototype', () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        errorSpy.mockRestore();
    });

    it('не отдаёт унаследованный toString под видом лоадера и пишет о промахе', () => {
        const { findImportModule } = useBrickImports();

        expect(findImportModule('toString')).toBeUndefined();
        expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('layout-пути коротко замыкаются без лога', () => {
        const { findImportModule } = useBrickImports();

        expect(findImportModule('layout/grid')).toBeUndefined();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
