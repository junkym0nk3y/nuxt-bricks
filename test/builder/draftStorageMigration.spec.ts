// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import { bareAddress, createWindowStub } from '../helpers/builderSessionHarness';
import { createFormStateBuilder } from '../helpers/publishFixtures';
// #endregion

import type { IBricksPageAddress } from '../../src/runtime/modules/common/types/pageAddress';
import {
    getBuilderDraft,
    migrateBuilderDraft,
    setBuilderDraft,
} from '../../src/runtime/modules/builder/publish/utils/draftStorage';

const buildFormState = createFormStateBuilder();

/**
 * Кладёт черновик билдера под ключ адреса страницы.
 *
 * @param address - Адрес страницы (он же ключ черновика).
 * @param title - Различающее значение внутри снапшота.
 */
function seedDraft(address: IBricksPageAddress, title: string): void {
    setBuilderDraft({
        pagename: address.pagename,
        urlPrefix: address.urlPrefix,
        updatedAt: '2026-07-29T10:00:00Z',
        mode: 'new',
        draftSnapshot: {
            schema: { components: [] },
            formState: buildFormState({ pagename: address.pagename, title }),
        },
    });
}

describe('migrateBuilderDraft: перенос на новый адрес', () => {
    beforeEach(() => {
        vi.stubGlobal('window', createWindowStub());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('свободный ключ: запись переезжает и обновляет собственный pagename', () => {
        seedDraft(bareAddress('draft-a'), 'Черновик A');

        expect(migrateBuilderDraft(bareAddress('draft-a'), bareAddress('draft-b'))).toBe(
            'migrated'
        );

        expect(getBuilderDraft(bareAddress('draft-a'))).toBeNull();
        expect(getBuilderDraft(bareAddress('draft-b'))?.pagename).toBe('draft-b');
        expect(getBuilderDraft(bareAddress('draft-b'))?.draftSnapshot.formState.title).toBe(
            'Черновик A'
        );
    });

    it('занятый ключ: чужая запись не перезаписывается, исходная остаётся на месте', () => {
        seedDraft(bareAddress('draft-a'), 'Черновик A');
        seedDraft(bareAddress('draft-b'), 'Черновик B');

        expect(migrateBuilderDraft(bareAddress('draft-a'), bareAddress('draft-b'))).toBe(
            'target-taken'
        );

        // Перенос не уничтожает несохранённую работу под целевым ключом
        expect(getBuilderDraft(bareAddress('draft-b'))?.draftSnapshot.formState.title).toBe(
            'Черновик B'
        );
        expect(getBuilderDraft(bareAddress('draft-a'))?.draftSnapshot.formState.title).toBe(
            'Черновик A'
        );
    });

    it('отказ хранилища отличается от занятого ключа', () => {
        const windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        seedDraft(bareAddress('draft-a'), 'Черновик A');

        // Запись под новым ключом прошла, а удаление старого — нет: автосейв
        // дальше пишет по новому ключу и об этом не узнает, но черновик под
        // прежним слагом остался и позже предложит восстановление. Занятый ключ
        // — совсем другой исход, и путать их вызывающему нельзя
        windowStub.localStorage.removeItem = vi.fn(() => {
            throw new DOMException('denied', 'SecurityError');
        });

        expect(migrateBuilderDraft(bareAddress('draft-a'), bareAddress('draft-b'))).toBe(
            'storage-unavailable'
        );
    });

    it('повреждённая запись — не отказ хранилища', () => {
        const windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        windowStub.localStorage.setItem('bricks-builder:draft:draft-a', '{ сломанный json');

        // Хранилище исправно, нечитаем сам черновик: назвать это отказом storage
        // значило бы показать пользователю сообщение о запрете localStorage,
        // которого не было
        expect(migrateBuilderDraft(bareAddress('draft-a'), bareAddress('draft-b'))).toBe(
            'nothing-to-migrate'
        );
    });

    it('валидный JSON неверной формы — тоже не отказ хранилища', () => {
        const windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        // `null` разбирается успешно, а присваивание поля ему бросает уже после
        // разбора — и это по-прежнему порча данных, а не запрет localStorage
        windowStub.localStorage.setItem('bricks-builder:draft:draft-a', 'null');

        expect(migrateBuilderDraft(bareAddress('draft-a'), bareAddress('draft-b'))).toBe(
            'nothing-to-migrate'
        );
    });

    it('одно имя под разными префиксами — независимые записи', () => {
        const blogPost: IBricksPageAddress = { pagename: 'post', urlPrefix: 'blog' };
        const newsPost: IBricksPageAddress = { pagename: 'post', urlPrefix: 'news' };

        seedDraft(blogPost, 'Пост блога');
        seedDraft(newsPost, 'Пост новостей');

        // Ключ по имени был бы общим: вторая запись затёрла бы первую, и открытая
        // рядом страница предложила бы восстановить чужие правки
        expect(getBuilderDraft(blogPost)?.draftSnapshot.formState.title).toBe('Пост блога');
        expect(getBuilderDraft(newsPost)?.draftSnapshot.formState.title).toBe('Пост новостей');
        expect(getBuilderDraft(bareAddress('post'))).toBeNull();
    });

    it('перенос под другой префикс обновляет обе половины адреса записи', () => {
        const blogPost: IBricksPageAddress = { pagename: 'post', urlPrefix: 'blog' };
        const newsPost: IBricksPageAddress = { pagename: 'post', urlPrefix: 'news' };

        seedDraft(blogPost, 'Пост блога');

        expect(migrateBuilderDraft(blogPost, newsPost)).toBe('migrated');

        // Не обнови перенос `urlPrefix` — запись под новым ключом считалась бы
        // черновиком чужого адреса, и bootstrap сессии её бы отверг
        expect(getBuilderDraft(blogPost)).toBeNull();
        expect(getBuilderDraft(newsPost)?.urlPrefix).toBe('news');
        expect(getBuilderDraft(newsPost)?.pagename).toBe('post');
    });
});
