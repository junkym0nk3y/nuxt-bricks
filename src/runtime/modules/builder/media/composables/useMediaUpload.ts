// Types
import type { IAppConfig } from '../../../common/types/config';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type { IMediaUploadProgress } from '../types/media';
import type { IMediaUploadOptions, IMediaUploadQueueEntry } from '../types/composables';

// Utils
import { getBricksErrorMessage } from '../../../common/utils/main';
import {
    DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB,
    DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB,
    DEFAULT_MEDIA_OPTIMIZATION,
    resolveConfiguredMaxWidth,
} from '../../../common/constants/mediaOptimization';

// Nuxt
import { useAppConfig } from 'nuxt/app';

// Vue
import { ref, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';

// Pinia
import { useMediaStore } from '../stores/media';

const BYTES_IN_MB = 1024 * 1024;

/**
 * The logic of uploading files into the media gallery: the size limits and the
 * default optimization parameters out of the app config, the checks of type and
 * size, the progress over a set, and the sequential upload through the media store.
 */
export function useMediaUpload(options: IMediaUploadOptions): {
    maxImageSizeMb: number;
    maxVideoSizeMb: number;
    defaultOptimization: IBricksMediaOptimization;
    uploadProgress: Ref<IMediaUploadProgress | null>;
    uploadFiles: (files: File[]) => Promise<void>;
} {
    const appConfig = useAppConfig() as IAppConfig;
    const mediaConfig = appConfig.bricks?.media;
    const maxImageSizeMb = mediaConfig?.maxUploadSizeMb ?? DEFAULT_MEDIA_MAX_UPLOAD_SIZE_MB;
    const maxVideoSizeMb =
        mediaConfig?.maxVideoUploadSizeMb ?? DEFAULT_MEDIA_MAX_VIDEO_UPLOAD_SIZE_MB;
    /**
     * The defaults of the parameters popover: the config of the module is their one
     * source, and the popover only overrides them for the upload at hand. The
     * fallback values are shared with the server, otherwise the popover would show
     * and send a number of its own while the default of the server was never applied
     * at all.
     *
     * The width goes through the same normalization as on the server: the bounds of
     * the input field are counted from it, and a reading of an unfit value of one's
     * own on each side would pull those bounds apart.
     */
    const defaultOptimization: IBricksMediaOptimization = {
        format: mediaConfig?.optimization?.format ?? DEFAULT_MEDIA_OPTIMIZATION.format,
        quality: mediaConfig?.optimization?.quality ?? DEFAULT_MEDIA_OPTIMIZATION.quality,
        maxWidth: resolveConfiguredMaxWidth(mediaConfig?.optimization?.maxWidth),
    };

    const mediaStore = useMediaStore();
    const { t } = useI18n();
    const uploadProgress = ref<IMediaUploadProgress | null>(null);
    /** The queue of files and the active worker: the interface has one progress bar */
    const queue: IMediaUploadQueueEntry[] = [];
    let activeDrain: Promise<void> | null = null;

    /**
     * Checks that the file is a supported media type (an image or a video).
     */
    function isSupportedMediaFile(file: File): boolean {
        return file.type.startsWith('image/') || file.type.startsWith('video/');
    }

    /**
     * Checks the size of the file and returns an error message when the limit is
     * exceeded.
     */
    function validateFileSize(file: File): string | null {
        const isVideo = file.type.startsWith('video/');
        const maxSizeMb = isVideo ? maxVideoSizeMb : maxImageSizeMb;
        const maxSizeBytes = maxSizeMb * BYTES_IN_MB;

        if (file.size > maxSizeBytes) {
            const fileType = isVideo
                ? t('bricks.media.fileTypeVideo')
                : t('bricks.media.fileTypeImage');
            return t('bricks.media.fileTooLarge', {
                type: fileType,
                name: file.name,
                max: maxSizeMb,
            });
        }

        return null;
    }

    /**
     * Uploads one file, delivering a refusal to the user. Every refusal — an
     * unsupported type, a limit exceeded, a refusal of the server — gets there
     * through `onError`: a silently skipped file would look uploaded.
     *
     * @param entry - The file together with the parameters of its own set.
     */
    async function uploadQueuedFile(entry: IMediaUploadQueueEntry): Promise<void> {
        const { file } = entry;

        if (!isSupportedMediaFile(file)) {
            options.onError(t('bricks.media.fileTypeUnsupported', { name: file.name }));
            return;
        }

        const sizeError = validateFileSize(file);
        if (sizeError) {
            options.onError(sizeError);
            return;
        }

        try {
            await mediaStore.uploadFile(file, entry.category, entry.optimization);
        } catch (error: unknown) {
            console.error('[MediaGallery] Upload failed for:', file.name, error);
            options.onError(
                t('bricks.media.uploadFailedForFile', {
                    name: file.name,
                    message: getBricksErrorMessage(error, t('bricks.media.uploadFailed')),
                })
            );
        }
    }

    /**
     * Works the queue down to the end, keeping one counter across it.
     *
     * One worker for every set rather than a job per set: the interface has one
     * progress bar, and two parallel sets would be sharing it — the `finally` of the
     * first would put the bar out while the second was still uploading. The category
     * and the parameters are remembered at the moment a file is put into the queue,
     * so a change of the filter or of the settings midway does not rewrite a job that
     * has already been taken.
     */
    async function drainQueue(): Promise<void> {
        let processed = 0;

        while (queue.length > 0) {
            const entry = queue.shift();

            if (!entry) {
                break;
            }

            processed += 1;
            uploadProgress.value = {
                current: processed,
                // The total is counted as things stand: the queue could have grown
                // by a new set
                total: processed + queue.length,
                filename: entry.file.name,
            };

            await uploadQueuedFile(entry);
        }

        uploadProgress.value = null;
    }

    /**
     * Puts a set of files into the upload queue and, when no worker is running,
     * starts one. Returns once the whole queue is done — it is enough for the caller
     * to know that its own files have been dealt with.
     */
    async function uploadFiles(files: File[]): Promise<void> {
        const category = options.resolveCategory();
        const optimization = options.resolveOptimization();

        queue.push(...files.map((file) => ({ file, category, optimization })));

        if (activeDrain) {
            await activeDrain;
            return;
        }

        activeDrain = drainQueue();

        try {
            await activeDrain;
        } finally {
            activeDrain = null;
        }
    }

    return { maxImageSizeMb, maxVideoSizeMb, defaultOptimization, uploadProgress, uploadFiles };
}
