// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { TPublishFormState } from '../../src/runtime/modules/common/types/bricks-api';

// Utils
import { validatePublishFormState } from '../../src/runtime/modules/builder/publish/utils/formValidation';
// #endregion

// #region Helpers
/**
 * Собирает состояние формы публикации с валидными значениями по умолчанию.
 *
 * @param overrides - Поля, переопределяющие валидный набор.
 * @returns Состояние формы.
 */
function buildFormState(overrides: Partial<TPublishFormState> = {}): TPublishFormState {
    return {
        pagename: 'landing-page',
        title: 'Landing page',
        description: 'Описание длиннее десяти символов',
        keywords: 'promo, page',
        socialImage: null,
        layout: 'default',
        backgroundColor: null,
        urlPrefix: null,
        subdomain: null,
        published: false,
        createdAt: '2026-08-01T10:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        ...overrides,
    };
}
// #endregion

describe('validatePublishFormState: проверка перед публикацией', () => {
    it('пропускает валидный набор', () => {
        const { errors } = validatePublishFormState(buildFormState(), () => true);

        expect(errors).toEqual({});
    });

    // Границы длины держит yup-схема формы, и раньше проверка перед сохранением
    // их не знала: поле краснело в сайдбаре, а запись всё равно уходила
    it('отклоняет title короче минимума, который показывает форма', () => {
        const { errors } = validatePublishFormState(buildFormState({ title: 'ab' }), () => true);

        expect(errors.title).toBe('bricks.publish.validation.titleMin');
    });

    it('отклоняет description короче минимума', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ description: 'коротко' }),
            () => true
        );

        expect(errors.description).toBe('bricks.publish.validation.descriptionMin');
    });

    it('отклоняет title и description длиннее предела', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ title: 'a'.repeat(121), description: 'б'.repeat(501) }),
            () => true
        );

        expect(errors.title).toBe('bricks.publish.validation.titleMax');
        expect(errors.description).toBe('bricks.publish.validation.descriptionMax');
    });

    it('отклоняет keywords длиннее предела склеенной строки', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ keywords: 'k'.repeat(256) }),
            () => true
        );

        expect(errors.keywords).toBe('bricks.publish.validation.keywordsMax');
    });

    it('меряет длину по обрезанному значению — сервер делает так же', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ title: '   ab   ' }),
            () => true
        );

        expect(errors.title).toBe('bricks.publish.validation.titleMin');
    });

    it('пустые поля остаются «обязательными», а не «слишком короткими»', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ title: '', description: '   ' }),
            () => true
        );

        expect(errors.title).toBe('bricks.publish.validation.titleRequired');
        expect(errors.description).toBe('bricks.publish.validation.descriptionRequired');
    });

    it('отклоняет занятый pagename', () => {
        const { errors } = validatePublishFormState(buildFormState(), () => false);

        expect(errors.pagename).toBe('bricks.publish.validation.pagenameTaken');
    });

    // Гейт стоит последним перед записью, и форма ему не единственный источник:
    // состояние приезжает и из черновика localStorage, минуя yup-схему полей
    it('отклоняет pagename, чей адрес занят в роутинге приложения', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ pagename: 'bricks' }),
            () => true
        );

        expect(errors.pagename).toBe('bricks.publish.validation.pagenameAddressTaken');
    });

    it('отклоняет urlPrefix, уводящий адрес страницы под занятый маршрут', () => {
        const { errors } = validatePublishFormState(
            buildFormState({ urlPrefix: 'bricks' }),
            () => true
        );

        expect(errors.urlPrefix).toBe('bricks.publish.validation.urlPrefixAddressTaken');
        // pagename при этом валиден: без префикса его адрес свободен
        expect(errors.pagename).toBeUndefined();
    });
});
