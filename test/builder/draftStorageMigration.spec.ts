// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import { createWindowStub } from '../helpers/builderSessionHarness';
import { createFormStateBuilder } from '../helpers/publishFixtures';
// #endregion

import {
    getBuilderDraft,
    migrateBuilderDraft,
    setBuilderDraft,
} from '../../src/runtime/modules/builder/publish/utils/draftStorage';

const buildFormState = createFormStateBuilder();

/**
 * Кладёт черновик билдера под ключ страницы.
 *
 * @param pagename - ЧПУ страницы (он же ключ черновика).
 * @param title - Различающее значение внутри снапшота.
 */
function seedDraft(pagename: string, title: string): void {
    setBuilderDraft({
        pagename,
        updatedAt: '2026-07-29T10:00:00Z',
        mode: 'new',
        draftSnapshot: {
            schema: { components: [] },
            formState: buildFormState({ pagename, title }),
        },
    });
}

describe('migrateBuilderDraft: перенос на новый pagename', () => {
    beforeEach(() => {
        vi.stubGlobal('window', createWindowStub());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('свободный ключ: запись переезжает и обновляет собственный pagename', () => {
        seedDraft('draft-a', 'Черновик A');

        expect(migrateBuilderDraft('draft-a', 'draft-b')).toBe('migrated');

        expect(getBuilderDraft('draft-a')).toBeNull();
        expect(getBuilderDraft('draft-b')?.pagename).toBe('draft-b');
        expect(getBuilderDraft('draft-b')?.draftSnapshot.formState.title).toBe('Черновик A');
    });

    it('занятый ключ: чужая запись не перезаписывается, исходная остаётся на месте', () => {
        seedDraft('draft-a', 'Черновик A');
        seedDraft('draft-b', 'Черновик B');

        expect(migrateBuilderDraft('draft-a', 'draft-b')).toBe('target-taken');

        // Перенос не уничтожает несохранённую работу под целевым ключом
        expect(getBuilderDraft('draft-b')?.draftSnapshot.formState.title).toBe('Черновик B');
        expect(getBuilderDraft('draft-a')?.draftSnapshot.formState.title).toBe('Черновик A');
    });

    it('отказ хранилища отличается от занятого ключа', () => {
        const windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        seedDraft('draft-a', 'Черновик A');

        // Запись под новым ключом прошла, а удаление старого — нет: автосейв
        // дальше пишет по новому ключу и об этом не узнает, но черновик под
        // прежним слагом остался и позже предложит восстановление. Занятый ключ
        // — совсем другой исход, и путать их вызывающему нельзя
        windowStub.localStorage.removeItem = vi.fn(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        expect(migrateBuilderDraft('draft-a', 'draft-b')).toBe('storage-unavailable');
    });

    it('повреждённая запись — не отказ хранилища', () => {
        const windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        windowStub.localStorage.setItem('bricks-builder:draft:draft-a', '{ сломанный json');

        // Хранилище исправно, нечитаем сам черновик: назвать это отказом storage
        // значило бы показать пользователю сообщение о запрете localStorage,
        // которого не было
        expect(migrateBuilderDraft('draft-a', 'draft-b')).toBe('nothing-to-migrate');
    });

    it('валидный JSON неверной формы — тоже не отказ хранилища', () => {
        const windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        // `null` разбирается успешно, а присваивание поля ему бросает уже после
        // разбора — и это по-прежнему порча данных, а не запрет localStorage
        windowStub.localStorage.setItem('bricks-builder:draft:draft-a', 'null');

        expect(migrateBuilderDraft('draft-a', 'draft-b')).toBe('nothing-to-migrate');
    });
});
