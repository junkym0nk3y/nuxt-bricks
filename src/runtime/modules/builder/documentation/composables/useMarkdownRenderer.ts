// #region Imports
// Types
import type MarkdownIt from 'markdown-it';

// Vue
import { ref } from 'vue';
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
     * Перезаписывает относительные пути к изображениям на публичный URL.
     *
     * @param html - HTML-строка после рендеринга markdown.
     * @returns HTML с исправленными путями к изображениям.
     */
    function rewriteImagePaths(html: string): string {
        return html.replace(/src="(?:\.\/)?images\//g, 'src="/docs/guide/images/');
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
