// #region Imports
// Types
import type { IMediaUrlCopy, IMediaUrlCopyOptions } from '../types/composables';

// Vue
import { useI18n } from 'vue-i18n';
// #endregion

/**
 * Copying the URL of a file into the clipboard, with the message of the outcome.
 *
 * One mechanism for the two surfaces that show a file — the details panel of the
 * dashboard section and the meta panel of the gallery modal — so that both say the same
 * words on success and on a refusal. Where the toast is drawn stays with the surface: the
 * section hands the message up to the dashboard, the modal shows a toast of its own.
 *
 * The URL goes into the clipboard as the file stores it. A refusal of the clipboard (no
 * permission, an insecure context with no `navigator.clipboard` at all) is not thrown on:
 * it becomes the error message, and the button stays usable.
 *
 * @param options - The file and the taker of the message.
 * @returns The handler of the "Copy URL" button.
 */
export function useMediaUrlCopy(options: IMediaUrlCopyOptions): IMediaUrlCopy {
    // #region Data
    const { t } = useI18n();
    // #endregion

    // #region Methods
    /**
     * Copies the URL of the current file; with no file there is nothing to copy and
     * nothing to report.
     */
    async function copyUrl(): Promise<void> {
        const item = options.item();

        if (!item) {
            return;
        }

        try {
            await navigator.clipboard.writeText(item.url);
            options.onNotify(t('bricks.media.details.urlCopied'), 'success');
        } catch {
            options.onNotify(t('bricks.media.details.copyFailed'), 'error');
        }
    }
    // #endregion

    return { copyUrl };
}
