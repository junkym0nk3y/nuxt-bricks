/**
 * Стартовый контент layout-блока доезжает до карточки библиотеки.
 *
 * Определения блоков держат структурный дефолт нейтральным (пустая строка у Text,
 * пустой массив у Accordion): дефолт уезжает в схему при первом сохранении и с этого
 * момента принадлежит человеку, а не билдеру. Локализованный текст материализуется
 * один раз — здесь, при сборке списка библиотеки.
 *
 * Проверяется именно место слияния, а не `resolveBlockSeedProps` в отрыве: контракт
 * определения можно оставить целым и потерять его доставку, вернув список к голому
 * `LAYOUT_COMPONENTS`. Тогда новый Text снова появляется пустым.
 */

// #region Imports
// Vitest
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Vue
import { ref } from 'vue';
// #endregion

// #region Mocks
const { apiFetcherMock } = vi.hoisted(() => ({
    apiFetcherMock: vi.fn(),
}));

vi.mock('#imports', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();
    const { createUseAsyncDataStub } = await import('../helpers/asyncData');

    return {
        ...actual,
        useAsyncData: createUseAsyncDataStub(),
    };
});

vi.mock('../../src/runtime/modules/common/composables/useApiClient', () => ({
    useApiClient: () => ({ apiFetcher: apiFetcherMock }),
}));

vi.mock('../../src/runtime/modules/common/composables/useBrickImports', () => ({
    useBrickImports: () => ({ findImportModule: vi.fn(), hasBrickModule: () => true }),
}));

vi.mock('../../src/runtime/modules/builder/core/stores/components', () => ({
    useComponentsStore: () => ({
        selectedComponentData: null,
        setSelectedComponentMetadata: vi.fn(),
    }),
}));
// #endregion

import { useNuxtApp } from '#imports';
import { useComponentLibrary } from '../../src/runtime/modules/builder/app/composables/useComponentLibrary';

/** Активная локаль поддельного композера: карточки обязаны следовать за ней. */
const locale = ref('ru');

/** Тексты, которых хватает сидам Text и Accordion. */
const MESSAGES: Record<string, Record<string, string>> = {
    ru: {
        'bricks.blocks.text.defaultContent': 'Введите текст',
        'bricks.properties.accordion.defaultTitle': 'Вопрос {n}',
        'bricks.properties.accordion.defaultContent': 'Ответ',
    },
    en: {
        'bricks.blocks.text.defaultContent': 'Enter text',
        'bricks.properties.accordion.defaultTitle': 'Question {n}',
        'bricks.properties.accordion.defaultContent': 'Answer',
    },
};

/**
 * Поддельный глобальный композер. `t` читает реактивную локаль — ровно этим настоящий
 * композер и делает computed списка зависимым от языка.
 *
 * @param key - Ключ локали.
 * @param params - Значения интерполяции.
 * @returns Перевод либо сам ключ.
 */
function translate(key: string, params?: Record<string, unknown>): string {
    const message = MESSAGES[locale.value]?.[key] ?? key;

    if (!params) {
        return message;
    }

    return Object.entries(params).reduce(
        (text, [name, value]) => text.replace(`{${name}}`, String(value)),
        message
    );
}

describe('useComponentLibrary: стартовый контент layout-блоков', () => {
    beforeEach(() => {
        locale.value = 'ru';
        apiFetcherMock.mockResolvedValue({ bricks: [] });
        Object.assign(useNuxtApp(), { $i18n: { t: translate, locale } });
    });

    afterEach(() => {
        vi.restoreAllMocks();
        apiFetcherMock.mockReset();
    });

    it('карточка Text приходит с локализованным текстом, а не пустой', async () => {
        const { componentLibraryList } = await useComponentLibrary();
        const text = componentLibraryList.value.find((item) => item.name === 'Text');

        expect(text?.defaultProps?.content).toBe('<p>Введите текст</p>');
    });

    it('карточка Accordion приходит с одним локализованным элементом', async () => {
        const { componentLibraryList } = await useComponentLibrary();
        const accordion = componentLibraryList.value.find((item) => item.name === 'Accordion');

        expect(accordion?.defaultProps?.items).toEqual([
            { title: 'Вопрос 1', content: '<p>Ответ</p>' },
        ]);
    });

    // Смена языка обязана доехать до следующего перетащенного блока: сид считается на
    // чтении списка, а не запоминается при сборке модуля
    it('смена языка меняет сид следующей карточки', async () => {
        const { componentLibraryList } = await useComponentLibrary();

        expect(
            componentLibraryList.value.find((item) => item.name === 'Text')?.defaultProps?.content
        ).toBe('<p>Введите текст</p>');

        locale.value = 'en';

        expect(
            componentLibraryList.value.find((item) => item.name === 'Text')?.defaultProps?.content
        ).toBe('<p>Enter text</p>');
    });

    // Блок без сида проходит через слияние нетронутым: лишняя копия объекта здесь
    // ничего не ломает, но и смысла не имеет
    it('блок без сида остаётся тем же объектом библиотеки', async () => {
        const { componentLibraryList } = await useComponentLibrary();
        const grid = componentLibraryList.value.find((item) => item.name === 'Grid');

        expect(grid?.defaultProps).toBeDefined();
        expect(grid?.defaultProps?.content).toBeUndefined();
    });
});
