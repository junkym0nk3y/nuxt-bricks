// #region Imports
// Types
import type { IDocArticle } from '../types/documentation';

// Vue
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Composables
import { useMarkdownRenderer } from './useMarkdownRenderer';
// #endregion

// #region Data
const mdFiles = import.meta.glob<string>('../docs/guide/**/*.md', {
    query: '?raw',
    import: 'default',
});

// Локаль, статьи которой показываются, когда для активной локали статей нет
const FALLBACK_DOC_LOCALE = 'ru';

// Кэш заголовков статей (H1 из markdown), заполняется лениво по локали.
// Второй eager-glob для заголовков не используем: он инлайнил весь markdown
// в чанк модалки и дублировал lazy-чанки статей.
const articleTitles = ref<Record<string, string>>({});
const loadedTitlePrefixes = new Set<string>();
// #endregion

// #region Methods
/**
 * Возвращает glob-префикс папки статей для локали.
 *
 * @param locale - Код локали (`ru` / `en`).
 */
function getLocalePrefix(locale: string): string {
    return `../docs/guide/${locale}/`;
}

/**
 * Заголовок-fallback из slug'а файла, пока H1 статьи ещё не загружен.
 *
 * @param slug - Slug из имени файла (`02-interface` → `interface`).
 */
function titleFromSlug(slug: string): string {
    return slug
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Лениво подгружает H1-заголовки всех статей локали в кэш `articleTitles`.
 * Каждая статья — собственный lazy-чанк; повторный вызов для локали — no-op.
 *
 * @param prefix - Glob-префикс папки локали.
 */
async function loadTitlesForPrefix(prefix: string): Promise<void> {
    if (loadedTitlePrefixes.has(prefix)) {
        return;
    }
    loadedTitlePrefixes.add(prefix);

    const paths = Object.keys(mdFiles).filter((path) => path.startsWith(prefix));
    await Promise.all(
        paths.map(async (path) => {
            try {
                const raw = await mdFiles[path]();
                const titleMatch = raw.match(/^#\s+(.+)/m);
                if (titleMatch) {
                    articleTitles.value = {
                        ...articleTitles.value,
                        [path]: titleMatch[1].trim(),
                    };
                }
            } catch {
                // Заголовок останется fallback'ом из slug'а
            }
        })
    );
}
// #endregion

/**
 * Composable для автоматической загрузки и навигации по статьям документации.
 * Статьи разложены по папкам локалей (`docs/guide/ru/`, `docs/guide/en/`);
 * если для активной локали статей нет — используется fallback-локаль.
 */
export function useDocumentationArticles() {
    // #region Data
    const { locale, t } = useI18n();
    const activeArticlePath = ref('');
    const articleContent = ref('');
    const isContentLoading = ref(false);
    const { renderMarkdown, isLoading: isMarkdownLoading } = useMarkdownRenderer();
    // #endregion

    // #region Computed
    /**
     * Локаль, папка которой реально содержит статьи:
     * активная локаль либо fallback, если её папка пуста.
     */
    const effectiveLocale = computed<string>(() => {
        const prefix = getLocalePrefix(locale.value);
        const hasArticles = Object.keys(mdFiles).some((path) => path.startsWith(prefix));
        return hasArticles ? locale.value : FALLBACK_DOC_LOCALE;
    });

    /**
     * Список статей активной локали, извлечённый из glob-результатов.
     * Сортируется по числовому префиксу в имени файла.
     */
    const articles = computed<IDocArticle[]>(() => {
        const result: IDocArticle[] = [];
        const prefix = getLocalePrefix(effectiveLocale.value);

        for (const path of Object.keys(mdFiles)) {
            if (!path.startsWith(prefix)) {
                continue;
            }

            const filename = path.split('/').pop() || '';
            const match = filename.match(/^(\d+)-(.+)\.md$/);

            if (!match) {
                continue;
            }

            const order = parseInt(match[1], 10);
            const slug = match[2];
            const title = articleTitles.value[path] ?? titleFromSlug(slug);

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
            articleContent.value = `<p>${t('bricks.docs.articleNotFound')}</p>`;
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
     * Переключает текущую статью. Поиск скоупится папкой активной локали,
     * чтобы кросс-ссылка вида `./02-interface.md` не матчила чужую локаль.
     *
     * @param pathOrSlug - Glob-путь или slug/имя файла для навигации.
     */
    function navigateTo(pathOrSlug: string): void {
        const prefix = getLocalePrefix(effectiveLocale.value);

        // Попытка найти по точному пути (в пределах активной локали)
        if (pathOrSlug.startsWith(prefix) && mdFiles[pathOrSlug]) {
            activeArticlePath.value = pathOrSlug;
            return;
        }

        // Поиск по имени файла (для кросс-ссылок вида ./02-components.md)
        const normalized = pathOrSlug.replace(/^\.\//, '');
        const found = Object.keys(mdFiles).find(
            (path) => path.startsWith(prefix) && path.endsWith(`/${normalized}`)
        );
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
    // Заголовки статей активной локали подтягиваются лениво при первом обращении
    watch(
        effectiveLocale,
        (newLocale) => {
            loadTitlesForPrefix(getLocalePrefix(newLocale));
        },
        { immediate: true }
    );

    watch(
        activeArticlePath,
        (newPath) => {
            if (newPath) {
                loadArticleContent(newPath);
            }
        },
        { immediate: true }
    );

    // Смена локали: открываем ту же статью в новой локали (по slug), иначе первую
    watch(effectiveLocale, () => {
        if (!activeArticlePath.value) {
            return;
        }

        const currentSlug = activeArticlePath.value.split('/').pop() ?? '';
        const sameArticle = articles.value.find((a) => a.path.endsWith(`/${currentSlug}`));
        activeArticlePath.value = sameArticle?.path ?? articles.value[0]?.path ?? '';
    });
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
