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
 * Тот же кейс сторожит дедупликацию сообщения: повторное сообщение о том же
 * пути нового повода не несёт (лоадер в готовую карту не добавить), а без
 * дедупликации published-страница печатала промах на каждую попытку загрузки.
 * Ключ дедупликации — нормализованный путь, поэтому отдельный кейс различает
 * записи, отличающиеся только разделителем: лоадер они ищут один и тот же.
 *
 * Пути в кейсах не пересекаются намеренно: состояние «о промахе уже сообщено» —
 * модульное и живёт между кейсами файла.
 *
 * В окружении тестов glob пуст: `/components/**` резолвится от корня репозитория,
 * где каталога `components/` нет.
 */
describe('useBrickImports: brickPath с именем из Object.prototype', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        warnSpy.mockRestore();
    });

    it('не отдаёт унаследованный toString под видом лоадера и предупреждает один раз на путь', () => {
        const { findImportModule } = useBrickImports();

        expect(findImportModule('toString')).toBeUndefined();
        expect(findImportModule('toString')).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('пути, различающиеся только разделителем, считаются одним путём', () => {
        const { findImportModule } = useBrickImports();

        expect(findImportModule('components\\Card.brick.ts')).toBeUndefined();
        expect(findImportModule('components/Card.brick.ts')).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('layout-пути коротко замыкаются без лога', () => {
        const { findImportModule } = useBrickImports();

        expect(findImportModule('layout/grid')).toBeUndefined();
        expect(warnSpy).not.toHaveBeenCalled();
    });
});
