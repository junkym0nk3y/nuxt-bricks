// #region Imports
// Types
import type { Editor } from '@tiptap/vue-3';
import type { IMediaItem } from '../../common/types/media';
// #endregion

/**
 * Inserts the chosen media item into the TipTap editor: video through setVideo,
 * an image through setImage (alt taken from the meta or from the filename).
 *
 * @param editor - Active TipTap editor.
 * @param item - Item picked in the media gallery.
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
