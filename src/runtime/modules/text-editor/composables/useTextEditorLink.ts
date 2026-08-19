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
 * Состояние и операции модалки ссылки для одного TipTap-редактора.
 * Композабл держится рядом с редактором, а не в общем сторе: модалка живёт
 * дольше одного клика, и запрос, привязанный к глобальному состоянию, применял
 * бы ссылку к редактору, который за это время успели уничтожить (выход из
 * inline-редактирования, закрытие развёрнутой модалки).
 *
 * @param editorRef - Ref или getter редактора, к выделению которого применяется ссылка.
 */
export function useTextEditorLink(editorRef: MaybeRefOrGetter<Editor | null>): ITextEditorLink {
    const isLinkModalOpen = ref<boolean>(false);
    const hasLinkAtSelection = ref<boolean>(false);
    const linkValue = ref<ITextEditorLinkValue>({ href: '', openInNewTab: false });

    /**
     * Открывает модалку, подставляя в форму атрибуты ссылки под курсором.
     * Без подстановки правка существующей ссылки означала бы набор адреса заново.
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
     * Закрывает модалку и возвращает фокус в редактор: без возврата курсор
     * остаётся в закрытой форме, и следующий набор текста уходит в никуда.
     */
    function closeLinkModal(): void {
        isLinkModalOpen.value = false;
        toValue(editorRef)?.commands.focus();
    }

    /**
     * Применяет ссылку к выделению. Пустое выделение вне ссылки означает, что
     * размечать нечего — тогда адрес вставляется текстом и сразу размечается,
     * иначе кнопка «Применить» молча ничего бы не делала.
     *
     * @param value - Адрес и признак открытия в новой вкладке.
     */
    function applyLink(value: ITextEditorLinkValue): void {
        const editor = toValue(editorRef);

        if (!editor) {
            return;
        }

        const href = normalizeLinkHref(value.href);

        // Последний барьер: форма не пускает запрещённый адрес, но применение
        // вызывается и по Enter в поле
        if (!href) {
            return;
        }

        const attributes = {
            href,
            target: value.openInNewTab ? '_blank' : null,
            rel: value.openInNewTab ? NEW_TAB_LINK_REL : null,
        };
        const isCollapsedOutsideLink = editor.state.selection.empty && !editor.isActive('link');

        // extendMarkRange — чтобы курсор внутри ссылки правил её целиком,
        // а не резал на две с разными адресами
        const chain = editor.chain().focus().extendMarkRange('link');

        if (isCollapsedOutsideLink) {
            chain
                // marks[].attrs — форма ProseMirror-JSON, не то же имя, что в setLink
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

    /**
     * Снимает ссылку целиком, даже если выделения нет и курсор стоит внутри неё.
     */
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
