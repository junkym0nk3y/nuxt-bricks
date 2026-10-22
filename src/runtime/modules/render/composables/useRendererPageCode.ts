// #region Imports
// Types
import type { IRendererPageCodeOptions } from '../types/composables';

// Utils
import { mountPageCode } from '../utils/pageCode';

// Vue
import { onMounted, onUnmounted, watch } from 'vue';
import { useRequestEvent } from '#imports';
// #endregion

/**
 * Third-party code of a page (counters, pixels, widgets) on the two surfaces that
 * run it.
 *
 * The published page gets it on the server only: the code goes into the request
 * context, and the Nitro `render:html` hook writes it into the served HTML. Nothing
 * happens on the client — the code is already in the document after a full load,
 * and running it again on client-side navigation would count every visit twice.
 * The other side of that choice: a page reached by client-side navigation does not
 * run its code; a counter installed site-wide tracks such transitions on its own.
 * Nor is the served code removed on leaving: it lives outside the Vue tree, and
 * taking it out would leave the page without its styles and widgets after a
 * client-side return, since the code does not run again. It stays in the document
 * until the next full load, which is what the README tells authors.
 *
 * The preview runs the code on the client once mounted, so it can be checked
 * before going live; the server render of a preview leaves it out. It runs once per
 * opening of the preview, with the code the page has at that moment: the live sync
 * with the builder carries the schema alone and rebuilds the page from the saved
 * data on every update, so following the page would run the saved code over the
 * unsaved one it had just shown. The editor canvas does not render through this
 * page and never runs the code.
 *
 * @param options - The page and whether this is the preview surface.
 */
export function useRendererPageCode(options: IRendererPageCodeOptions): void {
    const { page, isPreview } = options;

    if (import.meta.server) {
        const event = isPreview ? null : useRequestEvent();

        if (event && page.value) {
            event.context.bricksPageCode = {
                head: page.value.headCode,
                bodyEnd: page.value.bodyEndCode,
            };
        }

        return;
    }

    if (!isPreview) {
        return;
    }

    let insertedNodes: ChildNode[] = [];
    let hasRun = false;

    // On mount rather than in setup: the preview sync swaps in the localStorage
    // snapshot from its own mount hook, so the page is the unsaved one by then. A
    // preview that has no page yet runs the code of the first one it gets
    onMounted(() => {
        watch(
            () => page.value,
            (current) => {
                if (hasRun || !current) {
                    return;
                }

                hasRun = true;
                insertedNodes = [
                    ...mountPageCode(current.headCode, document.head),
                    ...mountPageCode(current.bodyEndCode, document.body),
                ];
            },
            { immediate: true }
        );
    });

    onUnmounted(() => {
        insertedNodes.forEach((node) => node.remove());
        insertedNodes = [];
    });
}
