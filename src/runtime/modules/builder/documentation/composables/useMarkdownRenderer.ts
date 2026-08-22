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
 * Rendering of markdown through markdown-it.
 *
 * The library is loaded on the first call: markdown lives in the documentation modal
 * alone, and the builder must not carry a parser it may never open.
 */
export function useMarkdownRenderer() {
    // #region Data
    const { resolveAssetUrl } = useBricksAssetUrl();
    // #endregion

    // #region Methods
    /**
     * Loads markdown-it on the first call and keeps the instance for the next ones.
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
     * Rewrites the relative paths of the images to the public URL of the assets of the
     * module (/_bricks/, with app.baseURL taken into account).
     *
     * @param html - The HTML string produced by rendering the markdown.
     * @returns The HTML with the paths of the images corrected.
     */
    function rewriteImagePaths(html: string): string {
        const docsImagesBase = resolveAssetUrl('docs/guide/images/');
        return html.replace(/src="(?:\.\/)?images\//g, `src="${docsImagesBase}`);
    }

    /**
     * Renders a markdown string into HTML.
     *
     * @param raw - The source markdown text.
     * @returns The HTML string.
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
