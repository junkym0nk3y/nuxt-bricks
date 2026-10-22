// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { ITextEditorLink, ITextEditorLinkValue } from '../types/composables';

// Vue
import { ref, toValue, type MaybeRefOrGetter } from 'vue';

// Utils
import { NEW_TAB_LINK_REL, normalizeLinkHref } from '../utils/linkHref';
// #endregion

/**
 * State and operations of the link modal for a single TipTap editor.
 * The composable stays next to the editor instead of living in a shared store: the
 * modal outlives a single click, and a request bound to global state would apply the
 * link to an editor that has been destroyed in the meantime (leaving inline editing,
 * closing the expanded modal).
 *
 * @param editorRef - Ref or getter of the editor whose selection the link applies to.
 */
export function useTextEditorLink(editorRef: MaybeRefOrGetter<Editor | null>): ITextEditorLink {
    const isLinkModalOpen = ref<boolean>(false);
    const hasLinkAtSelection = ref<boolean>(false);
    const linkValue = ref<ITextEditorLinkValue>({ href: '', openInNewTab: false });

    /**
     * Opens the modal, prefilling the form with the attributes of the link under the
     * cursor. Without the prefill, editing an existing link would mean typing the
     * address again from scratch.
     */
    function openLinkModal(): void {
        const editor = toValue(editorRef);

        if (!editor) {
            return;
        }

        const attributes = editor.getAttributes('link');

        linkValue.value = {
            href: typeof attributes.href === 'string' ? attributes.href : '',
            openInNewTab: attributes.target === '_blank',
        };
        hasLinkAtSelection.value = editor.isActive('link');
        isLinkModalOpen.value = true;
    }

    /**
     * Closes the modal and returns the focus to the editor: without that, the cursor
     * stays in the closed form and the next typing goes nowhere.
     */
    function closeLinkModal(): void {
        isLinkModalOpen.value = false;
        toValue(editorRef)?.commands.focus();
    }

    /**
     * Applies the link to the selection. An empty selection outside a link means there
     * is nothing to mark up — then the address is inserted as text and marked up right
     * away, otherwise the "Apply" button would silently do nothing.
     *
     * @param value - The address and the open-in-a-new-tab flag.
     */
    function applyLink(value: ITextEditorLinkValue): void {
        const editor = toValue(editorRef);

        if (!editor) {
            return;
        }

        const href = normalizeLinkHref(value.href);

        // The form checks the address itself, on the button and on Enter alike. The
        // check is repeated because applyLink is a public entry point of the
        // composable: a caller reaching it past the form must not be trusted
        if (!href) {
            return;
        }

        const attributes = {
            href,
            target: value.openInNewTab ? '_blank' : null,
            rel: value.openInNewTab ? NEW_TAB_LINK_REL : null,
        };
        const isCollapsedOutsideLink = editor.state.selection.empty && !editor.isActive('link');

        // extendMarkRange so that a cursor inside a link edits the whole of it
        // instead of cutting it into two with different addresses
        const chain = editor.chain().focus().extendMarkRange('link');

        if (isCollapsedOutsideLink) {
            chain
                // marks[].attrs is the ProseMirror-JSON shape, not the naming setLink uses
                .insertContent({
                    type: 'text',
                    text: href,
                    marks: [{ type: 'link', attrs: attributes }],
                })
                .run();
        } else {
            chain.setLink(attributes).run();
        }

        isLinkModalOpen.value = false;
    }

    /** Removes the link as a whole, even with no selection and the cursor inside it */
    function removeLink(): void {
        toValue(editorRef)?.chain().focus().extendMarkRange('link').unsetLink().run();
        isLinkModalOpen.value = false;
    }

    return {
        isLinkModalOpen,
        linkValue,
        hasLinkAtSelection,
        openLinkModal,
        closeLinkModal,
        applyLink,
        removeLink,
    };
}
