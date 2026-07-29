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

describe('migrateBuilderDraft: перенос на новый pagename (BM-26)', () => {
    beforeEach(() => {
        vi.stubGlobal('window', createWindowStub());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('свободный ключ: запись переезжает и обновляет собственный pagename', () => {
        seedDraft('draft-a', 'Черновик A');

        migrateBuilderDraft('draft-a', 'draft-b');

        expect(getBuilderDraft('draft-a')).toBeNull();
        expect(getBuilderDraft('draft-b')?.pagename).toBe('draft-b');
        expect(getBuilderDraft('draft-b')?.draftSnapshot.formState.title).toBe('Черновик A');
    });

    it('занятый ключ: чужая запись не перезаписывается, исходная остаётся на месте', () => {
        seedDraft('draft-a', 'Черновик A');
        seedDraft('draft-b', 'Черновик B');

        migrateBuilderDraft('draft-a', 'draft-b');

        // Перенос не уничтожает несохранённую работу под целевым ключом
        expect(getBuilderDraft('draft-b')?.draftSnapshot.formState.title).toBe('Черновик B');
        expect(getBuilderDraft('draft-a')?.draftSnapshot.formState.title).toBe('Черновик A');
    });
});
