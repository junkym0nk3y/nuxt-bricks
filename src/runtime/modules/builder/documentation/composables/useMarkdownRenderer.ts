// #region Imports
// Types
import type MarkdownIt from 'markdown-it';

// Vue
import { ref } from 'vue';

// Composables
import { useBricksAssetUrl } from '../../../common/composables/useBricksAssetUrl';
// #endregion

// #region Data
let mdInstance: MarkdownIt | null = null;
const isLoading = ref(false);
// #endregion

/**
 * Composable для рендеринга markdown через markdown-it.
 * Lazy-загрузка библиотеки при первом вызове.
 */
export function useMarkdownRenderer() {
    // #region Data
    const { resolveAssetUrl } = useBricksAssetUrl();
    // #endregion

    // #region Methods
    /**
     * Инициализирует markdown-it при первом вызове (lazy).
     */
    async function ensureLoaded(): Promise<MarkdownIt> {
        if (mdInstance) {
            return mdInstance;
        }

        isLoading.value = true;
        try {
            const { default: MarkdownItModule } = await import('markdown-it');
            mdInstance = new MarkdownItModule({
                html: true,
                breaks: true,
                linkify: true,
            });
            return mdInstance;
        } finally {
            isLoading.value = false;
        }
    }

    /**
     * Перезаписывает относительные пути к изображениям на публичный URL
     * ассетов модуля (/_bricks/ с учётом app.baseURL).
     *
     * @param html - HTML-строка после рендеринга markdown.
     * @returns HTML с исправленными путями к изображениям.
     */
    function rewriteImagePaths(html: string): string {
        const docsImagesBase = resolveAssetUrl('docs/guide/images/');
        return html.replace(/src="(?:\.\/)?images\//g, `src="${docsImagesBase}`);
    }

    /**
     * Рендерит markdown-строку в HTML.
     *
     * @param raw - Исходный markdown-текст.
     * @returns HTML-строка.
     */
    async function renderMarkdown(raw: string): Promise<string> {
        const md = await ensureLoaded();
        const html = md.render(raw);
        return rewriteImagePaths(html);
    }
    // #endregion

    return {
        renderMarkdown,
        isLoading,
    };
}
