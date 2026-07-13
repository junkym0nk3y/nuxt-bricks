import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const localeRef = ref('ru');

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        locale: localeRef,
        t: (key: string) => key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/documentation/composables/useMarkdownRenderer', () => ({
    useMarkdownRenderer: () => ({
        renderMarkdown: async (raw: string) => raw,
        isLoading: ref(false),
    }),
}));

import { useDocumentationArticles } from '../../src/runtime/modules/builder/documentation/composables/useDocumentationArticles';

describe('useDocumentationArticles', () => {
    it('строит список статей локали и лениво резолвит H1-заголовки', async () => {
        const { articles } = useDocumentationArticles();

        // Список доступен сразу (из ключей glob'а), без eager-загрузки контента
        expect(articles.value.length).toBeGreaterThan(0);
        expect(articles.value[0].slug).toBe('getting-started');
        expect(articles.value.every((a) => a.path.includes('/ru/'))).toBe(true);

        // После загрузки lazy-чанков заголовки берутся из H1 статьи
        await vi.waitFor(() => {
            expect(articles.value[0].title).toBe('Начало работы');
        });
    });

    it('навигация по кросс-ссылке остаётся внутри активной локали', async () => {
        const { articles, activeArticlePath, navigateTo, initFirstArticle } =
            useDocumentationArticles();

        initFirstArticle();
        navigateTo('./02-interface.md');
        expect(activeArticlePath.value).toContain('/ru/02-interface.md');
        expect(articles.value.some((a) => a.path === activeArticlePath.value)).toBe(true);
    });
});
