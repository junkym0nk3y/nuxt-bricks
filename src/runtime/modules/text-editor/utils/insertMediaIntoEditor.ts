// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IMediaItem } from '../../common/types/media';
// #endregion

/**
 * Вставляет выбранный медиа-элемент в TipTap-редактор:
 * видео — через setVideo, изображение — через setImage (alt — из meta или filename).
 *
 * @param editor - Активный TipTap-редактор.
 * @param item - Выбранный элемент медиа-галереи.
 */
export function insertMediaIntoEditor(editor: Editor, item: IMediaItem): void {
    if (item.mimeType.startsWith('video/')) {
        editor.chain().focus().setVideo({ src: item.url }).run();
        return;
    }

    editor
        .chain()
        .focus()
        .setImage({
            src: item.url,
            alt: item.alt || item.filename,
        })
        .run();
}
