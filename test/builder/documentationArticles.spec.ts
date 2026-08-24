import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

const localeRef = ref('ru');

/**
 * Управляемый рендер markdown: спека сама решает, когда завершится каждый вызов.
 * Нужен для гонки переключений — иначе чанк статьи и рендер укладываются в одну
 * микротаску, и порядок ответов не задать.
 */
const renderControl = {
    isDeferred: false,
    pending: [] as { raw: string; resolve: (html: string) => void }[],
};

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        locale: localeRef,
        t: (key: string) => key,
    }),
}));

vi.mock('../../src/runtime/modules/builder/documentation/composables/useMarkdownRenderer', () => ({
    useMarkdownRenderer: () => ({
        renderMarkdown: (raw: string) =>
            renderControl.isDeferred
                ? new Promise<string>((resolve) => {
                      renderControl.pending.push({ raw, resolve });
                  })
                : Promise.resolve(raw),
        isLoading: ref(false),
    }),
}));

import { useDocumentationArticles } from '../../src/runtime/modules/builder/documentation/composables/useDocumentationArticles';

/**
 * Дожидается, пока в очереди рендера окажется нужное число вызовов: чанк статьи
 * читается своим await, и до рендера доходит не в этом тике.
 *
 * @param count - Ожидаемое число начатых рендеров.
 */
async function waitForPendingRenders(count: number): Promise<void> {
    await vi.waitFor(() => {
        expect(renderControl.pending.length).toBe(count);
    });
}

/**
 * Завершает один из начатых рендеров и даёт композаблу дописать результат.
 *
 * @param index - Позиция вызова в очереди.
 */
async function resolveRender(index: number): Promise<void> {
    const call = renderControl.pending[index];
    call.resolve(`<h1>${call.raw.slice(0, 24)}</h1>`);

    // Макротаска, а не пара микротасок: после рендера композабл дописывает результат
    // через свои await, и подобранное число тиков краснело бы от любой правки цепочки
    await new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
}

describe('useDocumentationArticles', () => {
    beforeEach(() => {
        localeRef.value = 'ru';
        renderControl.isDeferred = false;
        renderControl.pending.length = 0;
    });

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

    // Дальше — гонка чтения. Медленный ответ по покинутой статье оставлял на экране
    // её текст под заголовком другой: содержимое писалось без проверки, что путь,
    // который читали, всё ещё открыт
    it('поздний ответ покинутой статьи не переписывает открытую', async () => {
        renderControl.isDeferred = true;

        const { articles, activeArticlePath, articleContent } = useDocumentationArticles();

        activeArticlePath.value = articles.value[0].path;
        await waitForPendingRenders(1);

        activeArticlePath.value = articles.value[1].path;
        await waitForPendingRenders(2);

        const openedRaw = renderControl.pending[1].raw;
        const abandonedRaw = renderControl.pending[0].raw;

        await resolveRender(1);
        expect(articleContent.value).toContain(openedRaw.slice(0, 24));

        await resolveRender(0);
        expect(articleContent.value).toContain(openedRaw.slice(0, 24));
        expect(articleContent.value).not.toContain(abandonedRaw.slice(0, 24));
    });

    it('устаревшее чтение не гасит спиннер того, которое его обогнало', async () => {
        renderControl.isDeferred = true;

        const { articles, activeArticlePath, articleContent, isContentLoading } =
            useDocumentationArticles();

        activeArticlePath.value = articles.value[0].path;
        await waitForPendingRenders(1);

        activeArticlePath.value = articles.value[1].path;
        await waitForPendingRenders(2);

        // Первое чтение — то самое, под которое поднят спиннер первой загрузки
        expect(isContentLoading.value).toBe(true);

        await resolveRender(0);
        expect(articleContent.value).toBe('');
        expect(isContentLoading.value).toBe(true);

        await resolveRender(1);
        expect(articleContent.value).not.toBe('');
        expect(isContentLoading.value).toBe(false);
    });

    it('переход на неизвестный путь обесценивает идущее чтение и снимает спиннер', async () => {
        renderControl.isDeferred = true;

        const { articles, activeArticlePath, articleContent, isContentLoading } =
            useDocumentationArticles();

        activeArticlePath.value = articles.value[0].path;
        await waitForPendingRenders(1);

        activeArticlePath.value = '../docs/guide/ru/99-missing.md';
        await vi.waitFor(() => {
            expect(articleContent.value).toContain('bricks.docs.articleNotFound');
        });
        expect(isContentLoading.value).toBe(false);

        await resolveRender(0);
        expect(articleContent.value).toContain('bricks.docs.articleNotFound');
        expect(isContentLoading.value).toBe(false);
    });
});
