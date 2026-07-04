// Types
import type { IAppConfig } from '../../../common/types/config';
import type { IMediaUploadOptions } from '../types/media';

// Nuxt
import { useAppConfig } from 'nuxt/app';

// Vue
import { useI18n } from 'vue-i18n';

// Pinia
import { useMediaStore } from '../stores/media';

const BYTES_IN_MB = 1024 * 1024;
const DEFAULT_MAX_IMAGE_SIZE_MB = 10;
const DEFAULT_MAX_VIDEO_SIZE_MB = 100;

/**
 * Логика загрузки файлов в медиа-галерею: лимиты размеров из app config,
 * валидация типа/размера и последовательная загрузка через media store.
 */
export function useMediaUpload(options: IMediaUploadOptions) {
    const appConfig = useAppConfig() as IAppConfig;
    const maxImageSizeMb = appConfig.bricks?.media?.maxUploadSizeMb ?? DEFAULT_MAX_IMAGE_SIZE_MB;
    const maxVideoSizeMb =
        appConfig.bricks?.media?.maxVideoUploadSizeMb ?? DEFAULT_MAX_VIDEO_SIZE_MB;

    const mediaStore = useMediaStore();
    const { t } = useI18n();

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
     * Загружает набор файлов: пропускает неподдерживаемые, репортит превышение
     * лимита через onError, применяет категорию из resolveCategory.
     */
    async function uploadFiles(files: File[]): Promise<void> {
        const category = options.resolveCategory();

        for (const file of files) {
            if (!isSupportedMediaFile(file)) {
                console.warn('[MediaGallery] Skipping unsupported file:', file.name);
                continue;
            }

            const sizeError = validateFileSize(file);
            if (sizeError) {
                options.onError(sizeError);
                continue;
            }

            try {
                await mediaStore.uploadFile(file, category);
            } catch (error) {
                console.error('[MediaGallery] Upload failed for:', file.name, error);
            }
        }
    }

    return { maxImageSizeMb, maxVideoSizeMb, uploadFiles };
}
