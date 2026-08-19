/**
 * @vitest-environment happy-dom
 *
 * Подготовка шаблона из строки списка страниц.
 *
 * Что здесь сторожится. Во-первых, источник обязан собираться ЦЕЛИКОМ из
 * прочитанной страницы: сводка списка в браузере — копия, и пока она лежала на
 * экране, страницу мог сохранить другой редактор; собранный из двух поколений
 * шаблон унёс бы свежую схему со старым оформлением и чужим кадром. Во-вторых,
 * быстрый перещёлк действия с одной строки на другую обязан открывать последний
 * выбор, а не первый доехавший ответ и не молчать в ответ на второй клик.
 */

// #region Imports
// Vitest
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Types
import type { TPublishedPageSummary } from '../../src/runtime/modules/common/types/bricks-api';
// #endregion

// #region Mocks
const { fetchPageRequestMock, notifyMock } = vi.hoisted(() => ({
    fetchPageRequestMock: vi.fn(),
    notifyMock: vi.fn(),
}));

vi.mock('vue-i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../../src/runtime/modules/builder/publish/utils/publishApi', () => ({
    fetchPageRequest: fetchPageRequestMock,
}));
// #endregion

import { usePublishTemplatesSurface } from '../../src/runtime/modules/builder/publish/composables/usePublishTemplatesSurface';

// #region Fixtures
/** Сводка списка: то, что лежит на экране и могло устареть. */
const STALE_SUMMARY = {
    id: 3,
    pagename: 'staroe-imya',
    title: 'Старое название',
    description: 'Старое описание',
    keywords: '',
    backgroundColor: '#000000',
    layout: 'old-layout',
    socialImage: '',
    urlPrefix: null,
    subdomain: null,
    thumbnailUrl: 'https://bucket.example/page-3-old.webp',
    viewportConfig: null,
    published: true,
    revision: 4,
    createdAt: '2026-07-01T10:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
} as unknown as TPublishedPageSummary;

/** Свежая строка: её и сохранил другой редактор, пока список лежал на экране. */
const FRESH_PAGE = {
    ...STALE_SUMMARY,
    pagename: 'novoe-imya',
    title: 'Новое название',
    description: 'Новое описание',
    layout: 'landing',
    backgroundColor: '#101010',
    thumbnailUrl: 'https://bucket.example/page-3-fresh.webp',
    updatedAt: '2026-08-19T10:00:00.000Z',
    schema: {
        components: [
            {
                id: 'text-1',
                type: 'component',
                componentName: 'Text',
                brickPath: 'content/text',
                zIndex: 1,
                props: {},
            },
        ],
    },
};
// #endregion

describe('usePublishTemplatesSurface: подготовка источника шаблона', () => {
    beforeEach(() => {
        fetchPageRequestMock.mockReset();
        notifyMock.mockReset();
    });

    it('собирает источник из прочитанной страницы, а не из устаревшей сводки', async () => {
        fetchPageRequestMock.mockResolvedValue(FRESH_PAGE);

        const surface = usePublishTemplatesSurface({ onNotify: notifyMock });

        await surface.requestFromPage(STALE_SUMMARY);

        expect(surface.isModalOpen.value).toBe(true);
        expect(surface.source.value).toEqual(
            expect.objectContaining({
                suggestedName: 'Новое название',
                suggestedDescription: 'Новое описание',
                pageLabel: 'Новое название',
                pageAddressPath: '/novoe-imya',
                thumbnailSourceUrl: 'https://bucket.example/page-3-fresh.webp',
                blocksCount: 1,
                pageUpdatedAt: '2026-08-19T10:00:00.000Z',
            })
        );
        expect(surface.source.value?.pageMeta).toEqual({
            layout: 'landing',
            backgroundColor: '#101010',
            viewportConfig: null,
        });
    });

    it('второй клик по другой строке открывает свой шаблон, а не молчит', async () => {
        // Занятость показана только у своей строки, поэтому кнопки остальных
        // выглядят активными — немой клик читался бы как поломка
        const firstPage = { ...FRESH_PAGE, pagename: 'first', title: 'Первая' };
        const secondPage = { ...FRESH_PAGE, id: 9, pagename: 'second', title: 'Вторая' };
        let releaseFirst: (() => void) | undefined;

        fetchPageRequestMock
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        releaseFirst = () => resolve(firstPage);
                    })
            )
            .mockResolvedValueOnce(secondPage);

        const surface = usePublishTemplatesSurface({ onNotify: notifyMock });

        const firstRequest = surface.requestFromPage(STALE_SUMMARY);
        await surface.requestFromPage({ ...STALE_SUMMARY, id: 9 } as TPublishedPageSummary);

        expect(surface.source.value?.pageLabel).toBe('Вторая');

        // Первый ответ доезжает позже — и своё содержимое уже не применяет
        releaseFirst?.();
        await firstRequest;

        expect(surface.source.value?.pageLabel).toBe('Вторая');
    });

    it('отказ чтения не открывает форму и объясняется тостом', async () => {
        fetchPageRequestMock.mockRejectedValue(new Error('network is down'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        const surface = usePublishTemplatesSurface({ onNotify: notifyMock });

        await surface.requestFromPage(STALE_SUMMARY);

        expect(surface.isModalOpen.value).toBe(false);
        expect(surface.preparingPageId.value).toBeNull();
        expect(notifyMock).toHaveBeenCalledWith(
            'bricks.templates.errors.sourceReadFailed',
            'error'
        );
    });
});
