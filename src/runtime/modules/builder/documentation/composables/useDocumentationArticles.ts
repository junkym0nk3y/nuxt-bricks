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

// Cache of the headings of the articles (the H1 of the markdown), filled lazily per
// locale. A second eager glob for the headings alone is not used: it inlined the whole
// of the markdown into the chunk of the modal and duplicated the lazy chunks of the
// articles.
const articleTitles = ref<Record<string, string>>({});
const loadedTitlePrefixes = new Set<string>();
// #endregion

// #region Methods
/**
 * Returns the glob prefix of the folder of articles of a locale.
 *
 * @param locale - The code of the locale (`ru` / `en`).
 */
function getLocalePrefix(locale: string): string {
    return `../docs/guide/${locale}/`;
}

/**
 * The fallback heading built from the slug of the file, shown while the H1 of the
 * article has not been read — and for good when there is no H1 to read.
 *
 * @param slug - The slug taken from the file name (`02-interface` → `interface`).
 */
function titleFromSlug(slug: string): string {
    return slug
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * Reads the H1 headings of every article of a locale into the `articleTitles` cache.
 * Each article is a lazy chunk of its own; a repeated call for the same locale is a
 * no-op.
 *
 * @param prefix - The glob prefix of the folder of the locale.
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
                // The heading stays the fallback built from the slug
            }
        })
    );
}
// #endregion

/**
 * Reading of the articles of the documentation and navigation over them.
 *
 * The articles are laid out in a folder per locale (`docs/guide/ru/`). A locale with no
 * folder of its own is told the articles are coming instead of being shown those of
 * another language: the guide is written in Russian alone for now, and a reader who chose
 * the English interface would not read it.
 */
export function useDocumentationArticles() {
    // #region Data
    const { locale, t } = useI18n();
    const activeArticlePath = ref('');
    const articleContent = ref('');
    const isContentLoading = ref(false);
    const { renderMarkdown } = useMarkdownRenderer();

    /**
     * The generation of a read of an article. Both the chunk of the file and the
     * rendering of the markdown are asynchronous, and over their awaits the reader can
     * switch to another article — an answer of a read nobody is waiting for any more
     * must not reach the screen.
     *
     * The generation lives in the instance rather than in a module variable: on the
     * server one module counter would be shared by every request of the process, and
     * parallel readers would cancel each other's reads. The cache of the headings and
     * the set of the prefixes already read are build-time statics, identical for every
     * request, and stay at the module level.
     */
    let contentGeneration = 0;
    // #endregion

    // #region Computed
    /** Whether the active locale has articles of its own */
    const hasArticles = computed<boolean>(() => {
        const prefix = getLocalePrefix(locale.value);
        return Object.keys(mdFiles).some((path) => path.startsWith(prefix));
    });

    /**
     * The articles of the active locale, taken out of the results of the glob. Ordered
     * by the numeric prefix of the file name.
     */
    const articles = computed<IDocArticle[]>(() => {
        const result: IDocArticle[] = [];
        const prefix = getLocalePrefix(locale.value);

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

    // #endregion

    // #region Methods
    /**
     * Reads and renders the contents of the file at a path.
     *
     * The spinner is shown on the first read alone, while there is nothing on screen
     * yet. When the reader switches between articles the previous text stays visible
     * until the new one replaces it: a spinner in its place would take away what the
     * reader came for.
     *
     * The generation is raised before the lookup of the loader, so that a jump to an
     * unknown path invalidates the read in flight as well. The refusal branch lowers
     * the spinner by itself for that very reason: the `finally` of the read it has
     * just invalidated is no longer allowed to touch the flag.
     *
     * @param path - The glob path of the .md file.
     */
    async function loadArticleContent(path: string): Promise<void> {
        contentGeneration += 1;
        const generation = contentGeneration;

        const loader = mdFiles[path];
        if (!loader) {
            articleContent.value = `<p>${t('bricks.docs.articleNotFound')}</p>`;
            isContentLoading.value = false;
            return;
        }

        const isFirstLoad = articleContent.value === '';
        if (isFirstLoad) {
            isContentLoading.value = true;
        }

        try {
            const raw = await loader();
            if (generation !== contentGeneration) {
                return;
            }

            const html = await renderMarkdown(raw);
            if (generation !== contentGeneration) {
                return;
            }

            articleContent.value = html;
        } finally {
            // The flag belongs to the newest read: lowering it unconditionally would
            // hide the spinner of the read that has taken this one over
            if (generation === contentGeneration) {
                isContentLoading.value = false;
            }
        }
    }

    /**
     * Switches the current article. The lookup is scoped to the folder of the active
     * locale, so that a cross-link of the `./02-interface.md` kind cannot match the
     * article of another locale.
     *
     * @param pathOrSlug - A glob path, or the slug / file name to navigate to.
     */
    function navigateTo(pathOrSlug: string): void {
        const prefix = getLocalePrefix(locale.value);

        // By the exact path first (within the active locale)
        if (pathOrSlug.startsWith(prefix) && mdFiles[pathOrSlug]) {
            activeArticlePath.value = pathOrSlug;
            return;
        }

        // By the file name (for cross-links of the ./02-components.md kind). The name
        // is compared regardless of case, because the sanitizer keeps such a link
        // regardless of case as well: were this side alone strict, a link written
        // `./02-Interface.md` would survive the filter, be intercepted by the modal
        // and then lead nowhere — a dead link with no sign of why.
        const normalized = pathOrSlug.replace(/^\.\//, '').toLowerCase();
        const found = Object.keys(mdFiles).find(
            (path) => path.startsWith(prefix) && path.toLowerCase().endsWith(`/${normalized}`)
        );
        if (found) {
            activeArticlePath.value = found;
            return;
        }

        // By the slug
        const article = articles.value.find((a) => a.slug === pathOrSlug);
        if (article) {
            activeArticlePath.value = article.path;
        }
    }

    /** Opens the first article when none has been chosen yet */
    function initFirstArticle(): void {
        if (activeArticlePath.value || articles.value.length === 0) {
            return;
        }

        activeArticlePath.value = articles.value[0].path;
    }
    // #endregion

    // #region Lifecycle
    // The headings of the active locale are read lazily, on the first request for them
    watch(
        locale,
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

    // A change of locale keeps the reader on the same article — the one whose file name
    // matches — and falls back to the first article of the new locale
    watch(locale, () => {
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
        hasArticles,
        activeArticlePath,
        articleContent,
        isContentLoading,
        navigateTo,
        initFirstArticle,
    };
}
