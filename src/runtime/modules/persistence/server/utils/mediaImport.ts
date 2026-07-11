/**
 * Импорт существующих файлов из хранилища публикации в БД медиа
 * (fallback для GET /api/bricks/media при пустой таблице bricks_media).
 */
import { useBricksPublishAdapter, useBricksStorageAdapter } from '../registry';
import { DEFAULT_MEDIA_CATEGORY } from './mediaOrchestration';
import { detectMimeTypeByFilename, fetchSvgContent } from './mediaProcessing';
import { sanitizeSvgMarkup } from '../../../common/utils/sanitize/sanitizeSvg';
import type { IMediaItem } from '../../../common/types/media';
import type { ICreateMediaPayload, IStoredFileInfo } from '../../types/adapters';

/**
 * Строит payload медиа-записи по описанию файла из хранилища.
 *
 * @param file - Описание файла из publish-адаптера.
 * @returns Payload для создания медиа-записи.
 */
async function buildImportPayload(file: IStoredFileInfo): Promise<ICreateMediaPayload> {
    const filename = file.key.split('/').pop() || file.key;
    const mimeType = detectMimeTypeByFilename(filename);
    const svgContent = mimeType === 'image/svg+xml' ? await fetchSvgContent(file.url) : undefined;

    return {
        url: file.url,
        filename,
        alt: '',
        size: file.size,
        mimeType,
        category: DEFAULT_MEDIA_CATEGORY,
        // Файл бакета — недоверенный ввод: в БД сохраняется санитизированный SVG
        svgContent: svgContent ? sanitizeSvgMarkup(svgContent) : null,
        uploadedAt: file.lastModified,
    };
}

/**
 * Импортирует файлы из хранилища публикации в БД. Дедупликация — контрактом
 * идемпотентного `createMedia` (unique url): повторная регистрация возвращает
 * существующую запись, отдельный SELECT на каждый файл не нужен.
 * Если хранилище не сконфигурировано или недоступно — возвращает пустой список.
 *
 * @returns Импортированные медиа-записи.
 */
export async function importMediaFromStorage(): Promise<IMediaItem[]> {
    let files: IStoredFileInfo[];

    try {
        files = await useBricksPublishAdapter().listFiles();
    } catch (error) {
        console.warn('[Media Import] Storage is not available, skipping import:', error);
        return [];
    }

    const storage = useBricksStorageAdapter();
    const importedItems: IMediaItem[] = [];

    for (const file of files) {
        const payload = await buildImportPayload(file);
        importedItems.push(await storage.createMedia(payload));
    }

    return importedItems;
}
