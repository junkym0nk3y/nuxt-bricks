// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Types
import type { TPublishFormState } from '../src/runtime/modules/common/types/bricks-api';
import type { IPublishPageFormValues } from '../src/runtime/modules/builder/publish/types/dashboard';

// Utils
import {
    buildPagePayload,
    buildMetaPatchPayload,
} from '../src/runtime/modules/builder/publish/utils/pagePayload';
// #endregion

/**
 * Собирает состояние формы публикации с переопределениями.
 *
 * @param overrides - Переопределяемые поля.
 * @returns Полное состояние формы.
 */
function buildFormState(overrides: Partial<TPublishFormState> = {}): TPublishFormState {
    return {
        pagename: 'landing',
        title: 'Landing',
        description: 'Описание страницы',
        keywords: 'landing',
        published: true,
        layout: 'default',
        backgroundColor: '#000000',
        socialImage: 'https://cdn.example.com/og.png',
        urlPrefix: 'blog',
        subdomain: 'promo',
        createdAt: '',
        updatedAt: '',
        ...overrides,
    };
}

describe('buildPagePayload: payload создания/обновления страницы', () => {
    it('переносит поля формы и нормализует схему', () => {
        const payload = buildPagePayload({ components: [] }, buildFormState());

        expect(payload).toMatchObject({
            pagename: 'landing',
            title: 'Landing',
            published: true,
            urlPrefix: 'blog',
            subdomain: 'promo',
            schema: { components: [] },
        });
    });

    it('подставляет дефолты для пустых layout/backgroundColor и null для опциональных', () => {
        const payload = buildPagePayload(
            { components: [] },
            buildFormState({
                layout: '',
                backgroundColor: '',
                socialImage: '',
                urlPrefix: '',
                subdomain: '',
            })
        );

        expect(payload.layout).toBe('default');
        expect(payload.backgroundColor).toBe('#FFFFFF');
        expect(payload.socialImage).toBeNull();
        expect(payload.urlPrefix).toBeNull();
        expect(payload.subdomain).toBeNull();
    });
});

describe('buildMetaPatchPayload: частичный PATCH meta-полей панели деталей', () => {
    const values: IPublishPageFormValues = {
        pagename: '  landing  ',
        title: '  Landing  ',
        description: 'Описание страницы',
        keywords: 'landing',
        socialImage: '',
        urlPrefix: '  ',
        subdomain: ' promo ',
        layout: 'default',
        backgroundColor: '#000000',
    };

    it('тримит строки и приводит пустые опциональные поля к null', () => {
        const payload = buildMetaPatchPayload(values);

        expect(payload).toEqual({
            pagename: 'landing',
            title: 'Landing',
            description: 'Описание страницы',
            keywords: 'landing',
            socialImage: null,
            urlPrefix: null,
            subdomain: 'promo',
        });
    });

    it('не затрагивает schema, layout, backgroundColor и published', () => {
        const payload = buildMetaPatchPayload(values);

        expect(payload).not.toHaveProperty('schema');
        expect(payload).not.toHaveProperty('layout');
        expect(payload).not.toHaveProperty('backgroundColor');
        expect(payload).not.toHaveProperty('published');
    });
});
