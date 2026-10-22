/**
 * The renderer of the articles of the built-in guide.
 *
 * The rule of the heading anchors is checked on its own elsewhere; what is checked
 * here is that the renderer of the modal actually installs it. Without this case the
 * unit of the rule and the corpus run would both stay green while the guide shipped
 * headings with no `id` at all — the state the broken anchor lived in.
 */

// #region Imports
// Vitest
import { describe, expect, it } from 'vitest';

// Renderer
import { useMarkdownRenderer } from '../../src/runtime/modules/builder/documentation/composables/useMarkdownRenderer';
// #endregion

describe('the markdown renderer of the documentation', () => {
    it('puts an anchor on the headings of an article', async () => {
        const { renderMarkdown } = useMarkdownRenderer();

        const html = await renderMarkdown('## Панель инструментов компонента\n');

        expect(html).toContain('id="панель-инструментов-компонента"');
    });

    it('the anchors do not climb over the readings of one instance', async () => {
        // The instance of the parser is cached at the module level and is shared by
        // every opening of the modal: an ordinal kept between the renders would give
        // the same heading a different address on the second reading
        const { renderMarkdown } = useMarkdownRenderer();

        const first = await renderMarkdown('## Repeat\n\n## Repeat\n');
        const second = await renderMarkdown('## Repeat\n\n## Repeat\n');

        expect(second).toBe(first);
    });

    it('the paths of the pictures are still rewritten onto the assets of the module', async () => {
        const { renderMarkdown } = useMarkdownRenderer();

        const html = await renderMarkdown('![diagram](./images/canvas.png)\n');

        expect(html).toContain('src="/_bricks/docs/guide/images/canvas.png"');
    });
});
