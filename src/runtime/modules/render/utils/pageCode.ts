// #region Imports
// Types
import type { IRendererHtmlParts, IRendererPageCode } from '../types/render';
// #endregion

/**
 * Normalizes one piece of page code: blank code counts as no code at all.
 *
 * @param code - Code as stored on the page.
 * @returns The trimmed code, or null.
 */
function normalizePageCode(code: string | null | undefined): string | null {
    return code?.trim() || null;
}

/**
 * Appends the code of a page to the SSR document. The code goes in as raw HTML on
 * purpose: counters and pixels (`<script>`, `<noscript>` with an image) have to be
 * in the served markup to run before hydration, and a parsed-and-rebuilt copy would
 * drop whatever the parser does not know.
 *
 * Appended rather than prepended: the head part lands after the meta tags of the
 * page, the body part after the payload and entry scripts of Nuxt — both of which
 * are deferred, so the code still runs before the app hydrates.
 *
 * @param html - Parts of the SSR document (the Nuxt `render:html` context).
 * @param code - Code of the page.
 */
export function appendPageCodeToHtml(html: IRendererHtmlParts, code: IRendererPageCode): void {
    const head = normalizePageCode(code.head);
    const bodyEnd = normalizePageCode(code.bodyEnd);

    if (head) {
        html.head.push(head);
    }

    if (bodyEnd) {
        html.bodyAppend.push(bodyEnd);
    }
}

/**
 * Inserts page code at the end of a live document element so that its scripts run.
 *
 * `createContextualFragment` instead of `innerHTML`: scripts parsed by `innerHTML`
 * never execute, while a contextual fragment leaves them runnable once inserted —
 * without rebuilding every `<script>` by hand. External scripts load asynchronously
 * here, unlike in the served markup; an inline script that calls into one has to
 * queue the call the way analytics snippets already do.
 *
 * @param code - Code to insert (blank code inserts nothing).
 * @param target - Element to append the code to (`document.head` or `document.body`).
 * @returns The inserted top-level nodes, for a later removal.
 */
export function mountPageCode(code: string | null | undefined, target: Element): ChildNode[] {
    const source = normalizePageCode(code);

    if (!source) {
        return [];
    }

    const range = target.ownerDocument.createRange();
    range.selectNodeContents(target);

    const fragment = range.createContextualFragment(source);
    const nodes = Array.from(fragment.childNodes);

    target.append(fragment);

    return nodes;
}
