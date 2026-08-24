// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Utils
import {
    bareAddress,
    buildTestDraftKey,
    createWindowStub,
    TEST_DRAFT_PRINCIPAL,
} from '../helpers/builderSessionHarness';
import { createFormStateBuilder } from '../helpers/publishFixtures';
// #endregion

import type { IBricksPageAddress } from '../../src/runtime/modules/common/types/pageAddress';
import type {
    IBuilderDraftEntry,
    TBuilderDraftPrincipal,
} from '../../src/runtime/modules/builder/publish/types/builderDrafts';
import {
    getBuilderDraft,
    migrateBuilderDraft,
    removeBuilderDraft,
    resolveBuilderDraftPrincipal,
    setBuilderDraft,
} from '../../src/runtime/modules/builder/publish/utils/draftStorage';

const buildFormState = createFormStateBuilder();

/**
 * Кладёт черновик билдера под ключ владельца и адреса страницы.
 *
 * @param address - Адрес страницы.
 * @param title - Различающее значение внутри снапшота.
 * @param principal - Владелец черновика (по умолчанию — тестовый).
 */
function seedDraft(
    address: IBricksPageAddress,
    title: string,
    principal: TBuilderDraftPrincipal = TEST_DRAFT_PRINCIPAL
): void {
    setBuilderDraft(principal, buildDraftEntry(address, title));
}

/**
 * Собирает запись черновика для адреса.
 *
 * @param address - Адрес страницы.
 * @param title - Различающее значение внутри снапшота.
 * @returns Запись черновика.
 */
function buildDraftEntry(address: IBricksPageAddress, title: string): IBuilderDraftEntry {
    return {
        pagename: address.pagename,
        urlPrefix: address.urlPrefix,
        updatedAt: '2026-07-29T10:00:00Z',
        mode: 'new',
        draftSnapshot: {
            schema: { components: [] },
            formState: buildFormState({ pagename: address.pagename, title }),
        },
    };
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

        expect(
            migrateBuilderDraft(
                TEST_DRAFT_PRINCIPAL,
                bareAddress('draft-a'),
                bareAddress('draft-b')
            )
        ).toBe('migrated');

        expect(getBuilderDraft(TEST_DRAFT_PRINCIPAL, bareAddress('draft-a'))).toBeNull();
        expect(getBuilderDraft(TEST_DRAFT_PRINCIPAL, bareAddress('draft-b'))?.pagename).toBe(
            'draft-b'
        );
        expect(
            getBuilderDraft(TEST_DRAFT_PRINCIPAL, bareAddress('draft-b'))?.draftSnapshot.formState
                .title
        ).toBe('Черновик A');
    });

    it('занятый ключ: чужая запись не перезаписывается, исходная остаётся на месте', () => {
        seedDraft(bareAddress('draft-a'), 'Черновик A');
        seedDraft(bareAddress('draft-b'), 'Черновик B');

        expect(
            migrateBuilderDraft(
                TEST_DRAFT_PRINCIPAL,
                bareAddress('draft-a'),
                bareAddress('draft-b')
            )
        ).toBe('target-taken');

        // Перенос не уничтожает несохранённую работу под целевым ключом
        expect(
            getBuilderDraft(TEST_DRAFT_PRINCIPAL, bareAddress('draft-b'))?.draftSnapshot.formState
                .title
        ).toBe('Черновик B');
        expect(
            getBuilderDraft(TEST_DRAFT_PRINCIPAL, bareAddress('draft-a'))?.draftSnapshot.formState
                .title
        ).toBe('Черновик A');
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

        expect(
            migrateBuilderDraft(
                TEST_DRAFT_PRINCIPAL,
                bareAddress('draft-a'),
                bareAddress('draft-b')
            )
        ).toBe('storage-unavailable');
    });

    it('повреждённая запись — не отказ хранилища', () => {
        const windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        windowStub.localStorage.setItem(
            buildTestDraftKey(bareAddress('draft-a')),
            '{ сломанный json'
        );

        // Хранилище исправно, нечитаем сам черновик: назвать это отказом storage
        // значило бы показать пользователю сообщение о запрете localStorage,
        // которого не было
        expect(
            migrateBuilderDraft(
                TEST_DRAFT_PRINCIPAL,
                bareAddress('draft-a'),
                bareAddress('draft-b')
            )
        ).toBe('nothing-to-migrate');
    });

    it('валидный JSON неверной формы — тоже не отказ хранилища', () => {
        const windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
        // `null` разбирается успешно, а присваивание поля ему бросает уже после
        // разбора — и это по-прежнему порча данных, а не запрет localStorage
        windowStub.localStorage.setItem(buildTestDraftKey(bareAddress('draft-a')), 'null');

        expect(
            migrateBuilderDraft(
                TEST_DRAFT_PRINCIPAL,
                bareAddress('draft-a'),
                bareAddress('draft-b')
            )
        ).toBe('nothing-to-migrate');
    });

    it('одно имя под разными префиксами — независимые записи', () => {
        const blogPost: IBricksPageAddress = { pagename: 'post', urlPrefix: 'blog' };
        const newsPost: IBricksPageAddress = { pagename: 'post', urlPrefix: 'news' };

        seedDraft(blogPost, 'Пост блога');
        seedDraft(newsPost, 'Пост новостей');

        // Ключ по имени был бы общим: вторая запись затёрла бы первую, и открытая
        // рядом страница предложила бы восстановить чужие правки
        expect(getBuilderDraft(TEST_DRAFT_PRINCIPAL, blogPost)?.draftSnapshot.formState.title).toBe(
            'Пост блога'
        );
        expect(getBuilderDraft(TEST_DRAFT_PRINCIPAL, newsPost)?.draftSnapshot.formState.title).toBe(
            'Пост новостей'
        );
        expect(getBuilderDraft(TEST_DRAFT_PRINCIPAL, bareAddress('post'))).toBeNull();
    });

    it('перенос под другой префикс обновляет обе половины адреса записи', () => {
        const blogPost: IBricksPageAddress = { pagename: 'post', urlPrefix: 'blog' };
        const newsPost: IBricksPageAddress = { pagename: 'post', urlPrefix: 'news' };

        seedDraft(blogPost, 'Пост блога');

        expect(migrateBuilderDraft(TEST_DRAFT_PRINCIPAL, blogPost, newsPost)).toBe('migrated');

        // Не обнови перенос `urlPrefix` — запись под новым ключом считалась бы
        // черновиком чужого адреса, и bootstrap сессии её бы отверг
        expect(getBuilderDraft(TEST_DRAFT_PRINCIPAL, blogPost)).toBeNull();
        expect(getBuilderDraft(TEST_DRAFT_PRINCIPAL, newsPost)?.urlPrefix).toBe('news');
        expect(getBuilderDraft(TEST_DRAFT_PRINCIPAL, newsPost)?.pagename).toBe('post');
    });
});

describe('черновик билдера: владелец в ключе', () => {
    let windowStub: ReturnType<typeof createWindowStub>;

    beforeEach(() => {
        windowStub = createWindowStub();
        vi.stubGlobal('window', windowStub);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('две учётки на одной машине держат разные черновики одной страницы', () => {
        const page = bareAddress('shared-page');

        seedDraft(page, 'Правка первого редактора', 'database:1');
        seedDraft(page, 'Правка второго редактора', 'database:2');

        // Общий на браузер ключ отдавал второму редактору незавершённую работу
        // первого, а его автосейв её затирал
        expect(getBuilderDraft('database:1', page)?.draftSnapshot.formState.title).toBe(
            'Правка первого редактора'
        );
        expect(getBuilderDraft('database:2', page)?.draftSnapshot.formState.title).toBe(
            'Правка второго редактора'
        );
    });

    it('перенос черновика одной учётки не трогает запись другой', () => {
        seedDraft(bareAddress('draft-a'), 'Правка первого редактора', 'database:1');
        seedDraft(bareAddress('draft-a'), 'Правка второго редактора', 'database:2');

        expect(
            migrateBuilderDraft('database:1', bareAddress('draft-a'), bareAddress('draft-b'))
        ).toBe('migrated');

        expect(getBuilderDraft('database:1', bareAddress('draft-a'))).toBeNull();
        expect(
            getBuilderDraft('database:2', bareAddress('draft-a'))?.draftSnapshot.formState.title
        ).toBe('Правка второго редактора');
    });

    it('безымянная запись прежнего формата не читается и остаётся на месте', () => {
        const legacyKey = 'bricks-builder:draft:legacy-page';
        windowStub.localStorage.setItem(
            legacyKey,
            JSON.stringify({
                pagename: 'legacy-page',
                urlPrefix: null,
                updatedAt: '2026-08-01T10:00:00Z',
                mode: 'new',
                draftSnapshot: {
                    schema: { components: [] },
                    formState: buildFormState({ pagename: 'legacy-page', title: 'Прежний формат' }),
                },
            })
        );

        // Владельца у такой записи не определить, а молчаливое присвоение чужого
        // черновика — ровно тот дефект, который принципал и закрывает
        expect(getBuilderDraft('database:1', bareAddress('legacy-page'))).toBeNull();
        expect(windowStub.localStorage.getItem(legacyKey)).not.toBeNull();
    });

    it('неизвестный владелец: хранилище не читается и не пишется', () => {
        const page = bareAddress('unowned-page');

        seedDraft(page, 'Правка редактора', 'database:1');

        // Контракт fail closed: без владельца общий ключ снова слил бы учётки, а
        // сообщение о сломанном хранилище отправило бы человека искать поломку,
        // которой нет — поэтому удаление отвечает успехом, а не отказом
        expect(getBuilderDraft(null, page)).toBeNull();
        expect(setBuilderDraft(null, buildDraftEntry(page, 'Правка без владельца'))).toBe(false);
        expect(removeBuilderDraft(null, page)).toBe(true);
        expect(migrateBuilderDraft(null, page, bareAddress('unowned-target'))).toBe(
            'nothing-to-migrate'
        );

        // Ни чтение, ни запись, ни удаление чужой записи не коснулись
        expect(getBuilderDraft('database:1', page)?.draftSnapshot.formState.title).toBe(
            'Правка редактора'
        );
    });

    it('владелец берётся из режима и учётки, а неизвестный профиль даёт отказ', () => {
        expect(resolveBuilderDraftPrincipal(false, undefined)).toBe('basic');
        expect(resolveBuilderDraftPrincipal(true, 7)).toBe('database:7');
        // Общий ключ для нерешённого профиля снова слил бы учётки в одну
        expect(resolveBuilderDraftPrincipal(true, undefined)).toBeNull();
        expect(resolveBuilderDraftPrincipal(true, null)).toBeNull();
    });
});
