/**
 * Nitro plugin writing the third-party code of a published page into the served
 * HTML. The render page puts the code into the request context during SSR (see
 * `useRendererPageCode`); a request that rendered no published page carries none,
 * and the hook leaves its document alone.
 */
import { defineNitroPlugin } from 'nitropack/runtime';
import { appendPageCodeToHtml } from '../../modules/render/utils/pageCode';

export default defineNitroPlugin((nitroApp) => {
    nitroApp.hooks.hook('render:html', (html, { event }) => {
        const code = event.context.bricksPageCode;

        if (code) {
            appendPageCodeToHtml(html, code);
        }
    });
});
