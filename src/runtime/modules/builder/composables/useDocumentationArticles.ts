// #region Imports
// Types
import type { IDocArticle } from '../types/documentation';

// Vue
import { computed, ref, watch } from 'vue';

// Composables
import { useMarkdownRenderer } from './useMarkdownRenderer';
// #endregion

// #region Data
const mdFiles = import.meta.glob('../docs/guide/**/*.md', {
    query: '?raw',
    import: 'default',
}) as Record<string, () => Promise<string>>;

const mdFilesEager = import.meta.glob('../docs/guide/**/*.md', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;
// #endregion

/**
 * Composable для автоматической загрузки и навигации по статьям документации.
 */
export function useDocumentationArticles() {
    // #region Data
    const activeArticlePath = ref('');
    const articleContent = ref('');
    const isContentLoading = ref(false);
    const { renderMarkdown, isLoading: isMarkdownLoading } = useMarkdownRenderer();
    // #endregion

    // #region Computed
    /**
     * Список статей, извлечённый из glob-результатов.
     * Сортируется по числовому префиксу в имени файла.
     */
    const articles = computed<IDocArticle[]>(() => {
        const result: IDocArticle[] = [];

        for (const path of Object.keys(mdFiles)) {
            const filename = path.split('/').pop() || '';
            const match = filename.match(/^(\d+)-(.+)\.md$/);

            if (!match) {
                continue;
            }

            const order = parseInt(match[1], 10);
            const slug = match[2];

            const raw = mdFilesEager[path];
            const titleMatch = raw?.match(/^#\s+(.+)/m);
            const title = titleMatch
                ? titleMatch[1].trim()
                : slug
                      .split('-')
                      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                      .join(' ');

            result.push({
                path,
                title,
                order,
                slug,
            });
        }

        return result.sort((a, b) => a.order - b.order);
    });

    /**
     * Индекс текущей статьи в списке.
     */
    const activeArticleIndex = computed<number>(() =>
        articles.value.findIndex((a) => a.path === activeArticlePath.value)
    );
    // #endregion

    // #region Methods
    /**
     * Загружает и рендерит содержимое файла по пути.
     * Спиннер показывается только при первой загрузке (когда контента ещё нет).
     * При переключении между статьями старый контент остаётся видимым до замены.
     *
     * @param path - Glob-путь к .md файлу.
     */
    async function loadArticleContent(path: string): Promise<void> {
        const loader = mdFiles[path];
        if (!loader) {
            articleContent.value = '<p>Статья не найдена.</p>';
            return;
        }

        const isFirstLoad = articleContent.value === '';
        if (isFirstLoad) {
            isContentLoading.value = true;
        }

        try {
            const raw = await loader();
            const html = await renderMarkdown(raw);
            articleContent.value = html;
        } finally {
            isContentLoading.value = false;
        }
    }

    /**
     * Переключает текущую статью.
     *
     * @param pathOrSlug - Glob-путь или slug/имя файла для навигации.
     */
    function navigateTo(pathOrSlug: string): void {
        // Попытка найти по точному пути
        if (mdFiles[pathOrSlug]) {
            activeArticlePath.value = pathOrSlug;
            return;
        }

        // Поиск по имени файла или slug (для кросс-ссылок вида ./02-components.md)
        const normalized = pathOrSlug.replace(/^\.\//, '');
        const found = Object.keys(mdFiles).find((path) => path.endsWith(`/${normalized}`));
        if (found) {
            activeArticlePath.value = found;
            return;
        }

        // Поиск по slug
        const article = articles.value.find((a) => a.slug === pathOrSlug);
        if (article) {
            activeArticlePath.value = article.path;
        }
    }

    /**
     * Инициализирует первую статью, если ещё не выбрана.
     */
    function initFirstArticle(): void {
        if (activeArticlePath.value || articles.value.length === 0) {
            return;
        }

        activeArticlePath.value = articles.value[0].path;
    }
    // #endregion

    // #region Lifecycle
    watch(
        activeArticlePath,
        (newPath) => {
            if (newPath) {
                loadArticleContent(newPath);
            }
        },
        { immediate: true }
    );
    // #endregion

    return {
        articles,
        activeArticlePath,
        activeArticleIndex,
        articleContent,
        isContentLoading,
        isMarkdownLoading,
        navigateTo,
        initFirstArticle,
    };
}
