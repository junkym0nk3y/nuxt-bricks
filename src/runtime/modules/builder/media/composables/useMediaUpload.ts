// Types
import type { IAppConfig } from '../../../common/types/config';
import type { IBricksMediaOptimization } from '../../../common/types/media';
import type {
    IMediaUploadOptions,
    IMediaUploadProgress,
    IMediaUploadQueueEntry,
} from '../types/media';

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
 * Логика загрузки файлов в медиа-галерею: лимиты размеров и дефолтные параметры
 * оптимизации из app config, валидация типа/размера, прогресс по набору и
 * последовательная загрузка через media store.
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
     * Дефолты поповера параметров: конфиг модуля — единственный их источник,
     * поповер лишь переопределяет их на текущую загрузку. Запасные значения
     * общие с сервером, иначе поповер показывал бы и отправлял своё число, а
     * серверный дефолт не применялся бы вовсе.
     *
     * Ширина проходит ту же нормализацию, что и на сервере: от неё считаются
     * границы поля ввода, и своя трактовка непригодного значения на каждой
     * стороне разводила бы эти границы.
     */
    const defaultOptimization: IBricksMediaOptimization = {
        format: mediaConfig?.optimization?.format ?? DEFAULT_MEDIA_OPTIMIZATION.format,
        quality: mediaConfig?.optimization?.quality ?? DEFAULT_MEDIA_OPTIMIZATION.quality,
        maxWidth: resolveConfiguredMaxWidth(mediaConfig?.optimization?.maxWidth),
    };

    const mediaStore = useMediaStore();
    const { t } = useI18n();
    const uploadProgress = ref<IMediaUploadProgress | null>(null);
    /** Очередь файлов и активный worker: полоса прогресса в интерфейсе одна. */
    const queue: IMediaUploadQueueEntry[] = [];
    let activeDrain: Promise<void> | null = null;

    /**
     * Проверяет, что файл является поддерживаемым медиа-типом (изображение или видео).
     */
    function isSupportedMediaFile(file: File): boolean {
        return file.type.startsWith('image/') || file.type.startsWith('video/');
    }

    /**
     * Валидирует размер файла и возвращает сообщение об ошибке, если лимит превышен.
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
     * Загружает один файл, доставляя отказ пользователю. Любой отказ —
     * неподдерживаемый тип, превышение лимита, отказ сервера — доходит через
     * onError: молча пропущенный файл выглядел бы загруженным.
     *
     * @param entry - Файл вместе с параметрами своего набора.
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
     * Разбирает очередь до конца, ведя сквозной счётчик.
     *
     * Один worker на все наборы, а не задача на набор: полоса прогресса в
     * интерфейсе одна, и два параллельных набора делили бы её — `finally`
     * первого гасил бы полосу, пока второй ещё грузится. Категория и параметры
     * запоминаются на момент добавления файла в очередь, поэтому смена фильтра
     * или настроек по ходу не переписывает уже принятое задание.
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
                // Итог считается по факту: очередь могла подрасти новым набором
                total: processed + queue.length,
                filename: entry.file.name,
            };

            await uploadQueuedFile(entry);
        }

        uploadProgress.value = null;
    }

    /**
     * Ставит набор файлов в очередь загрузки и, если worker не запущен, запускает
     * его. Возвращается по завершении всей очереди — вызывающему достаточно
     * знать, что его файлы обработаны.
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
